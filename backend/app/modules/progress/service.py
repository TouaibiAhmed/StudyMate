"""Learning progress read models: concept states with recent evidence, session history and
weekly activity. Everything is derived from stored attempts/evaluations (FR-08, FR-09, FR-25)."""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import SourceReference
from app.db.base import utcnow
from app.learning.policy import STATUS_LEVEL, ConceptStatus
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import get_owned_course
from app.modules.profile.models import StudentProfile
from app.modules.progress.schemas import (
    ConceptProgressOut,
    CourseProgressOut,
    CourseProgressSummary,
    EvidenceOut,
    HistoryItemOut,
    ProgressOut,
    WeeklyActivityOut,
)
from app.modules.study.models import Activity, Attempt, ConceptProgress, Evaluation, LearningEvidence, StudySession

Range = Literal["7d", "30d", "all"]
_RECENT_EVIDENCE = 5


async def concept_progress(db: AsyncSession, user_id: str, concepts: list[Concept]) -> list[ConceptProgressOut]:
    if not concepts:
        return []
    ids = [c.id for c in concepts]
    states = {p.concept_id: p for p in (await db.execute(
        select(ConceptProgress).where(ConceptProgress.user_id == user_id, ConceptProgress.concept_id.in_(ids))
    )).scalars().all()}
    evidence_rows = (await db.execute(
        select(LearningEvidence, Evaluation, Attempt, Activity)
        .join(Evaluation, Evaluation.id == LearningEvidence.evaluation_id)
        .join(Attempt, Attempt.id == Evaluation.attempt_id)
        .join(Activity, Activity.id == Attempt.activity_id)
        .where(LearningEvidence.user_id == user_id, LearningEvidence.concept_id.in_(ids))
        .order_by(LearningEvidence.created_at.desc())
    )).all()
    recent: dict[str, list[EvidenceOut]] = defaultdict(list)
    for le, ev, att, act in evidence_rows:
        if len(recent[le.concept_id]) < _RECENT_EVIDENCE:
            recent[le.concept_id].append(EvidenceOut(
                id=ev.id, concept_id=le.concept_id, session_id=act.session_id, question=act.prompt, answer=att.answer,
                verdict=ev.verdict, confidence=ev.confidence, strengths=ev.strengths, gaps=ev.gaps,
                missing_ideas=ev.gaps, sources=[SourceReference.model_validate(s) for s in ev.sources or []],
                conditions=le.conditions, created_at=le.created_at,
            ))
    out = []
    for c in concepts:
        p = states.get(c.id)
        status = ConceptStatus(p.status) if p else ConceptStatus.NOT_ENOUGH_EVIDENCE
        count = p.evidence_count if p else 0
        out.append(ConceptProgressOut(
            id=c.id, concept_id=c.id, course_id=c.course_id, name=c.name, title=c.name, status=status.value,
            progress=STATUS_LEVEL[status], evidence_count=count,
            evidence_summary=(f"{count} recorded answer{'s' if count != 1 else ''}. {p.reason}" if p
                              else "No answers recorded yet."),
            reason=p.reason if p else "No answers recorded for this concept yet.",
            recommended_action=p.recommended_action if p else "Start with a short diagnostic question.",
            attempts=recent.get(c.id, []),
        ))
    return out


async def course_progress(db: AsyncSession, user_id: str, course_id: str) -> CourseProgressOut:
    await get_owned_course(db, user_id, course_id)
    concepts = (await db.execute(
        select(Concept).where(Concept.course_id == course_id).order_by(Concept.position, Concept.created_at)
    )).scalars().all()
    items = await concept_progress(db, user_id, list(concepts))
    return CourseProgressOut(
        course_id=course_id, concepts=items,
        summary=CourseProgressSummary(
            total_concepts=len(items),
            mastered=sum(1 for i in items if i.status == ConceptStatus.GOOD_EVIDENCE),
            needs_practice=sum(1 for i in items if i.status == ConceptStatus.NEEDS_PRACTICE),
        ),
    )


def _since(range_: Range) -> datetime | None:
    return None if range_ == "all" else utcnow() - timedelta(days=7 if range_ == "7d" else 30)


async def session_history(db: AsyncSession, user_id: str, *, since: datetime | None = None,
                          course_id: str | None = None, limit: int = 20) -> list[HistoryItemOut]:
    stmt = select(StudySession, Course.title).outerjoin(Course, Course.id == StudySession.course_id).where(
        StudySession.user_id == user_id, StudySession.status.in_(["active", "completed"]))
    if since is not None:
        stmt = stmt.where(StudySession.created_at >= since)
    if course_id:
        stmt = stmt.where(StudySession.course_id == course_id)
    sessions = (await db.execute(stmt.order_by(StudySession.created_at.desc()).limit(limit))).all()
    if not sessions:
        return []
    ids = [s.id for s, _ in sessions]
    rows = (await db.execute(
        select(Activity.session_id, Attempt.created_at, Evaluation.verdict)
        .join(Attempt, Attempt.activity_id == Activity.id)
        .join(Evaluation, Evaluation.attempt_id == Attempt.id)
        .where(Activity.session_id.in_(ids)).order_by(Attempt.created_at)
    )).all()
    per: dict[str, list[tuple[datetime, str]]] = defaultdict(list)
    for sid, at, verdict in rows:
        per[sid].append((at, verdict))
    out = []
    for s, course_title in sessions:
        answers = per.get(s.id, [])
        if not answers and s.status != "completed":
            continue  # nothing happened in it yet
        end = s.completed_at or (answers[-1][0] if answers else None)
        start = s.started_at or s.created_at
        correct = sum(1 for _, v in answers if v == "correct")
        out.append(HistoryItemOut(
            id=s.id, session_id=s.id, course_id=s.course_id, course=course_title, title=s.topic,
            duration_seconds=int((end - start).total_seconds()) if end else 0,
            outcome=f"{len(answers)} answer{'s' if len(answers) != 1 else ''} · {correct} correct",
            verdict=answers[-1][1] if answers else None, completed=s.status == "completed",
            completed_at=s.completed_at, date=(end or start).isoformat(),
        ))
    return out


async def weekly_activity(db: AsyncSession, user_id: str, tz: str) -> list[WeeklyActivityOut]:
    """Last 7 days in the student's time zone, from the shared activity timeline (study answers,
    quizzes, exams and chat), so the dashboard and this page always agree."""
    from app.modules.dashboard.activity import daily_activity, today_in  # local import: dashboard is later

    today = today_in(tz)
    stats = await daily_activity(db, user_id, tz, days=8)
    out = []
    for i in range(7):
        day = today - timedelta(days=6 - i)
        s = stats.get(day)
        out.append(WeeklyActivityOut(day=day.strftime("%a"), date=day.isoformat(), sessions=s.sessions if s else 0,
                                     questions=s.questions if s else 0, minutes=s.minutes if s else 0))
    return out


async def progress_overview(db: AsyncSession, user_id: str, range_: Range = "7d",
                            course_id: str | None = None) -> ProgressOut:
    since = _since(range_)
    if course_id:
        await get_owned_course(db, user_id, course_id)
    concept_stmt = select(Concept).join(Course, Course.id == Concept.course_id).where(Course.user_id == user_id)
    if course_id:
        concept_stmt = concept_stmt.where(Concept.course_id == course_id)
    concepts = (await db.execute(concept_stmt.order_by(Course.title, Concept.position))).scalars().all()
    profile = await db.get(StudentProfile, user_id)
    history = await session_history(db, user_id, since=since, course_id=course_id)

    answered_stmt = select(func.count(Attempt.id)).join(Activity, Activity.id == Attempt.activity_id).join(
        StudySession, StudySession.id == Activity.session_id).where(Attempt.user_id == user_id)
    if since is not None:
        answered_stmt = answered_stmt.where(Attempt.created_at >= since)
    if course_id:
        answered_stmt = answered_stmt.where(StudySession.course_id == course_id)
    weekly = await weekly_activity(db, user_id, profile.time_zone if profile else "UTC")
    return ProgressOut(
        study_minutes=sum(max(1, h.duration_seconds // 60) for h in history if h.duration_seconds),
        sessions_completed=sum(1 for h in history if h.completed),
        questions_answered=(await db.execute(answered_stmt)).scalar_one(),
        concepts=await concept_progress(db, user_id, list(concepts)),
        recent_sessions=history[:10],
        weekly_activity=weekly,
    )
