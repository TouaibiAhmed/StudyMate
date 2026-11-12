"""Concept extraction job: outline -> concept extractor agent -> deduplicated concepts linked to
the pages that cover them."""

import logging

from sqlalchemy import func, select, text, update

from app.ai.agents.base import LearnerContext
from app.ai.agents.concept_extractor import ConceptExtractor, ExtractedConcept
from app.ai.embeddings import get_embedder
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError, LLMUnavailableError
from app.jobs.models import Job, JobStatus
from app.jobs.registry import JobContext, RetryableJobError, job_handler
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import normalize_name
from app.modules.documents.jobs import EXTRACT_CONCEPTS_JOB
from app.modules.documents.models import Chunk, Document
from app.modules.profile.models import StudentProfile

log = logging.getLogger(__name__)

_MAX_OUTLINE_LINES = 60
_MAX_OUTLINE_CHARS = 3500
_GENERIC = {"introduction", "contents", "table of contents", "summary", "conclusion", "references",
            "bibliography", "exercises", "appendix", "index", "preface", "acknowledgements", "questions"}


def build_outline(outline: list[dict], chunk_openings: list[tuple[int, str]]) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for entry in outline:
        title = str(entry.get("title", "")).strip()
        key = normalize_name(title)
        if not key or key in seen or key in _GENERIC or len(lines) >= _MAX_OUTLINE_LINES:
            continue
        seen.add(key)
        indent = "  " * max(0, min(int(entry.get("level", 1)), 4) - 1)
        lines.append(f"{indent}- {title} (p. {entry.get('page', '?')})")
    if len(lines) < 3:  # no usable structure: show the opening of passages spread over the document
        lines = [f"- p. {page}: {opening}" for page, opening in chunk_openings]
    out = "\n".join(lines)
    return out[:_MAX_OUTLINE_CHARS]


async def _finish_course_status(ctx: JobContext, course_id: str, *, failed: bool) -> None:
    """The course is 'processing' while any other extraction for it is still pending."""
    async with ctx.sessions() as db:
        pending = (await db.execute(
            select(func.count(Job.id)).where(
                Job.kind == EXTRACT_CONCEPTS_JOB, Job.subject == f"course:{course_id}", Job.id != ctx.job.id,
                Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
            )
        )).scalar_one()
        if not pending:
            await db.execute(update(Course).where(Course.id == course_id)
                             .values(concepts_status="failed" if failed else "ready"))
            await db.commit()


@job_handler(EXTRACT_CONCEPTS_JOB)
async def extract_concepts(ctx: JobContext) -> dict:
    course_id, document_id = ctx.payload["course_id"], ctx.payload["document_id"]
    async with ctx.sessions() as db:
        course = await db.get(Course, course_id)
        doc = await db.get(Document, document_id)
        if course is None or doc is None or doc.status != "ready":
            if course is not None:
                await _finish_course_status(ctx, course_id, failed=False)
            return {"skipped": "course or document no longer available"}
        profile = await db.get(StudentProfile, course.user_id)
        existing = (await db.execute(select(Concept).where(Concept.course_id == course_id))).scalars().all()
        openings = (await db.execute(
            select(Chunk.page_start, func.left(Chunk.text, 160)).where(Chunk.document_id == document_id)
            .order_by(Chunk.chunk_index)
        )).all()
        step = max(1, len(openings) // 15)
        outline_text = build_outline(doc.outline or [], [(p, t) for p, t in openings[::step]][:15])
        learner = LearnerContext(domain=course.subject, domain_type=course.domain_type, level=course.level,
                                 language=profile.preferred_language if profile else "English")
        user_id, doc_title = course.user_id, doc.filename
        course_info = {"course_title": course.title, "course_subject": course.subject, "course_level": course.level}
        existing_names = [c.name for c in existing]

    try:
        run = await ConceptExtractor(get_llm()).run(
            learner, user_id=user_id, subject=f"course:{course_id}", document_title=doc_title,
            existing=existing_names, outline=outline_text, **course_info,
        )
    except LLMError as exc:
        if exc.retryable and ctx.job.attempts < ctx.job.max_attempts:
            # A runtime that is down (e.g. Ollama restarting) gets minutes, not seconds, to come back.
            delay = 30 * ctx.job.attempts ** 2 if isinstance(exc, LLMUnavailableError) else None
            raise RetryableJobError(str(exc), delay_s=delay) from exc
        await _finish_course_status(ctx, course_id, failed=True)
        return {"failed": type(exc).__name__}

    created = await _store_concepts(ctx, course_id, user_id, document_id, run.output.concepts, run.prompt_id)
    await _finish_course_status(ctx, course_id, failed=False)
    return {"created": created, "prompt": run.prompt_id}


async def _store_concepts(ctx: JobContext, course_id: str, user_id: str, document_id: str,
                          proposed: list[ExtractedConcept], prompt_id: str) -> int:
    embedder = get_embedder()
    async with ctx.sessions() as db:
        existing = {c.normalized_name: c for c in
                    (await db.execute(select(Concept).where(Concept.course_id == course_id))).scalars().all()}
        position = max((c.position for c in existing.values()), default=-1) + 1
        fresh: list[tuple[Concept, ExtractedConcept]] = []
        for item in proposed:
            key = normalize_name(item.name)
            if not key or key in _GENERIC:
                continue
            if key in existing:
                continue
            concept = Concept(course_id=course_id, user_id=user_id, name=item.name[:120], normalized_name=key,
                              description=item.description, aliases=[], prerequisite_ids=[], source_refs=[],
                              origin="extracted", position=position)
            position += 1
            existing[key] = concept
            fresh.append((concept, item))
        if not fresh:
            return 0

        vectors = await embedder.embed_documents([f"{c.name}: {c.description}" for c, _ in fresh])
        for (concept, _proposal), vec in zip(fresh, vectors, strict=True):
            concept.embedding = vec
            # Pages of this document that best cover the concept become its source references.
            rows = (await db.execute(text(
                "SELECT page_start, page_end FROM chunks WHERE document_id = :doc "
                "ORDER BY embedding <=> CAST(:v AS vector) LIMIT 3"
            ), {"doc": document_id, "v": str(vec)})).all()
            concept.source_refs = [{"documentId": document_id, "pageStart": a, "pageEnd": b} for a, b in rows]
            db.add(concept)
        await db.flush()

        for concept, proposal in fresh:
            concept.prerequisite_ids = [
                existing[k].id for k in (normalize_name(p) for p in proposal.prerequisites)
                if k in existing and existing[k].id != concept.id
            ]
        await db.commit()
        log.info("Stored %d concepts for course %s (%s)", len(fresh), course_id, prompt_id)
        return len(fresh)
