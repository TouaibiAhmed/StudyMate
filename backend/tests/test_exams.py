import json
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.ai.llm.client import LLMClient
from app.ai.llm.types import ModelTier
from app.db.base import utcnow
from app.modules.exams import jobs as exam_jobs
from app.modules.exams.models import ExamAttempt
from app.modules.exams.service import sweep_expired
from app.modules.study.models import LearningEvidence
from tests.fakes import ScriptedProvider
from tests.pdfs import course_pdf
from tests.test_courses_documents import CONCEPTS, create_course, drain_worker, login_new_user, upload

pytestmark = pytest.mark.integration

MCQ = {"type": "Multiple Choice", "prompt": "What does backpropagation compute?",
       "options": ["Gradients of the loss", "The learning rate", "The dataset size", "Batch statistics"],
       "answer": "Gradients of the loss", "explanation": "It applies the chain rule.", "source_labels": ["E1"]}
SHORT = {"type": "Short Answer", "prompt": "Why is the chain rule needed in backpropagation?",
         "answer": "Each layer is a function in a composition, so derivatives multiply.",
         "required_ideas": ["composition of functions", "derivatives multiply"]}
SHORT2 = SHORT | {"prompt": "What is the difference between computing gradients and updating weights?",
                  "required_ideas": ["backprop computes gradients", "optimizer updates weights"]}


def evaluation(verdict, gaps=()):
    return json.dumps({"verdict": verdict, "covered_ideas": ["composition of functions"], "strengths": ["Clear"],
                       "gaps": list(gaps), "misconception": None, "confidence": "medium", "source_labels": []})


@pytest.fixture
def exam_llm(monkeypatch):
    def install(*responses):
        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(exam_jobs, "get_llm", lambda: client)
        return provider
    return install


@pytest.fixture
async def course(api, tmp_path, monkeypatch):
    from app.modules.courses import jobs as course_jobs

    client = LLMClient(ScriptedProvider([json.dumps(CONCEPTS)]), models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
    monkeypatch.setattr(course_jobs, "get_llm", lambda: client)
    await login_new_user(api)
    c = await create_course(api)
    await upload(api, c["id"], course_pdf(tmp_path / "lecture.pdf"))
    await drain_worker()
    c["concepts"] = (await api.get(f"/api/courses/{c['id']}/concepts")).json()
    return c


async def ready_exam(api, course, minutes=20):
    backprop = next(c for c in course["concepts"] if c["name"] == "Backpropagation")
    r = await api.post("/api/exams", json={"courseId": course["id"], "topicIds": [backprop["id"]],
                                           "questionCount": 3, "timeLimitSeconds": minutes * 60})
    assert r.status_code == 202, r.text
    exam = r.json()
    assert (exam["status"], exam["questions"]) == ("preparing", [])
    assert (await api.post(f"/api/exams/{exam['id']}/start")).status_code == 409  # questions first, then the clock
    await drain_worker()
    exam = (await api.get(f"/api/exams/{exam['id']}")).json()
    assert exam["status"] == "ready", exam
    return exam


async def test_options_and_validation(api, course):
    options = (await api.get("/api/exams/options")).json()
    assert options[0]["title"] == "Deep Learning" and len(options[0]["concepts"]) == 3
    no_topics = await api.post("/api/exams", json={"courseId": course["id"], "topicIds": [], "questionCount": 3,
                                                  "timeLimitSeconds": 600})
    assert no_topics.status_code == 422
    too_long = await api.post("/api/exams", json={"courseId": course["id"], "topicIds": [course["concepts"][0]["id"]],
                                                 "questionCount": 3, "timeLimitSeconds": 999 * 60})
    assert too_long.status_code == 422
    foreign = await api.post("/api/exams", json={"courseId": course["id"], "topicIds": ["nope"], "questionCount": 3,
                                                "timeLimitSeconds": 600})
    assert foreign.status_code == 404


async def test_full_exam_flow(api, course, exam_llm, db_ready):
    exam_llm(json.dumps({"questions": [SHORT, MCQ, SHORT2]}),
             evaluation("correct"), evaluation("partially_correct", gaps=["optimizer updates weights"]))
    exam = await ready_exam(api, course)
    assert [q["type"] for q in exam["questions"]] == ["short_answer", "multiple_choice", "short_answer"]
    assert all("answer" not in q and "rubric" not in q for q in exam["questions"])
    assert exam["title"] == "Practice exam: Backpropagation"

    attempt = (await api.post(f"/api/exams/{exam['id']}/start")).json()
    assert attempt["status"] == "in_progress"
    again = (await api.post(f"/api/exams/{exam['id']}/start")).json()
    assert (again["id"], again["deadlineAt"]) == (attempt["id"], attempt["deadlineAt"])  # resume, same deadline

    # Exam rules: no tutor, chat or study session for this course while the exam runs.
    conv = (await api.post("/api/chat/conversations",
                           json={"context": {"type": "course", "courseId": course["id"]}})).json()
    blocked = await api.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "Give me the answer"})
    assert blocked.status_code == 409 and "exam" in blocked.json()["error"]["message"]
    assert (await api.post("/api/sessions", json={"courseId": course["id"]})).status_code == 409

    short_q, mcq_q, short2_q = exam["questions"]
    for q, text, flag in [(short_q, "Layers are a composition of functions, so derivatives multiply.", False),
                          (mcq_q, "Gradients of the loss", True), (short2_q, "", False)]:
        r = await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{q['id']}", json={"answer": text,
                                                                                          "flagged": flag})
        assert r.status_code == 204
    # Overwriting an answer is allowed until the deadline.
    await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{short2_q['id']}",
                  json={"answer": "Backprop computes the gradients.", "flagged": False})
    assert (await api.get(f"/api/exam-attempts/{attempt['id']}/analysis")).status_code == 409  # not submitted

    submitted = (await api.post(f"/api/exam-attempts/{attempt['id']}/submit")).json()
    assert (submitted["status"], submitted["autoSubmitted"]) == ("submitted", False)
    assert (await api.post(f"/api/exam-attempts/{attempt['id']}/submit")).status_code == 409
    late = await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{mcq_q['id']}", json={"answer": "x"})
    assert late.status_code == 409

    grading = (await api.get(f"/api/exam-attempts/{attempt['id']}/analysis")).json()
    assert grading["status"] == "grading" and grading["questionResults"] == []

    await drain_worker()
    analysis = (await api.get(f"/api/exam-attempts/{attempt['id']}/analysis")).json()
    assert analysis["status"] == "graded"
    assert analysis["counts"] == {"correct": 2, "partiallyCorrect": 1, "incorrect": 0, "insufficientEvidence": 0}
    assert (analysis["score"], analysis["scoreLabel"]) == (83.3, "Practice signal: 83%")
    results = {r["questionId"]: r for r in analysis["questionResults"]}
    assert results[mcq_q["id"]]["expectedIdeas"] == ["Gradients of the loss"]
    assert results[short2_q["id"]]["gaps"] == ["optimizer updates weights"]
    assert results[short_q["id"]]["concept"] == "Backpropagation"
    concept = analysis["concepts"][0]
    assert (concept["concept"], concept["correct"], concept["total"]) == ("Backpropagation", 2, 3)
    assert "optimizer updates weights" in concept["summary"]

    async with db_ready() as db:
        conditions = (await db.execute(select(LearningEvidence.conditions))).scalars().all()
    assert conditions == ["exam", "exam", "exam"]  # exam answers feed the profile (FR-22)

    history = (await api.get("/api/exam-attempts")).json()
    assert history[0]["scoreLabel"] == "Practice signal: 83%" and history[0]["exam"]["questionCount"] == 3
    # After the exam, chat works again.
    from app.modules.chat import service as chat_service
    chat_service._message_limiter._events.clear()
    assert (await api.post("/api/sessions", json={"courseId": course["id"]})).status_code == 201


async def test_deadline_is_enforced_by_the_server(api, course, exam_llm, db_ready):
    exam_llm(json.dumps({"questions": [MCQ, SHORT, SHORT2]}), json.dumps({"questions": [MCQ]}))
    exam = await ready_exam(api, course, minutes=1)
    attempt = (await api.post(f"/api/exams/{exam['id']}/start")).json()
    q = exam["questions"][0]
    assert (await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{q['id']}",
                          json={"answer": "Gradients of the loss"})).status_code == 204

    # The clock runs out (simulated): saving is refused and the attempt is auto-submitted.
    async with db_ready() as db:
        await db.execute(update(ExamAttempt).values(deadline_at=utcnow() - timedelta(minutes=1)))
        await db.commit()
    late = await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{q['id']}", json={"answer": "changed"})
    assert late.status_code == 409 and late.json()["error"]["message"].startswith("Time is up")
    state = (await api.get(f"/api/exam-attempts/{attempt['id']}")).json()
    assert (state["status"], state["autoSubmitted"]) == ("submitted", True)

    # Nobody looking: the periodic sweeper submits expired attempts.
    attempt2 = (await api.post(f"/api/exams/{exam['id']}/start")).json()
    assert attempt2["id"] != attempt["id"]
    async with db_ready() as db:
        await db.execute(update(ExamAttempt).where(ExamAttempt.id == attempt2["id"])
                         .values(deadline_at=utcnow() - timedelta(minutes=1)))
        await db.commit()
        assert await sweep_expired(db) == 1
        swept = await db.get(ExamAttempt, attempt2["id"])
    assert swept.status == "submitted" and swept.auto_submitted

    await drain_worker()  # grading: no model call needed for an unanswered paper
    analysis = (await api.get(f"/api/exam-attempts/{attempt2['id']}/analysis")).json()
    assert analysis["status"] == "graded" and analysis["autoSubmitted"] is True
    assert analysis["counts"]["insufficientEvidence"] == 3 and analysis["completedQuestions"] == 0


async def test_isolation(api, course, exam_llm):
    exam_llm(json.dumps({"questions": [MCQ, SHORT, SHORT2]}))
    exam = await ready_exam(api, course)
    attempt = (await api.post(f"/api/exams/{exam['id']}/start")).json()
    api.cookies.clear()
    await login_new_user(api, email="mallory@example.com")
    assert (await api.get(f"/api/exams/{exam['id']}")).status_code == 404
    assert (await api.post(f"/api/exams/{exam['id']}/start")).status_code == 404
    assert (await api.get(f"/api/exam-attempts/{attempt['id']}")).status_code == 404
    q = exam["questions"][0]
    assert (await api.put(f"/api/exam-attempts/{attempt['id']}/answers/{q['id']}", json={"answer": "x"})
            ).status_code == 404
    assert (await api.post(f"/api/exam-attempts/{attempt['id']}/submit")).status_code == 404
    assert (await api.get("/api/exam-attempts")).json() == []
    assert (await api.get("/api/exams/options")).json() == []
