import json

import pytest
from sqlalchemy import select

from app.ai.agents.study_tools import DraftQuestion
from app.ai.llm.client import LLMClient
from app.ai.llm.types import LLMUnavailableError, ModelTier
from app.modules.study.models import LearningEvidence
from app.modules.study_tools import jobs as tool_jobs
from app.modules.study_tools import service as tool_service
from app.modules.study_tools.jobs import normalize_question
from tests.fakes import ScriptedProvider
from tests.pdfs import course_pdf
from tests.test_courses_documents import CONCEPTS, create_course, drain_worker, login_new_user, upload

ALL_TYPES = {"Multiple Choice", "True/False", "Short Answer"}


def mcq(answer="Chain rule", options=("Chain rule", "Gradient descent", "Dropout", "Softmax"), **kw):
    return DraftQuestion(type="Multiple Choice", prompt="Which rule propagates gradients?", options=list(options),
                         answer=answer, **kw)


def test_mcq_answer_key_must_point_at_exactly_one_option():
    assert normalize_question(mcq(), ALL_TYPES).answer == "Chain rule"
    assert normalize_question(mcq(answer="b)"), ALL_TYPES).answer == "Gradient descent"  # letter answers
    assert normalize_question(mcq(answer="chain rule."), ALL_TYPES).answer == "Chain rule"
    assert normalize_question(mcq(answer="Backprop"), ALL_TYPES) is None  # not an option
    assert normalize_question(mcq(options=("A", "A", "B", "C"), answer="A"), ALL_TYPES) is None
    assert normalize_question(mcq(options=("Chain rule", "x", "y", "All of the above")), ALL_TYPES) is None
    assert normalize_question(mcq(options=("Chain rule", "x", "y")), ALL_TYPES) is None
    assert normalize_question(mcq(), {"True/False"}) is None  # type not requested


def test_true_false_and_short_answer_normalization():
    tf = normalize_question(DraftQuestion(type="True/False", prompt="Backprop updates weights.", answer="false."),
                            ALL_TYPES)
    assert (tf.answer, tf.options) == ("False", ["True", "False"])
    maybe = DraftQuestion(type="True/False", prompt="Is this statement true?", answer="maybe")
    assert normalize_question(maybe, ALL_TYPES) is None
    short = normalize_question(DraftQuestion(type="Short Answer", prompt="Why chain rule?", answer="Composition."),
                               ALL_TYPES)
    assert short.required_ideas == ["Composition."] and short.options == []


# --- API ---------------------------------------------------------------------------------------------

def section(heading, labels=("E1",)):
    return json.dumps({"heading": heading, "points": [f"{heading} point one.", f"{heading} point two."],
                       "source_labels": list(labels)})


def batch(*questions):
    return json.dumps({"questions": list(questions)})


Q_MCQ = {"type": "Multiple Choice", "prompt": "What does backpropagation compute?",
         "options": ["Gradients of the loss", "Learning rate", "Dataset size", "Batch norm"],
         "answer": "Gradients of the loss", "explanation": "It applies the chain rule.", "source_labels": ["E1"]}
Q_TF = {"type": "True/False", "prompt": "Backpropagation itself updates the weights.", "options": ["True", "False"],
        "answer": "False", "explanation": "The optimizer updates them."}
Q_SHORT = {"type": "Short Answer", "prompt": "Why is the chain rule needed?",
           "answer": "Each layer is a function in a composition.", "required_ideas": ["composition of functions"]}
Q_BAD = {**Q_MCQ, "prompt": "Broken question?", "answer": "Not an option"}


@pytest.fixture
def tools_llm(monkeypatch):
    def install(*responses):
        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(tool_jobs, "get_llm", lambda: client)
        monkeypatch.setattr(tool_service, "get_llm", lambda: client)
        return provider
    return install


@pytest.fixture
async def course(api, tmp_path, monkeypatch):
    from app.modules.courses import jobs as course_jobs

    client = LLMClient(ScriptedProvider([json.dumps(CONCEPTS)]), models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
    monkeypatch.setattr(course_jobs, "get_llm", lambda: client)
    await login_new_user(api)
    c = await create_course(api)
    doc = (await upload(api, c["id"], course_pdf(tmp_path / "lecture.pdf"))).json()
    await drain_worker()
    c["doc"] = doc
    c["concepts"] = (await api.get(f"/api/courses/{c['id']}/concepts")).json()
    return c


@pytest.mark.integration
async def test_summary_generation_in_sections(api, course, tools_llm):
    provider = tools_llm(section("Backpropagation"), "not json", "not json", section("Markets", ["E1", "E7"]))
    r = await api.post(f"/api/courses/{course['id']}/summaries",
                       json={"sourceDocumentIds": [], "topicIds": [], "length": "Short", "language": "English",
                             "structure": "Definitions"})
    assert r.status_code == 202, r.text
    s = r.json()
    assert (s["status"], s["sections"], s["sourceDocumentIds"]) == ("queued", [], [course["doc"]["id"]])
    assert s["title"] == "Definitions summary: Deep Learning"

    await drain_worker()
    s = (await api.get(f"/api/summaries/{s['id']}")).json()
    # 3 sections planned; the middle one failed validation twice and was skipped, not fatal.
    assert s["status"] == "ready" and [x["heading"] for x in s["sections"]] == ["Backpropagation", "Markets"]
    assert {src["page"] for src in s["sources"]} == {1, 3}  # E7 was not a real excerpt
    assert "Each point defines one term" in provider.requests[0]["messages"][0].content
    assert '<excerpt id="E1"' in provider.requests[0]["messages"][1].content

    listed = (await api.get(f"/api/courses/{course['id']}/summaries")).json()
    assert [x["id"] for x in listed] == [s["id"]]
    renamed = await api.patch(f"/api/summaries/{s['id']}", json={"title": "My notes"})
    assert renamed.json()["title"] == "My notes"
    tools = (await api.get(f"/api/courses/{course['id']}/study-tools")).json()
    assert tools[0]["kind"] == "summary" and tools[0]["status"] == "ready"
    assert (await api.delete(f"/api/summaries/{s['id']}")).status_code == 204
    assert (await api.get(f"/api/summaries/{s['id']}")).status_code == 404


@pytest.mark.integration
async def test_summary_by_topic_and_failures(api, course, tools_llm):
    tools_llm(section("Chain rule"), LLMUnavailableError("down"), LLMUnavailableError("down"),
              LLMUnavailableError("down"))
    chain = next(c for c in course["concepts"] if c["name"] == "Chain rule")
    s = (await api.post(f"/api/courses/{course['id']}/summaries",
                        json={"topicIds": [chain["id"]], "length": "Medium"})).json()
    assert s["title"] == "Key Concepts summary: Chain rule"
    await drain_worker()
    s = (await api.get(f"/api/summaries/{s['id']}")).json()
    assert s["status"] == "ready" and len(s["sections"]) == 1  # one section per selected topic

    s2 = (await api.post(f"/api/courses/{course['id']}/summaries", json={"length": "Short"})).json()
    await drain_worker()  # model down on every retry
    s2 = (await api.get(f"/api/summaries/{s2['id']}")).json()
    assert s2["status"] == "failed" and "unavailable" in s2["error"]

    bad = await api.post(f"/api/courses/{course['id']}/summaries", json={"topicIds": ["nope"]})
    assert bad.status_code == 404
    assert (await api.post(f"/api/courses/{course['id']}/summaries", json={"length": "Huge"})).status_code == 422


@pytest.mark.integration
async def test_quiz_generation_attempt_and_grading(api, course, tools_llm, db_ready):
    provider = tools_llm(
        batch(Q_MCQ, Q_BAD, Q_TF),  # the broken question is dropped
        batch(Q_SHORT),  # replacement batch
        json.dumps({"results": [{"number": 1, "correct": True, "feedback": "You named the composition."}]}),
    )
    r = await api.post(f"/api/courses/{course['id']}/quizzes", json={
        "questionCount": 3, "difficulty": "Easy", "questionTypes": ["Multiple Choice", "True/False", "Short Answer"]})
    assert r.status_code == 202, r.text
    quiz = r.json()
    assert (quiz["status"], quiz["questions"]) == ("queued", [])
    assert (await api.post(f"/api/quizzes/{quiz['id']}/attempts")).status_code == 409  # not ready yet

    await drain_worker()
    quiz = (await api.get(f"/api/quizzes/{quiz['id']}")).json()
    assert quiz["status"] == "ready" and quiz["questionCount"] == 3
    assert [q["type"] for q in quiz["questions"]] == ["Multiple Choice", "True/False", "Short Answer"]
    assert all("answer" not in q for q in quiz["questions"])  # no answer keys before submission
    assert "Write exactly 3 questions" in provider.requests[0]["messages"][0].content
    assert "What does backpropagation compute?" in provider.requests[1]["messages"][1].content  # avoid repeats

    attempt = (await api.post(f"/api/quizzes/{quiz['id']}/attempts")).json()
    mcq_q, tf_q, short_q = quiz["questions"]
    result = await api.post(f"/api/quiz-attempts/{attempt['id']}/submit", json={"answers": [
        {"questionId": mcq_q["id"], "answer": "gradients of the loss"},
        {"questionId": tf_q["id"], "answer": "True"},
        {"questionId": short_q["id"], "answer": "Because the layers form a composition of functions."},
    ]})
    assert result.status_code == 200, result.text
    res = result.json()
    assert (res["correctCount"], res["incorrectCount"], res["unansweredCount"], res["score"]) == (2, 1, 0, 66.7)
    by_q = {a["questionId"]: a for a in res["answers"]}
    assert by_q[tf_q["id"]]["correctAnswer"] == "False" and not by_q[tf_q["id"]]["isCorrect"]
    assert by_q[short_q["id"]]["feedback"] == "You named the composition."
    assert "<student_answer>Because the layers" in provider.requests[2]["messages"][1].content

    again = await api.post(f"/api/quiz-attempts/{attempt['id']}/submit", json={"answers": []})
    assert again.status_code == 409

    async with db_ready() as db:
        conditions = sorted((await db.execute(select(LearningEvidence.conditions))).scalars().all())
    assert set(conditions) <= {"quiz_choice", "quiz_short"}


@pytest.mark.integration
async def test_quiz_grading_failure_saves_nothing_and_isolation(api, course, tools_llm):
    tools_llm(batch(Q_SHORT, Q_SHORT | {"prompt": "Name the update step."}, Q_SHORT | {"prompt": "What is a loss?"}),
              LLMUnavailableError("down"))
    quiz = (await api.post(f"/api/courses/{course['id']}/quizzes",
                           json={"questionCount": 3, "questionTypes": ["Short Answer"]})).json()
    await drain_worker()
    quiz = (await api.get(f"/api/quizzes/{quiz['id']}")).json()
    attempt = (await api.post(f"/api/quizzes/{quiz['id']}/attempts")).json()
    answers = [{"questionId": q["id"], "answer": "Something reasonable"} for q in quiz["questions"]]
    r = await api.post(f"/api/quiz-attempts/{attempt['id']}/submit", json={"answers": answers})
    assert r.status_code == 503 and "Nothing was saved" in r.json()["error"]["message"]

    api.cookies.clear()
    await login_new_user(api, email="eve@example.com")
    assert (await api.get(f"/api/quizzes/{quiz['id']}")).status_code == 404
    assert (await api.post(f"/api/quizzes/{quiz['id']}/attempts")).status_code == 404
    assert (await api.post(f"/api/quiz-attempts/{attempt['id']}/submit", json={"answers": []})).status_code == 404
    assert (await api.get(f"/api/courses/{course['id']}/quizzes")).status_code == 404
