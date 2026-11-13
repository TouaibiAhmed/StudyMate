"""Background generation of summaries and quizzes, one small model call per section / batch."""

import logging
import math
import re

from sqlalchemy import delete, select, update

from app.ai.agents.base import LearnerContext
from app.ai.agents.study_tools import DraftQuestion, QuizWriter, Summarizer
from app.ai.embeddings import get_embedder
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError, LLMOutputError, LLMUnavailableError
from app.db.base import utcnow
from app.jobs.registry import JobContext, RetryableJobError, job_handler
from app.modules.courses.models import Concept, Course
from app.modules.profile.models import StudentProfile
from app.modules.study_tools.material import MaterialGroup, material_groups, validated_topics
from app.modules.study_tools.models import Quiz, QuizQuestion, Summary
from app.modules.study_tools.service import QUIZ_JOB, SUMMARY_JOB
from app.rag.evidence import scrub_labels

log = logging.getLogger(__name__)

SECTIONS = {"Short": 3, "Medium": 5, "Detailed": 8}
POINTS = {"Short": "2 to 3", "Medium": "3 to 4", "Detailed": "4 to 6"}
QUESTIONS_PER_BATCH = 3
CONCEPT_MATCH_MIN = 0.82  # e5 cosine: a question this close to a concept is about that concept
_LETTER = re.compile(r"^\s*\(?([A-Da-d])[\).:]?\s*$")
_BANNED_OPTIONS = {"all of the above", "none of the above"}


async def _set(ctx: JobContext, model, obj_id: str, **values) -> None:
    async with ctx.sessions() as db:
        await db.execute(update(model).where(model.id == obj_id).values(updated_at=utcnow(), **values))
        await db.commit()


async def _learner(db, course: Course, user_id: str, language: str) -> LearnerContext:
    profile = await db.get(StudentProfile, user_id)
    return LearnerContext(domain=course.subject, domain_type=course.domain_type,
                          level=profile.level if profile and profile.level else course.level, language=language)


def _retry_or_fail(ctx: JobContext, exc: LLMError) -> None:
    if exc.retryable and ctx.job.attempts < ctx.job.max_attempts:
        delay = 30 * ctx.job.attempts ** 2 if isinstance(exc, LLMUnavailableError) else None
        raise RetryableJobError(str(exc), delay_s=delay) from exc


def _merge_sources(existing: list[dict], new: list) -> list[dict]:
    seen = {s.get("locator") for s in existing}
    out = list(existing)
    for c in new:
        d = c.model_dump(by_alias=True)
        if d.get("locator") not in seen:
            seen.add(d.get("locator"))
            out.append(d)
    return out


# --- summaries -------------------------------------------------------------------------------------

@job_handler(SUMMARY_JOB)
async def generate_summary(ctx: JobContext) -> dict:
    summary_id = ctx.payload["summary_id"]
    async with ctx.sessions() as db:
        s = await db.get(Summary, summary_id)
        if s is None:
            return {"skipped": "deleted"}
        course = await db.get(Course, s.course_id)
        topics = await validated_topics(db, s.course_id, s.topic_ids or [])
        groups = await material_groups(db, s.source_document_ids, topics, SECTIONS.get(s.length, 5))
        learner = await _learner(db, course, s.user_id, s.language)
        length, structure, user_id = s.length, s.structure, s.user_id

    # Idempotent restart: a retried job rebuilds the summary from scratch.
    await _set(ctx, Summary, summary_id, status="processing", progress=0.02, sections=[], sources=[], error=None,
               stage=f"Writing section 1 of {len(groups)}")
    sections, sources, prompt_id, failures = [], [], None, 0
    for i, group in enumerate(groups):
        try:
            run = await Summarizer(get_llm()).run(
                learner, evidence=group.evidence, user_id=user_id, subject=f"summary:{summary_id}",
                structure=structure, points_hint=POINTS.get(length, "3 to 4"), focus=group.focus,
            )
        except LLMOutputError:
            failures += 1  # one malformed section should not sink the whole summary
            log.warning("Summary %s: section %d skipped (invalid output)", summary_id, i + 1)
            continue
        except LLMError as exc:
            _retry_or_fail(ctx, exc)
            await _set(ctx, Summary, summary_id, status="failed", stage=None,
                       error="The AI model was unavailable. Try generating the summary again.")
            return {"failed": type(exc).__name__}
        prompt_id = run.prompt_id
        sections.append({"heading": scrub_labels(run.output.heading),
                         "points": [scrub_labels(p) for p in run.output.points]})
        sources = _merge_sources(sources, run.citations)
        async with ctx.sessions() as db:
            if await db.get(Summary, summary_id) is None:
                return {"skipped": "deleted while generating"}
        await _set(ctx, Summary, summary_id, sections=sections, sources=sources, progress=(i + 1) / len(groups),
                   stage=f"Writing section {min(i + 2, len(groups))} of {len(groups)}")

    if not sections:
        await _set(ctx, Summary, summary_id, status="failed", stage=None,
                   error="The summary could not be written from this material. Try again or choose other sources.")
        return {"failed": "no sections"}
    await _set(ctx, Summary, summary_id, status="ready", progress=1.0, stage=None, prompt_version=prompt_id,
               knowledge_mode="course_grounded")
    return {"sections": len(sections), "skipped": failures}


# --- quizzes ---------------------------------------------------------------------------------------

def _key(text: str) -> str:
    """Comparison key: case, spacing and trailing punctuation do not matter."""
    return " ".join(text.lower().split()).strip(" .!?;:")


def normalize_question(q: DraftQuestion, allowed: set[str]) -> DraftQuestion | None:
    """Keep only well-formed questions with a verifiable answer key."""
    if q.type not in allowed or not q.prompt.strip():
        return None
    q = q.model_copy(update={"prompt": scrub_labels(q.prompt), "explanation": scrub_labels(q.explanation)})
    if q.type == "Multiple Choice":
        options = [o.strip() for o in q.options if o.strip()]
        if len(options) != 4 or len({o.lower() for o in options}) != 4:
            return None
        if any(o.lower().rstrip(".") in _BANNED_OPTIONS for o in options):
            return None
        answer = q.answer.strip()
        letter = _LETTER.match(answer)
        if letter:
            answer = options["abcd".index(letter.group(1).lower())]
        key = _key(answer)
        match = [o for o in options if _key(o) == key] or [o for o in options if key and key in _key(o)]
        if len(match) != 1:
            return None  # the answer key must point at exactly one option
        return q.model_copy(update={"options": options, "answer": match[0]})
    if q.type == "True/False":
        value = q.answer.strip().lower().rstrip(".")
        if value not in ("true", "false"):
            return None
        return q.model_copy(update={"options": ["True", "False"], "answer": value.capitalize()})
    ideas = [i.strip() for i in q.required_ideas if i.strip()] or [q.answer.strip()]
    return q.model_copy(update={"options": [], "required_ideas": ideas[:3]})


def _batch_types(types: list[str], start: int, count: int) -> list[str]:
    return [types[(start + i) % len(types)] for i in range(count)]


async def _concept_for_questions(db, course_id: str, prompts: list[str]) -> list[str | None]:
    """Link each question to the closest course concept (if close enough) for learning evidence."""
    concepts = [c for c in (await db.execute(select(Concept).where(Concept.course_id == course_id))).scalars().all()
                if c.embedding is not None]
    if not concepts or not prompts:
        return [None] * len(prompts)
    vectors = await get_embedder().embed_documents(prompts)
    out = []
    for v in vectors:
        best, score = None, 0.0
        for c in concepts:
            sim = sum(float(a) * float(b) for a, b in zip(v, c.embedding, strict=False))
            if sim > score:
                best, score = c.id, sim
        out.append(best if score >= CONCEPT_MATCH_MIN else None)
    return out


@job_handler(QUIZ_JOB)
async def generate_quiz(ctx: JobContext) -> dict:
    quiz_id = ctx.payload["quiz_id"]
    async with ctx.sessions() as db:
        q = await db.get(Quiz, quiz_id)
        if q is None:
            return {"skipped": "deleted"}
        course = await db.get(Course, q.course_id)
        topics = await validated_topics(db, q.course_id, q.topic_ids or [])
        n_batches = math.ceil(q.question_count / QUESTIONS_PER_BATCH)
        groups: list[MaterialGroup] = await material_groups(db, q.source_document_ids, topics, n_batches)
        learner = await _learner(db, course, q.user_id, q.language)
        wanted, types, difficulty, user_id = q.question_count, list(q.question_types), q.difficulty, q.user_id
        await db.execute(delete(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id))
        await db.commit()

    await _set(ctx, Quiz, quiz_id, status="processing", progress=0.02, sources=[], error=None,
               stage=f"Writing questions 1-{min(QUESTIONS_PER_BATCH, wanted)} of {wanted}")
    accepted: list[tuple[DraftQuestion, MaterialGroup, list]] = []
    sources: list[dict] = []
    prompt_id = None
    batch = 0
    max_batches = n_batches + 2  # a couple of extra rounds to replace questions that failed validation
    while len(accepted) < wanted and batch < max_batches:
        group = groups[batch % len(groups)]
        count = min(QUESTIONS_PER_BATCH, wanted - len(accepted))
        try:
            run = await QuizWriter(get_llm()).run(
                learner, evidence=group.evidence, user_id=user_id, subject=f"quiz:{quiz_id}",
                count=count, types=_batch_types(types, len(accepted), count), difficulty=difficulty,
                focus=group.focus, avoid=[a.prompt for a, _, _ in accepted][-8:],
            )
        except LLMOutputError:
            batch += 1
            continue
        except LLMError as exc:
            _retry_or_fail(ctx, exc)
            await _set(ctx, Quiz, quiz_id, status="failed", stage=None,
                       error="The AI model was unavailable. Try generating the quiz again.")
            return {"failed": type(exc).__name__}
        prompt_id = run.prompt_id
        seen = {a.prompt.lower() for a, _, _ in accepted}
        for draft in run.output.questions:
            clean = normalize_question(draft, set(types))
            if clean and clean.prompt.lower() not in seen and len(accepted) < wanted:
                cited = group.evidence.citations(clean.source_labels)
                accepted.append((clean, group, cited))
                seen.add(clean.prompt.lower())
        sources = _merge_sources(sources, run.citations)
        batch += 1
        async with ctx.sessions() as db:
            if await db.get(Quiz, quiz_id) is None:
                return {"skipped": "deleted while generating"}
        done = len(accepted)
        await _set(ctx, Quiz, quiz_id, progress=min(0.95, done / wanted), sources=sources,
                   stage=f"Writing questions {min(done + 1, wanted)}-{min(done + QUESTIONS_PER_BATCH, wanted)} "
                         f"of {wanted}")

    if not accepted:
        await _set(ctx, Quiz, quiz_id, status="failed", stage=None,
                   error="No valid questions could be written from this material. Try again or choose other sources.")
        return {"failed": "no questions"}

    async with ctx.sessions() as db:
        if await db.get(Quiz, quiz_id) is None:
            return {"skipped": "deleted while generating"}
        matched = await _concept_for_questions(db, course.id, [a.prompt for a, g, _ in accepted if not g.concept_id])
        it = iter(matched)
        for position, (draft, group, cited) in enumerate(accepted):
            db.add(QuizQuestion(
                quiz_id=quiz_id, position=position, type=draft.type, prompt=draft.prompt.strip(),
                options=draft.options or None, answer=draft.answer.strip(), explanation=draft.explanation.strip(),
                required_ideas=draft.required_ideas, concept_id=group.concept_id or next(it),
                sources=[c.model_dump(by_alias=True) for c in cited],
            ))
        await db.execute(update(Quiz).where(Quiz.id == quiz_id).values(
            status="ready", progress=1.0, stage=None, question_count=len(accepted), prompt_version=prompt_id,
            knowledge_mode="course_grounded", updated_at=utcnow()))
        await db.commit()
    return {"questions": len(accepted), "requested": wanted}
