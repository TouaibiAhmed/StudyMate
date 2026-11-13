"""Daily learning activity, study time and streaks, derived from what is stored.

Nothing here is a counter that can drift: every number is recomputed from study answers, quiz and
exam attempts and chat questions, in the student's own time zone.

Study time is estimated as the union of intervals:
  * study answer   from the previous answer of the same session (or the session start) when that is
                   at most IDLE_GAP earlier, otherwise READ_TIME before the answer
  * quiz attempt   started -> submitted, capped at QUIZ_CAP
  * exam attempt   started -> submitted (the timer is real time spent)
  * chat question  CHAT_TIME before the message
Overlapping intervals count once, so two tabs never double the minutes.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.modules.chat.models import Conversation, Message
from app.modules.exams.models import ExamAttempt
from app.modules.study.models import Activity, Attempt, StudySession
from app.modules.study_tools.models import QuizAttempt

IDLE_GAP = timedelta(minutes=15)
READ_TIME = timedelta(minutes=2)
CHAT_TIME = timedelta(minutes=1)
QUIZ_CAP = timedelta(minutes=60)
HISTORY_DAYS = 400  # enough for the longest streak of a school year


@dataclass
class DayActivity:
    day: date
    minutes: int = 0
    sessions: int = 0  # study sessions with at least one answer that day
    questions: int = 0  # study answers submitted that day
    quizzes: int = 0
    exams: int = 0
    chat_questions: int = 0

    @property
    def active(self) -> bool:
        return bool(self.questions or self.quizzes or self.exams or self.chat_questions)


@dataclass
class Streak:
    current: int
    longest: int
    active_today: bool


def _merge(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    merged: list[tuple[datetime, datetime]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _split_by_day(intervals: list[tuple[datetime, datetime]], zone: ZoneInfo) -> dict[date, float]:
    """Seconds per local day (an interval crossing midnight is split)."""
    out: dict[date, float] = defaultdict(float)
    for start, end in intervals:
        start, end = start.astimezone(zone), end.astimezone(zone)
        while start.date() < end.date():
            midnight = datetime.combine(start.date() + timedelta(days=1), datetime.min.time(), zone)
            out[start.date()] += (midnight - start).total_seconds()
            start = midnight
        out[start.date()] += (end - start).total_seconds()
    return out


async def daily_activity(db: AsyncSession, user_id: str, tz: str, *,
                         days: int = HISTORY_DAYS) -> dict[date, DayActivity]:
    zone = ZoneInfo(tz)
    since = utcnow() - timedelta(days=days + 1)
    intervals: list[tuple[datetime, datetime]] = []
    stats: dict[date, DayActivity] = {}

    def day_of(at: datetime) -> DayActivity:
        d = at.astimezone(zone).date()
        return stats.setdefault(d, DayActivity(day=d))

    # Study answers, grouped by session to measure the time between answers.
    rows = (await db.execute(
        select(Activity.session_id, Attempt.created_at, StudySession.started_at, StudySession.created_at)
        .join(Attempt, Attempt.activity_id == Activity.id)
        .join(StudySession, StudySession.id == Activity.session_id)
        .where(Attempt.user_id == user_id, Attempt.created_at >= since)
        .order_by(Activity.session_id, Attempt.created_at)
    )).all()
    previous: dict[str, datetime] = {}
    sessions_per_day: dict[date, set[str]] = defaultdict(set)
    for session_id, at, started, created in rows:
        before = previous.get(session_id) or started or created
        start = before if before and timedelta(0) <= at - before <= IDLE_GAP else at - READ_TIME
        intervals.append((start, at))
        previous[session_id] = at
        d = day_of(at)
        d.questions += 1
        sessions_per_day[d.day].add(session_id)
    for d, ids in sessions_per_day.items():
        stats[d].sessions = len(ids)

    quizzes = (await db.execute(select(QuizAttempt.started_at, QuizAttempt.submitted_at).where(
        QuizAttempt.user_id == user_id, QuizAttempt.status == "submitted", QuizAttempt.submitted_at >= since))).all()
    for started, submitted in quizzes:
        intervals.append((max(started, submitted - QUIZ_CAP), submitted))
        day_of(submitted).quizzes += 1

    exams = (await db.execute(select(ExamAttempt.started_at, ExamAttempt.submitted_at).where(
        ExamAttempt.user_id == user_id, ExamAttempt.status == "submitted", ExamAttempt.submitted_at >= since))).all()
    for started, submitted in exams:
        intervals.append((started, max(started, submitted)))
        day_of(submitted).exams += 1

    chats = (await db.execute(
        select(Message.created_at).join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user_id, Message.role == "user", Message.created_at >= since))).scalars().all()
    for at in chats:
        intervals.append((at - CHAT_TIME, at))
        day_of(at).chat_questions += 1

    for d, seconds in _split_by_day(_merge(intervals), zone).items():
        day = stats.setdefault(d, DayActivity(day=d))
        day.minutes = round(seconds / 60)
    return stats


def today_in(tz: str) -> date:
    return utcnow().astimezone(ZoneInfo(tz)).date()


def streak(stats: dict[date, DayActivity], today: date) -> Streak:
    """Consecutive active days. A streak is still alive today until the day ends, so it counts back
    from yesterday when nothing was done yet today."""
    active = sorted(d for d, s in stats.items() if s.active)
    active_set = set(active)
    active_today = today in active_set
    current, cursor = 0, today if active_today else today - timedelta(days=1)
    while cursor in active_set:
        current += 1
        cursor -= timedelta(days=1)
    longest, run, prev = 0, 0, None
    for d in active:
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        longest, prev = max(longest, run), d
    return Streak(current=current, longest=max(longest, current), active_today=active_today)


def week_days(today: date) -> list[date]:
    """The calendar week (Monday to Sunday) containing today."""
    monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=i) for i in range(7)]
