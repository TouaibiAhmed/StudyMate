"""Home dashboard: one read model assembled from stored data (doc section 16).

Every number has a single source: concept levels from the learning profile, minutes/streak/goal from
`activity.daily_activity`, roadmap progress from the roadmap module. The "next step" is chosen by
fixed rules in priority order, so it is explainable and costs no model call.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.modules.auth.models import User
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import _concept_levels, _course_level
from app.modules.dashboard.activity import daily_activity, streak, today_in, week_days
from app.modules.dashboard.schemas import (
    ContinueOut,
    DashboardCourseOut,
    DashboardOut,
    DayOut,
    ExamSuggestionOut,
    NextStepOut,
    PracticeConceptOut,
    RoadmapProgressOut,
    StreakOut,
    WeekGoalOut,
)
from app.modules.documents.models import Document
from app.modules.profile.models import StudentProfile
from app.modules.progress.service import session_history
from app.modules.roadmaps.models import Roadmap, UserRoadmap
from app.modules.study.models import Activity, Attempt, ConceptProgress, StudySession

_PRACTICE_ORDER = {"needs_practice": 0, "developing": 1}
RESUME_WITHIN = timedelta(days=3)


def _part_of_day(tz: str) -> str:
    hour = utcnow().astimezone(ZoneInfo(tz)).hour
    return "morning" if 5 <= hour < 12 else "afternoon" if 12 <= hour < 18 else "evening"


async def _courses(db: AsyncSession, user_id: str) -> tuple[list[Course], list[DashboardCourseOut]]:
    courses = (await db.execute(select(Course).where(Course.user_id == user_id,
                                                     Course.status == "active"))).scalars().all()
    if not courses:
        return [], []
    ids = [c.id for c in courses]
    levels = await _concept_levels(db, user_id, ids)
    last = dict((await db.execute(
        select(StudySession.course_id, func.max(Attempt.created_at))
        .join(Activity, Activity.session_id == StudySession.id).join(Attempt, Attempt.activity_id == Activity.id)
        .where(StudySession.user_id == user_id, StudySession.course_id.in_(ids)).group_by(StudySession.course_id)
    )).all())
    out = [DashboardCourseOut(course_id=c.id, title=c.title, subject=c.subject,
                              progress=_course_level(levels.get(c.id)), concept_count=len(levels.get(c.id, {})),
                              last_activity_at=last.get(c.id))
           for c in courses]
    # Most recently studied first, then newest course.
    created = {c.id: c.created_at for c in courses}
    out.sort(key=lambda c: (c.last_activity_at or created[c.course_id]), reverse=True)
    return list(courses), out


async def _practice(db: AsyncSession, user_id: str, limit: int = 4) -> list[PracticeConceptOut]:
    rows = (await db.execute(
        select(ConceptProgress, Concept, Course.title)
        .join(Concept, Concept.id == ConceptProgress.concept_id).join(Course, Course.id == Concept.course_id)
        .where(ConceptProgress.user_id == user_id, ConceptProgress.status.in_(list(_PRACTICE_ORDER)),
               Course.status == "active")
    )).all()
    rows.sort(key=lambda r: (_PRACTICE_ORDER[r[0].status], -(r[0].last_evidence_at or utcnow()).timestamp()))
    return [PracticeConceptOut(concept_id=c.id, course_id=c.course_id, course=title, name=c.name, status=cp.status,
                               reason=cp.recommended_action or cp.reason) for cp, c, title in rows[:limit]]


async def _continue(db: AsyncSession, user_id: str) -> ContinueOut | None:
    s = (await db.execute(select(StudySession).where(
        StudySession.user_id == user_id, StudySession.status.in_(["preparing", "active", "completed"]))
        .order_by(StudySession.updated_at.desc()).limit(1))).scalar_one_or_none()
    if s is None:
        return None
    answered, last = (await db.execute(
        select(func.count(Attempt.id), func.max(Attempt.created_at)).join(Activity, Activity.id == Attempt.activity_id)
        .where(Activity.session_id == s.id))).one()
    course = await db.get(Course, s.course_id) if s.course_id else None
    return ContinueOut(session_id=s.id, course_id=s.course_id, course=course.title if course else None, topic=s.topic,
                       answered=answered, planned=s.planned_activities, status=s.status,
                       last_activity_at=last or s.updated_at)


async def _roadmap(db: AsyncSession, user_id: str) -> RoadmapProgressOut | None:
    from app.modules.roadmaps.service import get_roadmap  # local import: roadmaps is a later module

    followed = (await db.execute(
        select(UserRoadmap.roadmap_id).join(Roadmap, Roadmap.id == UserRoadmap.roadmap_id)
        .where(UserRoadmap.user_id == user_id, Roadmap.status == "ready")
        .order_by(UserRoadmap.updated_at.desc()).limit(1))).scalar_one_or_none()
    if followed is None:
        return None
    r = await get_roadmap(db, user_id, followed)
    done = [n for n in r.nodes if n.status in ("completed", "known")]
    nxt = next((n.title for n in r.nodes if n.type == "core" and n.status not in ("completed", "known")), None)
    return RoadmapProgressOut(id=r.id, title=r.role, progress=r.progress, completed_topics=len(done),
                              total_topics=len(r.nodes), next_topic=nxt)


async def _exam_suggestion(courses: list[DashboardCourseOut]) -> ExamSuggestionOut | None:
    eligible = [c for c in courses if c.concept_count >= 2]
    if not eligible:
        return None
    best = max(eligible, key=lambda c: (c.progress, c.concept_count))  # test what you studied most
    return ExamSuggestionOut(course_id=best.course_id, title=best.title, concept_count=best.concept_count)


async def _next_step(db: AsyncSession, user_id: str, courses: list[Course], practice: list[PracticeConceptOut],
                     cont: ContinueOut | None, exam: ExamSuggestionOut | None,
                     roadmap: RoadmapProgressOut | None) -> NextStepOut:
    if cont and cont.status in ("preparing", "active") and cont.answered < cont.planned \
            and utcnow() - cont.last_activity_at <= RESUME_WITHIN:
        return NextStepOut(kind="resume_session", title=f"Finish your session on {cont.topic}",
                           detail=f"{cont.answered} of {cont.planned} questions answered.",
                           session_id=cont.session_id, course_id=cont.course_id, href=f"/study/{cont.session_id}")
    if practice:
        p = practice[0]
        verb = "Practise" if p.status == "needs_practice" else "Strengthen"
        return NextStepOut(kind="study_concept", title=f"{verb} {p.name}", detail=p.reason or f"From {p.course}.",
                           course_id=p.course_id, concept_id=p.concept_id)
    if not courses:
        if roadmap and roadmap.next_topic:
            return NextStepOut(kind="roadmap", title=f"Study {roadmap.next_topic}",
                               detail=f"Next core topic of your {roadmap.title} roadmap.",
                               href=f"/roadmaps/{roadmap.id}")
        return NextStepOut(kind="upload", title="Add your first course",
                           detail="Upload a lecture PDF; StudyMate prepares questions, summaries and quizzes from it.",
                           href="/courses")
    ready = (await db.execute(select(func.count()).select_from(Document).where(
        Document.course_id.in_([c.id for c in courses]), Document.status == "ready"))).scalar_one()
    if not ready:
        return NextStepOut(kind="wait_for_material", title="Add or finish preparing your course material",
                           detail="Study sessions use your documents once they are processed.", href="/courses")
    unstudied = (await db.execute(
        select(Concept).outerjoin(ConceptProgress, (ConceptProgress.concept_id == Concept.id)
                                  & (ConceptProgress.user_id == user_id))
        .where(Concept.course_id.in_([c.id for c in courses]), ConceptProgress.concept_id.is_(None))
        .order_by(Concept.position).limit(1))).scalar_one_or_none()
    if unstudied:
        title = next(c.title for c in courses if c.id == unstudied.course_id)
        return NextStepOut(kind="study_concept", title=f"Start {unstudied.name}",
                           detail=f"Not studied yet in {title}.", course_id=unstudied.course_id,
                           concept_id=unstudied.id)
    if exam:
        return NextStepOut(kind="practice_exam", title=f"Test yourself on {exam.title}",
                           detail="Your concepts there have good evidence. A timed practice exam checks it.",
                           course_id=exam.course_id, href="/exams")
    return NextStepOut(kind="upload", title="Add more material",
                       detail="Upload another document to keep learning.", href="/courses")


async def dashboard(db: AsyncSession, user: User) -> DashboardOut:
    profile = await db.get(StudentProfile, user.id)
    tz = profile.time_zone if profile and profile.time_zone else "UTC"
    today = today_in(tz)

    stats = await daily_activity(db, user.id, tz)
    days = week_days(today)
    week = []
    for d in days:
        s = stats.get(d)
        week.append(DayOut(day=d.strftime("%a"), date=d.isoformat(), minutes=s.minutes if s else 0,
                           sessions=s.sessions if s else 0, questions=s.questions if s else 0,
                           active=bool(s and s.active), is_today=d == today, is_future=d > today))
    sessions_this_week = await _sessions_in(db, user.id, tz, days[0])
    st = streak(stats, today)

    course_rows, courses = await _courses(db, user.id)
    practice = await _practice(db, user.id)
    cont = await _continue(db, user.id)
    roadmap = await _roadmap(db, user.id)
    exam = await _exam_suggestion(courses)
    next_step = await _next_step(db, user.id, course_rows, practice, cont, exam, roadmap)
    history = await session_history(db, user.id, limit=4)

    return DashboardOut(
        greeting_name=(user.display_name or "").split(" ")[0] or "there",
        focus=(profile.specialization or profile.field_of_study or None) if profile else None,
        today=today.isoformat(), part_of_day=_part_of_day(tz), time_zone=tz,
        is_first_time=not courses and cont is None and not stats and roadmap is None,
        next_step=next_step, continue_learning=cont, courses=courses[:4], concepts_to_practice=practice,
        recent_sessions=history, week=week, week_minutes=sum(d.minutes for d in week),
        streak=StreakOut(current=st.current, longest=st.longest, active_today=st.active_today,
                         show=profile.show_streaks if profile else True),
        week_goal=WeekGoalOut(target=profile.weekly_goal if profile else 4, done=sessions_this_week),
        roadmap=roadmap, exam_suggestion=exam,
    )


async def _sessions_in(db: AsyncSession, user_id: str, tz: str, monday) -> int:
    """Distinct study sessions with at least one answer since Monday 00:00 local time."""
    from datetime import datetime

    start = datetime.combine(monday, datetime.min.time(), ZoneInfo(tz))
    return (await db.execute(
        select(func.count(func.distinct(Activity.session_id))).join(Attempt, Attempt.activity_id == Activity.id)
        .where(Attempt.user_id == user_id, Attempt.created_at >= start))).scalar_one()
