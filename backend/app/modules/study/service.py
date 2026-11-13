"""Study session orchestrator (doc 9.2-9.3).

    start_session      choose concept -> create session (preparing) -> queue first activity
    [worker]           generate_activity: policy picks the activity type, tutor writes it
    next_activity      serve the next ready activity (or say it is still being prepared)
    submit_attempt     assess -> store attempt, evaluation, evidence -> recompute concept state
                       -> queue the next activity (pre-generated while the student reads feedback)
    complete_session   end of session

Rules that must not depend on the model (allowed transitions, call budget, evidence weights,
next-activity type) are enforced here, never in prompts.
"""

import re
from enum import StrEnum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents.assessment import AnswerEvaluation, Assessor
from app.ai.agents.base import LearnerContext
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError
from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ServiceUnavailableError
from app.core.schemas import SourceReference
from app.db.base import utcnow
from app.jobs.models import Job, JobStatus
from app.jobs.queue import enqueue
from app.learning.policy import ConceptStatus, LastResult, next_step
from app.modules.auth.models import User
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import get_owned_course
from app.modules.profile.models import StudentProfile
from app.modules.study import learning
from app.modules.study.models import Activity, Attempt, ConceptProgress, Evaluation, LearningEvidence, StudySession
from app.modules.study.schemas import (
    ActivityOut,
    AttemptIn,
    EvaluationOut,
    NextActivityOut,
    SessionCreate,
    SessionOut,
)
from app.orchestration.budget import BudgetExceeded
from app.orchestration.state_machine import StateMachine
from app.rag.evidence import scrub_labels
from app.rag.retriever import load_evidence

GENERATE_JOB = "study.generate_activity"
_MIN_ANSWER_WORDS = 3


class SessionState(StrEnum):
    PREPARING = "preparing"
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    FAILED = "failed"


SESSION_FLOW = StateMachine.build(
    "study_session",
    [
        (SessionState.PREPARING, SessionState.ACTIVE),
        (SessionState.PREPARING, SessionState.FAILED),
        (SessionState.ACTIVE, SessionState.COMPLETED),
        (SessionState.ACTIVE, SessionState.ABANDONED),
        (SessionState.PREPARING, SessionState.ABANDONED),
    ],
    terminal=[SessionState.COMPLETED, SessionState.ABANDONED, SessionState.FAILED],
)


def planned_activities(session_length_minutes: int) -> int:
    """Roughly one question per 10-15 minutes of study (questions take a while on a local model)."""
    return {15: 2, 30: 3, 45: 4, 60: 5}.get(session_length_minutes, 3)


# --- serialisation -------------------------------------------------------------------------------

def activity_out(a: Activity, topic: str) -> ActivityOut:
    return ActivityOut(id=a.id, session_id=a.session_id, sequence=a.sequence, type=a.activity_type,
                       difficulty=a.difficulty, topic=topic, prompt=a.prompt, context=a.context, hints=a.hints or [],
                       explanation=a.explanation, sources=a.sources or [], knowledge_mode=a.knowledge_mode,
                       reason=a.reason)


async def _answered_count(db: AsyncSession, session_id: str) -> int:
    return (await db.execute(
        select(func.count(func.distinct(Attempt.activity_id))).join(Activity, Activity.id == Attempt.activity_id)
        .where(Activity.session_id == session_id)
    )).scalar_one()


async def _generation_pending(db: AsyncSession, session_id: str) -> bool:
    return (await db.execute(
        select(func.count(Job.id)).where(Job.kind == GENERATE_JOB, Job.subject == f"session:{session_id}",
                                         Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
    )).scalar_one() > 0


async def session_out(db: AsyncSession, s: StudySession) -> SessionOut:
    activities = (await db.execute(
        select(Activity).where(Activity.session_id == s.id, Activity.status == "ready").order_by(Activity.sequence)
    )).scalars().all()
    course = await db.get(Course, s.course_id) if s.course_id else None
    answered = await _answered_count(db, s.id)
    return SessionOut(
        id=s.id, user_id=s.user_id, course_id=s.course_id, course_title=course.title if course else None,
        concept_id=s.concept_id, topic=s.topic, goal=s.goal, knowledge_mode=s.knowledge_mode, status=s.status,
        activity_number=min(answered + 1, s.planned_activities), activity_total=s.planned_activities,
        activities=[activity_out(a, s.topic) for a in activities],
        preparing=await _generation_pending(db, s.id),
        created_at=s.created_at, started_at=s.started_at, completed_at=s.completed_at,
    )


async def _owned_session(db: AsyncSession, user_id: str, session_id: str) -> StudySession:
    s = (await db.execute(
        select(StudySession).where(StudySession.id == session_id, StudySession.user_id == user_id)
    )).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Study session not found.")
    return s


async def _queue_activity(db: AsyncSession, s: StudySession, sequence: int) -> None:
    """Idempotent: at most one generation job per session at a time, none if the activity exists."""
    exists = (await db.execute(
        select(func.count(Activity.id)).where(Activity.session_id == s.id, Activity.sequence == sequence,
                                              Activity.status == "ready")
    )).scalar_one()
    if exists or await _generation_pending(db, s.id):
        return
    # Interactive work: priority 0 runs before bulk jobs (documents, quizzes, ...).
    await enqueue(db, GENERATE_JOB, {"session_id": s.id, "sequence": sequence}, user_id=s.user_id,
                  subject=f"session:{s.id}", priority=0)


# --- start -----------------------------------------------------------------------------------------

async def _suggest_concept(db: AsyncSession, user_id: str, course_id: str) -> Concept | None:
    """Suggested starting point: needs practice first, then concepts without evidence, in course order."""
    rows = (await db.execute(
        select(Concept, ConceptProgress.status)
        .outerjoin(ConceptProgress, (ConceptProgress.concept_id == Concept.id) & (ConceptProgress.user_id == user_id))
        .where(Concept.course_id == course_id).order_by(Concept.position, Concept.created_at)
    )).all()
    if not rows:
        return None
    rank = {ConceptStatus.NEEDS_PRACTICE: 0, None: 1, ConceptStatus.NOT_ENOUGH_EVIDENCE: 1,
            ConceptStatus.DEVELOPING: 2, ConceptStatus.GOOD_EVIDENCE: 3}
    return min(rows, key=lambda r: rank.get(r[1], 1))[0]


async def start_session(db: AsyncSession, user: User, data: SessionCreate) -> SessionOut:
    course = await get_owned_course(db, user.id, data.course_id) if data.course_id else None
    concept: Concept | None = None
    if data.concept_id:
        concept = await db.get(Concept, data.concept_id)
        if concept is None or course is None or concept.course_id != course.id:
            raise NotFoundError("Concept not found in this course.")
    elif course is not None:
        concept = await _suggest_concept(db, user.id, course.id)

    topic = concept.name if concept else (data.topic or (course.title if course else "")).strip()
    if not topic:
        raise ConflictError("Choose a course, a concept or a topic to study.")
    profile = await db.get(StudentProfile, user.id)
    s = StudySession(
        user_id=user.id, course_id=course.id if course else None, concept_id=concept.id if concept else None,
        topic=topic[:160], goal=(data.goal or f"Explain {topic} clearly in your own words and apply it.")[:300],
        knowledge_mode="course_grounded" if course else "general_knowledge",
        status=SessionState.PREPARING,
        planned_activities=planned_activities(profile.session_length_minutes if profile else 30),
    )
    db.add(s)
    await db.flush()
    await _queue_activity(db, s, 1)
    await db.commit()
    await db.refresh(s)
    return await session_out(db, s)


async def get_session(db: AsyncSession, user_id: str, session_id: str) -> SessionOut:
    return await session_out(db, await _owned_session(db, user_id, session_id))


async def next_activity(db: AsyncSession, user_id: str, session_id: str) -> NextActivityOut:
    s = await _owned_session(db, user_id, session_id)
    if s.status == SessionState.FAILED:
        return NextActivityOut(status="failed", recommended_reason="This session could not be prepared.")
    answered = await _answered_count(db, s.id)
    if answered >= s.planned_activities or SESSION_FLOW.is_terminal(SessionState(s.status)):
        return NextActivityOut(status="complete", is_last=True)
    sequence = answered + 1
    activity = (await db.execute(
        select(Activity).where(Activity.session_id == s.id, Activity.sequence == sequence, Activity.status == "ready")
    )).scalar_one_or_none()
    if activity is None:
        await _queue_activity(db, s, sequence)  # e.g. a lost or failed job: try again
        await db.commit()
        return NextActivityOut(status="preparing", recommended_reason="Preparing your next question…")
    return NextActivityOut(status="ready", activity=activity_out(activity, s.topic),
                           recommended_reason=activity.reason, is_last=sequence >= s.planned_activities)


# --- answers ---------------------------------------------------------------------------------------

_LABEL_SUFFIX = re.compile(r"\s*\((?:missing(?: idea)?|not mentioned|absent)\)\s*$", re.IGNORECASE)
_LABEL_PREFIX = re.compile(r"^\s*(?:missing idea|required idea|gap)\s*:\s*", re.IGNORECASE)


def _norm(text: str) -> str:
    return re.sub(r"[^\w ]", "", text.lower()).strip()


def _consistent(ev: AnswerEvaluation, general_knowledge: bool, rubric: dict | None = None) -> AnswerEvaluation:
    """Deterministic sanity rules on top of the model's judgement (doc 8.5).

    Small local models sometimes echo rubric labels ("(missing idea)", "Acceptable alternative: ...")
    or list a covered idea as missing; the student must only see clean, actionable gaps.
    """
    rubric = rubric or {}
    alternatives = {_norm(a) for a in rubric.get("acceptable_alternatives") or []}
    covered = {_norm(c) for c in ev.covered_ideas}
    gaps: list[str] = []
    for gap in ev.gaps:
        if gap.strip().lower().startswith(("acceptable alternative", "alternative:")):
            continue
        clean = _LABEL_PREFIX.sub("", _LABEL_SUFFIX.sub("", gap)).strip()
        if clean and _norm(clean) not in alternatives and _norm(clean) not in covered and clean not in gaps:
            gaps.append(clean)
    # What the answer got right: the model's strengths, or else the rubric ideas it judged covered.
    strengths = list(ev.strengths) or [f"You explained: {idea}" for idea in ev.covered_ideas]

    verdict, confidence = ev.verdict, ev.confidence
    required = [_norm(r) for r in rubric.get("required_ideas") or []]
    all_covered = bool(required) and len(ev.covered_ideas) >= len(required) and not ev.misconception
    if all_covered and verdict in ("partially_correct", "incorrect"):
        # The model's idea-by-idea judgement is more reliable than its overall impression: an answer
        # that contains every required idea and no wrong statement is correct. Remaining "gaps" are
        # then style remarks ("could be explained more clearly"), not missing ideas.
        verdict, gaps = "correct", []
    if verdict == "correct" and gaps:
        verdict = "partially_correct"  # "correct" with missing ideas is not correct
    if general_knowledge and confidence == "high":
        confidence = "medium"  # model-written rubric without course material
    return ev.model_copy(update={
        "verdict": verdict, "confidence": confidence,
        "gaps": [scrub_labels(g) for g in gaps], "strengths": [scrub_labels(s) for s in strengths],
        "misconception": scrub_labels(ev.misconception) if ev.misconception else None,
    })


def _rule_based(answer: str) -> AnswerEvaluation | None:
    if len(re.findall(r"\w+", answer)) < _MIN_ANSWER_WORDS:
        return AnswerEvaluation(verdict="insufficient_evidence", strengths=[], covered_ideas=[],
                                gaps=["Write at least one full sentence that explains your reasoning."],
                                misconception=None, confidence="high")
    return None


async def submit_attempt(db: AsyncSession, user: User, activity_id: str, data: AttemptIn) -> EvaluationOut:
    activity = await db.get(Activity, activity_id)
    s = await db.get(StudySession, activity.session_id) if activity else None
    if activity is None or s is None or s.user_id != user.id:
        raise NotFoundError("Activity not found.")
    SESSION_FLOW.require(SessionState(s.status), [SessionState.ACTIVE], "answer a question")
    if s.model_calls >= get_settings().session_max_model_calls:
        raise BudgetExceeded()

    course = await db.get(Course, s.course_id) if s.course_id else None
    concept = await db.get(Concept, activity.concept_id) if activity.concept_id else None
    profile = await db.get(StudentProfile, user.id)
    general = activity.knowledge_mode == "general_knowledge"
    previous_attempts = (await db.execute(
        select(func.count(Attempt.id)).where(Attempt.activity_id == activity.id)
    )).scalar_one()

    evaluation = _rule_based(data.answer)
    method, prompt_id, model, citations = "rule", None, None, []
    if evaluation is None:
        evidence = await load_evidence(db, activity.source_chunk_ids or [])
        learner = LearnerContext(
            domain=course.subject if course else (profile.field_of_study if profile else s.topic),
            domain_type=course.domain_type if course else (profile.domain_type if profile else "conceptual"),
            level=profile.level if profile and profile.level else "Undergraduate",
            language=profile.preferred_language if profile else "English",
        )
        try:
            run = await Assessor(get_llm()).run(
                learner, evidence=evidence, user_id=user.id, subject=f"session:{s.id}",
                question=activity.prompt, context=activity.context, rubric=activity.rubric, answer=data.answer,
            )
        except LLMError as exc:
            raise ServiceUnavailableError(
                "Your answer could not be evaluated right now (the AI model is unavailable). It was not saved; "
                "try again in a moment.") from exc
        evaluation = _consistent(run.output, general, activity.rubric)
        method, prompt_id, model, citations = "model", run.prompt_id, run.model, run.citations
        s.model_calls += 1

    required = (activity.rubric or {}).get("required_ideas") or []
    score = round(len(evaluation.covered_ideas) / len(required), 2) if required and method == "model" else None
    is_last = activity.sequence >= s.planned_activities
    step = next_step(LastResult(verdict=evaluation.verdict, difficulty=activity.difficulty,
                                hints_used=data.hints_used, gaps=evaluation.gaps,
                                misconception=evaluation.misconception))

    attempt = Attempt(activity_id=activity.id, user_id=user.id, answer=data.answer,
                      attempt_number=previous_attempts + 1, hints_used=data.hints_used,
                      explanation_viewed=data.explanation_viewed)
    db.add(attempt)
    await db.flush()
    state = None
    if concept is not None:
        state_hint = (await learning.current_state(db, user.id, concept.id)).recommended_action
    else:
        state_hint = ""
    ev_row = Evaluation(attempt_id=attempt.id, verdict=evaluation.verdict, rubric_score=score,
                        strengths=evaluation.strengths, gaps=evaluation.gaps, misconception=evaluation.misconception,
                        confidence=evaluation.confidence, next_activity="", sources=[c.model_dump(by_alias=True)
                                                                                    for c in citations],
                        method=method, prompt_version=prompt_id, model=model)
    db.add(ev_row)
    await db.flush()

    # Evidence: a re-try after reading the full explanation is not independent evidence.
    if concept is not None and not (data.explanation_viewed and previous_attempts > 0):
        db.add(LearningEvidence(user_id=user.id, concept_id=concept.id, course_id=s.course_id,
                                evaluation_id=ev_row.id, verdict=evaluation.verdict,
                                confidence=evaluation.confidence, difficulty=activity.difficulty,
                                hints_used=data.hints_used + (2 if data.explanation_viewed else 0),
                                conditions="practice", knowledge_mode=activity.knowledge_mode))
        state = await learning.recompute(db, user.id, concept.id)
        state_hint = state.recommended_action

    if is_last:
        ev_row.next_activity = f"That was the last question of this session. {state_hint}".strip()
    else:
        ev_row.next_activity = step.reason
        if previous_attempts == 0:
            await _queue_activity(db, s, activity.sequence + 1)
    s.updated_at = utcnow()
    await db.commit()
    await db.refresh(ev_row)
    return EvaluationOut(
        id=ev_row.id, activity_id=activity.id, concept_id=activity.concept_id,
        domain_type=course.domain_type if course else "conceptual", verdict=ev_row.verdict,
        rubric_score=ev_row.rubric_score, strengths=ev_row.strengths, gaps=ev_row.gaps, missing_ideas=ev_row.gaps,
        misconception=ev_row.misconception, confidence=ev_row.confidence, next_activity=ev_row.next_activity,
        evidence=[SourceReference.model_validate(c) for c in ev_row.sources],
        concept_status=state.status.value if state else None, created_at=ev_row.created_at,
    )


async def complete_session(db: AsyncSession, user_id: str, session_id: str) -> SessionOut:
    s = await _owned_session(db, user_id, session_id)
    if s.status == SessionState.ACTIVE:
        answered = await _answered_count(db, s.id)
        target = SessionState.COMPLETED if answered else SessionState.ABANDONED
        s.status = SESSION_FLOW.check(SessionState.ACTIVE, target)
        s.completed_at = utcnow()
        await db.commit()
    elif s.status == SessionState.PREPARING:
        s.status = SESSION_FLOW.check(SessionState.PREPARING, SessionState.ABANDONED)
        s.completed_at = utcnow()
        await db.commit()
    await db.refresh(s)
    return await session_out(db, s)
