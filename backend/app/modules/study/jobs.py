"""Background generation of study activities (the tutor role is slow on a local model, so it never
runs inside a request)."""

import logging

from sqlalchemy import select

from app.ai.agents.base import LearnerContext
from app.ai.agents.tutor import Tutor
from app.ai.embeddings import get_embedder
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError, LLMUnavailableError
from app.core.config import get_settings
from app.db.base import utcnow
from app.jobs.registry import JobContext, RetryableJobError, job_handler
from app.learning.policy import ConceptState, ConceptStatus, LastResult, NextStep, first_step, next_step
from app.modules.courses.models import Concept, Course
from app.modules.profile.models import StudentProfile
from app.modules.study import learning
from app.modules.study.models import Activity, Attempt, Evaluation, StudySession
from app.modules.study.service import GENERATE_JOB, SESSION_FLOW, SessionState
from app.rag.evidence import EvidenceSet
from app.rag.interfaces import RetrievalParams, RetrievalScope
from app.rag.retriever import PgVectorRetriever

log = logging.getLogger(__name__)


async def _decide(db, s: StudySession, sequence: int) -> NextStep:
    """Policy, not the model, decides what kind of activity comes next."""
    if sequence > 1:
        row = (await db.execute(
            select(Evaluation, Attempt, Activity)
            .join(Attempt, Attempt.id == Evaluation.attempt_id)
            .join(Activity, Activity.id == Attempt.activity_id)
            .where(Activity.session_id == s.id, Activity.sequence == sequence - 1)
            # Route on the latest answer given without reading the full explanation: a correct
            # answer right after reading the solution does not show independent understanding.
            .order_by(Attempt.explanation_viewed, Attempt.created_at.desc()).limit(1)
        )).first()
        if row is not None:
            ev, attempt, prev = row
            return next_step(LastResult(verdict=ev.verdict, difficulty=prev.difficulty, hints_used=attempt.hints_used,
                                        gaps=ev.gaps or [], misconception=ev.misconception))
    if s.concept_id:
        return first_step(await learning.current_state(db, s.user_id, s.concept_id))
    return first_step(ConceptState(ConceptStatus.NOT_ENOUGH_EVIDENCE, None, 0, 0, "", ""))


@job_handler(GENERATE_JOB)
async def generate_activity(ctx: JobContext) -> dict:
    session_id, sequence = ctx.payload["session_id"], int(ctx.payload["sequence"])
    async with ctx.sessions() as db:
        s = await db.get(StudySession, session_id)
        if s is None or SESSION_FLOW.is_terminal(SessionState(s.status)):
            return {"skipped": "session closed"}
        existing = (await db.execute(
            select(Activity).where(Activity.session_id == s.id, Activity.sequence == sequence)
        )).scalar_one_or_none()
        if existing is not None and existing.status == "ready":
            return {"skipped": "already generated"}

        step = await _decide(db, s, sequence)
        course = await db.get(Course, s.course_id) if s.course_id else None
        concept = await db.get(Concept, s.concept_id) if s.concept_id else None
        profile = await db.get(StudentProfile, s.user_id)
        previous = (await db.execute(
            select(Activity.prompt).where(Activity.session_id == s.id, Activity.status == "ready")
            .order_by(Activity.sequence)
        )).scalars().all()

        evidence = EvidenceSet()
        if course is not None:
            settings = get_settings()
            query = f"{s.topic}: {concept.description}" if concept and concept.description else s.topic
            if step.focus:
                query = f"{query}. {step.focus}"
            evidence = await PgVectorRetriever(db, get_embedder()).retrieve(
                query, RetrievalScope(user_id=s.user_id, course_id=course.id),
                RetrievalParams(top_k=settings.retrieval_top_k, min_score=settings.retrieval_min_score),
            )
        learner = LearnerContext(
            domain=course.subject if course else (profile.field_of_study if profile else s.topic),
            domain_type=course.domain_type if course else (profile.domain_type if profile else "conceptual"),
            level=profile.level if profile and profile.level else (course.level if course else "Undergraduate"),
            language=profile.preferred_language if profile else "English",
        )
        user_id = s.user_id

    try:
        run = await Tutor(get_llm()).run(
            learner, evidence=evidence, user_id=user_id, subject=f"session:{session_id}",
            concept_name=s.topic, concept_description=concept.description if concept else None,
            activity_type=step.activity_type.value, difficulty=step.difficulty.value, focus=step.focus,
            previous_questions=list(previous)[-4:],
        )
    except LLMError as exc:
        if exc.retryable and ctx.job.attempts < ctx.job.max_attempts:
            delay = 30 * ctx.job.attempts ** 2 if isinstance(exc, LLMUnavailableError) else None
            raise RetryableJobError(str(exc), delay_s=delay) from exc
        async with ctx.sessions() as db:
            s = await db.get(StudySession, session_id)
            if s is not None and s.status == SessionState.PREPARING:
                s.status = SESSION_FLOW.check(SessionState.PREPARING, SessionState.FAILED)
                await db.commit()
        return {"failed": type(exc).__name__}

    spec = run.output
    async with ctx.sessions() as db:
        s = await db.get(StudySession, session_id)
        if s is None or SESSION_FLOW.is_terminal(SessionState(s.status)):
            return {"skipped": "session closed while generating"}
        db.add(Activity(
            session_id=s.id, concept_id=s.concept_id, sequence=sequence, activity_type=step.activity_type.value,
            difficulty=step.difficulty.value, status="ready", reason=step.reason, prompt=spec.question,
            context=spec.context, hints=spec.hints, explanation=spec.explanation,
            rubric=spec.rubric.model_dump(), knowledge_mode=run.knowledge_mode.value,
            sources=[c.model_dump(by_alias=True) for c in run.citations],
            source_chunk_ids=evidence.chunk_ids, prompt_version=run.prompt_id, model=run.model,
        ))
        s.model_calls += 1
        if s.status == SessionState.PREPARING:
            s.status = SESSION_FLOW.check(SessionState.PREPARING, SessionState.ACTIVE)
            s.started_at = utcnow()
            s.knowledge_mode = run.knowledge_mode.value
        await db.commit()
    return {"sequence": sequence, "type": step.activity_type.value, "mode": run.knowledge_mode.value}
