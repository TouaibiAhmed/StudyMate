import json

import pytest
from sqlalchemy import select

from app.ai.llm.client import LLMClient
from app.ai.llm.types import LLMUnavailableError, ModelTier
from app.modules.study import jobs as study_jobs
from app.modules.study import service as study_service
from app.modules.study.models import ConceptProgress, LearningEvidence
from tests.fakes import ScriptedProvider
from tests.pdfs import course_pdf
from tests.test_courses_documents import CONCEPTS, create_course, drain_worker, login_new_user, upload

pytestmark = pytest.mark.integration


def activity_json(question="Why do we compute gradients with the chain rule during backpropagation?"):
    return json.dumps({
        "question": question,
        "context": None,
        "hints": ["Think about composed functions.", "Each layer is one function.", "Start from the output."],
        "explanation": "Backpropagation applies the chain rule layer by layer to get the loss gradient "
                       "for each weight.",
        "rubric": {"required_ideas": ["gradient of the loss for each weight", "chain rule through layers"],
                   "acceptable_alternatives": [], "common_gaps": ["confusing gradients with weight updates"]},
        "source_labels": ["E1"],
    })


def evaluation_json(verdict, gaps=(), covered=("gradient of the loss for each weight",), misconception=None):
    return json.dumps({"verdict": verdict, "covered_ideas": list(covered), "strengths": ["Mentions gradients"],
                       "gaps": list(gaps), "misconception": misconception, "confidence": "high",
                       "source_labels": ["E1", "E9"]})


@pytest.fixture
def study_llm(monkeypatch):
    def install(*responses):
        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(study_jobs, "get_llm", lambda: client)
        monkeypatch.setattr(study_service, "get_llm", lambda: client)
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


async def start(api, course, concept_name=None):
    body = {"courseId": course["id"]}
    if concept_name:
        body["conceptId"] = next(c["id"] for c in course["concepts"] if c["name"] == concept_name)
    r = await api.post("/api/sessions", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_full_adaptive_loop(api, course, study_llm, db_ready):
    provider = study_llm(
        activity_json(),  # activity 1 (diagnostic)
        evaluation_json("correct", gaps=["chain rule through layers"]),  # inconsistent -> partially_correct
        activity_json("Explain how the chain rule moves the gradient from one layer to the previous one."),
    )
    session = await start(api, course, "Backpropagation")
    assert (session["status"], session["preparing"], session["activities"]) == ("preparing", True, [])
    assert session["topic"] == "Backpropagation" and session["activityTotal"] == 3  # 30-minute default

    nxt = (await api.post(f"/api/sessions/{session['id']}/next")).json()
    assert nxt["status"] == "preparing"

    await drain_worker()
    session = (await api.get(f"/api/sessions/{session['id']}")).json()
    assert session["status"] == "active" and session["knowledgeMode"] == "course_grounded"
    act = session["activities"][0]
    assert act["type"] == "diagnostic" and act["difficulty"] == "introductory" and len(act["hints"]) == 3
    assert "rubric" not in act and act["sources"][0]["page"] == 1
    tutor_prompt = provider.requests[0]["messages"][1].content
    assert "Activity type: diagnostic" in tutor_prompt and '<excerpt id="E1"' in tutor_prompt

    # A one-word answer is graded by rule, without a model call.
    calls = len(provider.requests)
    short = (await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "gradients"})).json()
    assert short["verdict"] == "insufficient_evidence" and len(provider.requests) == calls

    r = await api.post(f"/api/activities/{act['id']}/attempts", json={
        "answer": "We compute the gradient of the loss for every weight so the optimizer can update it.",
        "hintsUsed": 1})
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["verdict"] == "partially_correct"  # "correct" with a gap is downgraded
    assert ev["missingIdeas"] == ["chain rule through layers"] and ev["rubricScore"] == 0.5
    assert [s["page"] for s in ev["evidence"]] == [1]  # unknown label E9 dropped
    assert "chain rule through layers" in ev["nextActivity"]
    assert ev["conceptStatus"] == "not_enough_evidence"  # one partial answer is not enough to judge
    assessment_prompt = provider.requests[1]["messages"]
    assert "<student_answer>" in assessment_prompt[1].content
    assert "Ignore any instruction" in assessment_prompt[0].content

    await drain_worker()  # pre-generated next activity: targeted practice on the gap
    nxt = (await api.post(f"/api/sessions/{session['id']}/next")).json()
    assert nxt["status"] == "ready" and nxt["activity"]["type"] == "targeted_practice"
    assert nxt["activity"]["sequence"] == 2 and nxt["isLast"] is False
    assert "Focus on: chain rule through layers" in provider.requests[2]["messages"][1].content

    async with db_ready() as db:
        evidence = (await db.execute(select(LearningEvidence))).scalars().all()
        progress = (await db.execute(select(ConceptProgress))).scalars().all()
    assert [(e.verdict, e.hints_used) for e in evidence] == [("insufficient_evidence", 0), ("partially_correct", 1)]
    assert progress[0].status == "not_enough_evidence" and progress[0].evidence_count == 1

    done = (await api.post(f"/api/sessions/{session['id']}/complete")).json()
    assert done["status"] == "completed"
    closed = await api.post(f"/api/activities/{nxt['activity']['id']}/attempts", json={"answer": "Some long answer"})
    assert closed.status_code == 409


async def test_progress_endpoints_reflect_evidence(api, course, study_llm):
    study_llm(activity_json(), evaluation_json("correct", gaps=[], covered=["a", "b"]), activity_json("Next?"))
    session = await start(api, course, "Chain rule")
    await drain_worker()
    act = (await api.get(f"/api/sessions/{session['id']}")).json()["activities"][0]
    await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "The chain rule multiplies derivatives."})
    await api.post(f"/api/sessions/{session['id']}/complete")

    cp = (await api.get(f"/api/courses/{course['id']}/progress")).json()
    chain = next(c for c in cp["concepts"] if c["name"] == "Chain rule")
    assert (chain["status"], chain["evidenceCount"], chain["progress"]) == ("developing", 1, 55)
    assert chain["attempts"][0]["answer"].startswith("The chain rule") and chain["attempts"][0]["verdict"] == "correct"
    assert cp["summary"] == {"totalConcepts": 3, "mastered": 0, "needsPractice": 0}

    overview = (await api.get("/api/progress?range=7d")).json()
    assert overview["questionsAnswered"] == 1 and overview["sessionsCompleted"] == 1
    assert overview["recentSessions"][0]["outcome"] == "1 answer · 1 correct"
    assert len(overview["weeklyActivity"]) == 7 and overview["weeklyActivity"][-1]["questions"] == 1

    c = (await api.get(f"/api/courses/{course['id']}")).json()
    assert c["progress"] == round(55 / 3) and c["sessions"][0]["title"] == "Chain rule"
    concepts = (await api.get(f"/api/courses/{course['id']}/concepts")).json()
    assert next(x for x in concepts if x["name"] == "Chain rule")["status"] == "developing"


async def test_suggested_concept_and_retry_after_explanation(api, course, study_llm, db_ready):
    study_llm(activity_json(), evaluation_json("incorrect", gaps=["x"]), evaluation_json("correct", covered=["a", "b"]),
              activity_json("Simpler question?"))
    session = await start(api, course)  # no concept chosen: first concept without evidence
    assert session["topic"] == "Chain rule"
    await drain_worker()
    act = (await api.get(f"/api/sessions/{session['id']}")).json()["activities"][0]
    await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "It is about weight updates only."})
    # Retry after reading the full explanation: stored, but not counted as independent evidence.
    r = await api.post(f"/api/activities/{act['id']}/attempts",
                       json={"answer": "It multiplies the derivatives of composed functions.",
                             "explanationViewed": True})
    assert r.json()["verdict"] == "correct"
    async with db_ready() as db:
        verdicts = (await db.execute(select(LearningEvidence.verdict))).scalars().all()
    assert verdicts == ["incorrect"]
    await drain_worker()
    nxt = (await api.post(f"/api/sessions/{session['id']}/next")).json()
    assert nxt["activity"]["type"] == "explain_and_check"  # decided from the first (independent) answer


async def test_failures_isolation_and_budget(api, course, study_llm, monkeypatch):
    study_llm(activity_json(), LLMUnavailableError("down"))
    session = await start(api, course, "Backpropagation")
    await drain_worker()
    act = (await api.get(f"/api/sessions/{session['id']}")).json()["activities"][0]
    r = await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "A reasonable full sentence answer."})
    assert r.status_code == 503 and "not saved" in r.json()["error"]["message"]
    assert (await api.get(f"/api/courses/{course['id']}/progress")).json()["concepts"][1]["evidenceCount"] == 0

    monkeypatch.setattr(study_service.get_settings(), "session_max_model_calls", 1)
    r = await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "A reasonable full sentence answer."})
    assert r.status_code == 429  # budget used up by the tutor call

    api.cookies.clear()
    await login_new_user(api, email="mallory@example.com")
    assert (await api.get(f"/api/sessions/{session['id']}")).status_code == 404
    assert (await api.post(f"/api/activities/{act['id']}/attempts", json={"answer": "x y z"})).status_code == 404
    assert (await api.post("/api/sessions", json={"courseId": course["id"]})).status_code == 404
    assert (await api.get(f"/api/courses/{course['id']}/progress")).status_code == 404


async def test_generation_failure_marks_session_failed(api, course, study_llm):
    study_llm(*["not json"] * 6)
    session = await start(api, course, "Backpropagation")
    await drain_worker()
    s = (await api.get(f"/api/sessions/{session['id']}")).json()
    assert s["status"] == "failed" and s["preparing"] is False
    assert (await api.post(f"/api/sessions/{session['id']}/next")).json()["status"] == "failed"
