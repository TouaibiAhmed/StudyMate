from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.modules.auth.models import User
from app.modules.chat.models import Conversation, Message
from app.modules.dashboard.activity import DayActivity, _merge, _split_by_day, streak, today_in, week_days
from app.modules.exams.models import ExamAttempt, PracticeExam
from app.modules.study.models import Activity, Attempt, ConceptProgress, StudySession
from app.modules.study_tools.models import Quiz, QuizAttempt
from tests.test_exams import course  # noqa: F401 - fixture: a course with 3 extracted concepts

TZ = ZoneInfo("Africa/Tunis")  # the time zone in tests.conftest.SIGNUP

# --- Pure functions ----------------------------------------------------------------------------------


def active(*days: date) -> dict[date, DayActivity]:
    return {d: DayActivity(day=d, questions=1) for d in days}


def test_streak_rules():
    today = date(2026, 11, 14)
    d = lambda n: today - timedelta(days=n)  # noqa: E731
    assert streak(active(d(0), d(1), d(2)), today).current == 3
    # Nothing yet today: yesterday's streak is still alive until the day ends.
    s = streak(active(d(1), d(2)), today)
    assert (s.current, s.active_today) == (2, False)
    assert streak(active(d(2), d(3)), today).current == 0  # a missed day breaks it
    s = streak(active(d(0), d(5), d(6), d(7), d(8)), today)
    assert (s.current, s.longest) == (1, 4)
    assert streak({d(0): DayActivity(day=d(0), minutes=10)}, today).current == 0  # minutes alone are not activity
    assert streak({}, today).current == 0


def test_intervals_merge_and_split_at_local_midnight():
    t = datetime(2026, 11, 13, 22, 50, tzinfo=UTC)  # 23:50 in Tunis
    merged = _merge([(t, t + timedelta(minutes=30)), (t + timedelta(minutes=10), t + timedelta(minutes=20))])
    assert merged == [(t, t + timedelta(minutes=30))]  # overlap counted once
    per_day = _split_by_day(merged, TZ)
    assert per_day == {date(2026, 11, 13): 600.0, date(2026, 11, 14): 1200.0}


def test_week_days_start_on_monday():
    days = week_days(date(2026, 11, 14))  # a Saturday
    assert days[0] == date(2026, 11, 9) and days[0].weekday() == 0 and len(days) == 7


# --- API ----------------------------------------------------------------------------------------------


def local(day: date, hour: int, minute: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=TZ)


@pytest.mark.integration
async def test_new_student_dashboard(api):
    from tests.test_courses_documents import login_new_user

    await login_new_user(api)
    d = (await api.get("/api/dashboard")).json()
    assert d["isFirstTime"] is True and d["greetingName"] == "Ada"
    assert d["nextStep"]["kind"] == "upload"
    assert d["streak"] == {"current": 0, "longest": 0, "activeToday": False, "show": True}
    assert d["weekGoal"] == {"target": 4, "done": 0}
    assert len(d["week"]) == 7 and sum(day["isToday"] for day in d["week"]) == 1
    assert d["week"][0]["day"] == "Mon" and d["weekMinutes"] == 0
    assert d["today"] == today_in("Africa/Tunis").isoformat() and d["timeZone"] == "Africa/Tunis"
    assert d["continueLearning"] is None and d["roadmap"] is None


@pytest.mark.integration
async def test_numbers_match_stored_activity(api, course, db_ready):  # noqa: F811
    today = today_in("Africa/Tunis")
    yesterday, two_days = today - timedelta(days=1), today - timedelta(days=2)
    backprop = next(c for c in course["concepts"] if c["name"] == "Backpropagation")
    async with db_ready() as db:
        user_id = (await db.execute(select(User.id))).scalar_one()
        # Today: a study session started 00:05, answers at 00:10, 00:14, 00:20 -> 15 minutes.
        s = StudySession(user_id=user_id, course_id=course["id"], concept_id=backprop["id"], topic="Backpropagation",
                         goal="g", knowledge_mode="course_grounded", status="completed", planned_activities=3,
                         started_at=local(today, 0, 5), completed_at=local(today, 0, 20))
        db.add(s)
        await db.flush()
        for i, minute in enumerate((10, 14, 20)):
            a = Activity(session_id=s.id, concept_id=backprop["id"], sequence=i + 1, activity_type="explain",
                         difficulty="intermediate", prompt="q", knowledge_mode="course_grounded")
            db.add(a)
            await db.flush()
            db.add(Attempt(activity_id=a.id, user_id=user_id, answer="x", created_at=local(today, 0, minute)))
        # Yesterday: one chat question at 23:59 (1 min) ...
        conv = Conversation(user_id=user_id)
        db.add(conv)
        await db.flush()
        db.add(Message(conversation_id=conv.id, role="user", content="?", created_at=local(yesterday, 23, 59)))
        db.add(Message(conversation_id=conv.id, role="assistant", content="!", created_at=local(yesterday, 23, 59)))
        # ... and an exam from 23:50 two days ago to 00:20 yesterday: 10 + 20 minutes, counted when submitted.
        exam = PracticeExam(user_id=user_id, course_id=course["id"], title="e", topic_ids=[], question_count=2,
                            time_limit_s=3600, status="ready")
        db.add(exam)
        await db.flush()
        db.add(ExamAttempt(exam_id=exam.id, user_id=user_id, course_id=course["id"], status="submitted",
                           started_at=local(two_days, 23, 50), deadline_at=local(yesterday, 0, 50),
                           submitted_at=local(yesterday, 0, 20)))
        # Ten days ago: a quiz (3 days in a row with chat before it) -> longest streak 3.
        quiz = Quiz(user_id=user_id, course_id=course["id"], title="q", question_count=3, difficulty="Easy")
        db.add(quiz)
        await db.flush()
        ten = today - timedelta(days=10)
        db.add(QuizAttempt(quiz_id=quiz.id, user_id=user_id, status="submitted", started_at=local(ten, 9, 0),
                           submitted_at=local(ten, 9, 12)))
        for n in (11, 12):
            db.add(Message(conversation_id=conv.id, role="user", content="?",
                           created_at=local(today - timedelta(days=n), 12, 0)))
        db.add(ConceptProgress(user_id=user_id, concept_id=backprop["id"], status="needs_practice", evidence_count=2,
                               reason="r", recommended_action="Explain how the chain rule is used.",
                               last_evidence_at=local(today, 0, 20)))
        await db.commit()

    d = (await api.get("/api/dashboard")).json()
    week = {day["date"]: day for day in d["week"]}
    assert week[today.isoformat()]["minutes"] == 15
    assert (week[today.isoformat()]["sessions"], week[today.isoformat()]["questions"]) == (1, 3)
    if yesterday.isoformat() in week:  # not on Mondays (yesterday is last week)
        assert week[yesterday.isoformat()]["minutes"] == 21
    if two_days.isoformat() in week:
        assert week[two_days.isoformat()]["minutes"] == 10 and not week[two_days.isoformat()]["active"]
    assert d["weekMinutes"] == sum(day["minutes"] for day in d["week"])
    assert d["streak"] == {"current": 2, "longest": 3, "activeToday": True, "show": True}
    assert d["weekGoal"]["done"] == 1
    assert d["isFirstTime"] is False

    assert d["nextStep"]["kind"] == "study_concept" and d["nextStep"]["conceptId"] == backprop["id"]
    assert d["nextStep"]["title"] == "Practise Backpropagation"
    assert [c["name"] for c in d["conceptsToPractice"]] == ["Backpropagation"]
    assert d["conceptsToPractice"][0]["course"] == "Deep Learning"
    c = d["courses"][0]
    assert (c["title"], c["conceptCount"], c["progress"]) == ("Deep Learning", 3, round(25 / 3))
    assert c["lastActivityAt"] is not None
    cont = d["continueLearning"]
    assert (cont["topic"], cont["answered"], cont["planned"], cont["status"]) == ("Backpropagation", 3, 3, "completed")
    assert d["recentSessions"][0]["title"] == "Backpropagation"
    assert d["examSuggestion"]["courseId"] == course["id"]

    # The progress page reports the same minutes for the same days.
    progress = (await api.get("/api/progress")).json()
    for day in progress["weeklyActivity"]:
        if day["date"] in week:
            assert day["minutes"] == week[day["date"]]["minutes"], day

    # Following a roadmap puts it on the dashboard.
    roadmap = next(r for r in (await api.get("/api/roadmaps")).json() if r["role"] == "Data Analyst")
    assert (await api.put(f"/api/roadmaps/{roadmap['id']}/follow")).status_code == 204
    d = (await api.get("/api/dashboard")).json()
    assert d["roadmap"]["title"] == "Data Analyst" and d["roadmap"]["totalTopics"] == 11
    assert d["roadmap"]["nextTopic"] == "Spreadsheets"

    # Hiding streaks is a preference the dashboard reports.
    prefs = (await api.get("/api/preferences")).json()
    assert (await api.put("/api/preferences", json={**prefs, "hideStreaks": True})).status_code == 200
    assert (await api.get("/api/dashboard")).json()["streak"]["show"] is False

    # Another student sees none of it.
    from tests.test_courses_documents import login_new_user

    api.cookies.clear()
    await login_new_user(api, email="mallory@example.com")
    other = (await api.get("/api/dashboard")).json()
    assert other["isFirstTime"] and other["streak"]["current"] == 0 and other["courses"] == []
