"""Roadmap generation job: outline first, then topic details in small batches (doc 15.2)."""

import logging

from sqlalchemy import delete, update

from app.ai.agents.base import LearnerContext
from app.ai.agents.roadmap import OutlineTopic, RoadmapDetailer, RoadmapOutliner
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError, LLMOutputError, LLMUnavailableError
from app.core.config import get_settings
from app.db.base import utcnow
from app.jobs.registry import JobContext, RetryableJobError, job_handler
from app.modules.profile.models import StudentProfile
from app.modules.roadmaps.graph import clean_prerequisites, find_cycle, layout
from app.modules.roadmaps.models import Roadmap, RoadmapNode
from app.modules.roadmaps.service import GENERATE_JOB, slugify

log = logging.getLogger(__name__)
DETAIL_BATCH = 6
MIN_TOPICS, TARGET_MAX_TOPICS = 6, 14
CATEGORY_LABEL = {"data": "Data", "engineering": "Engineering", "machine_learning": "Machine learning",
                  "business": "Business"}


async def _stage(ctx: JobContext, roadmap_id: str, stage: str, progress: float) -> None:
    async with ctx.sessions() as db:
        await db.execute(update(Roadmap).where(Roadmap.id == roadmap_id)
                         .values(stage=stage, progress=progress, updated_at=utcnow()))
        await db.commit()


async def _fail(ctx: JobContext, roadmap_id: str, message: str) -> None:
    async with ctx.sessions() as db:
        await db.execute(update(Roadmap).where(Roadmap.id == roadmap_id)
                         .values(status="failed", stage=None, error=message, updated_at=utcnow()))
        await db.commit()


def clean_outline(topics: list[OutlineTopic], max_nodes: int) -> tuple[list[OutlineTopic], dict[int, list[int]]]:
    """Deduplicate titles, keep the model's order, and keep only edges to earlier topics (a DAG)."""
    seen, kept = set(), []
    for t in topics:
        name = " ".join(t.title.split()).lower()
        if name and name not in seen:
            seen.add(name)
            kept.append(t)
    kept = kept[:max_nodes]
    order = [t.id for t in kept]
    prereqs = clean_prerequisites(order, {t.id: t.prerequisites for t in kept})
    assert find_cycle(prereqs) is None
    return kept, prereqs


def _clean_resource(text: str) -> str | None:
    text = " ".join(text.split()).strip(" -")
    low = text.lower()
    if not text or "http" in low or "www." in low or ".com" in low or len(text) > 160:
        return None
    return text


@job_handler(GENERATE_JOB)
async def generate_roadmap(ctx: JobContext) -> dict:
    roadmap_id = ctx.payload["roadmap_id"]
    async with ctx.sessions() as db:
        r = await db.get(Roadmap, roadmap_id)
        if r is None or r.status != "generating":
            return {"skipped": "deleted or not generating"}
        profile = await db.get(StudentProfile, r.owner_id)
        learner = LearnerContext(
            domain=(profile.field_of_study or profile.domain or "General studies") if profile else "General studies",
            domain_type=profile.domain_type if profile else "conceptual",
            level=(profile.level or "Undergraduate") if profile else "Undergraduate",
            language=profile.preferred_language if profile else "English",
        )
        role, category, goal, user_id = r.role, CATEGORY_LABEL.get(r.category, r.category), r.goal, r.owner_id
        await db.execute(delete(RoadmapNode).where(RoadmapNode.roadmap_id == roadmap_id))
        await db.commit()

    llm = get_llm()
    max_nodes = min(TARGET_MAX_TOPICS, get_settings().roadmap_max_nodes)
    subject = f"roadmap:{roadmap_id}"

    # Pass 1: topics, order and prerequisites.
    await _stage(ctx, roadmap_id, "Planning the topics and their order", 0.05)
    try:
        outline_run = await RoadmapOutliner(llm).run(learner, user_id=user_id, subject=subject, role=role,
                                                     category=category, goal=goal, min_topics=MIN_TOPICS + 2,
                                                     max_topics=max_nodes)
    except LLMError as exc:
        return await _llm_failure(ctx, roadmap_id, exc)
    topics, prereqs = clean_outline(outline_run.output.topics, max_nodes)
    if len(topics) < MIN_TOPICS:
        await _fail(ctx, roadmap_id, "The model proposed too few topics. Try again with a more specific role or goal.")
        return {"failed": "too few topics", "topics": len(topics)}

    # Pass 2: descriptions and resource suggestions, a few topics at a time.
    details: dict[int, tuple[str, list[str]]] = {}
    titles = [t.title for t in topics]
    pending = list(topics)
    retried = False
    while pending:
        batch, pending = pending[:DETAIL_BATCH], pending[DETAIL_BATCH:]
        done = len(details)
        await _stage(ctx, roadmap_id, f"Describing topics {done + 1}-{done + len(batch)} of {len(topics)}",
                     0.25 + 0.7 * done / len(topics))
        try:
            run = await RoadmapDetailer(llm).run(learner, user_id=user_id, subject=subject, role=role,
                                                 all_titles=titles, topics=batch)
            wanted = {t.id for t in batch}
            for d in run.output.topics:
                if d.id in wanted and d.id not in details:
                    details[d.id] = (" ".join(d.description.split()),
                                     [c for c in (_clean_resource(x) for x in d.resources) if c][:2])
        except LLMOutputError:
            pass  # topics without details are retried once below
        except LLMError as exc:
            return await _llm_failure(ctx, roadmap_id, exc)
        if not pending and not retried:
            retried = True
            pending = [t for t in topics if t.id not in details]

    # Save: stable keys from titles, layout computed by code.
    keys: dict[int, str] = {}
    for t in topics:
        base, n = slugify(t.title), 2
        key = base
        while key in keys.values():
            key, n = f"{base}-{n}", n + 1
        keys[t.id] = key
    order = [keys[t.id] for t in topics]
    edges = {keys[t.id]: [keys[p] for p in prereqs[t.id]] for t in topics}
    positions = layout(order, edges)
    async with ctx.sessions() as db:
        r = await db.get(Roadmap, roadmap_id)
        if r is None:
            return {"skipped": "deleted while generating"}
        for i, t in enumerate(topics):
            description, resources = details.get(t.id, ("", []))
            key = keys[t.id]
            db.add(RoadmapNode(roadmap_id=roadmap_id, key=key, position=i, title=t.title.strip()[:160],
                               description=description, optional=t.optional, prerequisites=edges[key],
                               resources=resources, x=positions[key][0], y=positions[key][1]))
        r.description = outline_run.output.description.strip()
        r.status, r.progress, r.stage, r.error = "ready", 1.0, None, None
        r.prompt_version = outline_run.prompt_id
        await db.commit()
    return {"topics": len(topics), "described": len(details)}


async def _llm_failure(ctx: JobContext, roadmap_id: str, exc: LLMError) -> dict:
    if exc.retryable and ctx.job.attempts < ctx.job.max_attempts:
        delay = 30 * ctx.job.attempts ** 2 if isinstance(exc, LLMUnavailableError) else None
        await _stage(ctx, roadmap_id, "Waiting for the AI model, retrying shortly", 0.0)
        raise RetryableJobError(str(exc), delay_s=delay) from exc
    await _fail(ctx, roadmap_id, "The AI model was unavailable or returned an unusable plan. Try again.")
    return {"failed": type(exc).__name__}
