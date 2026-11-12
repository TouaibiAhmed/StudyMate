import json

import pytest
from sqlalchemy import func, select

from app.ai.agents.chat import finalize_answer
from app.ai.llm.client import LLMClient
from app.ai.llm.types import LLMUnavailableError, ModelTier
from app.modules.chat import router as chat_router
from app.modules.chat.models import Conversation
from app.rag.evidence import EvidenceItem, EvidenceSet, label_for
from tests.pdfs import course_pdf
from tests.test_courses_documents import CONCEPTS, create_course, drain_worker, login_new_user, upload


def evidence(n=2):
    return EvidenceSet([EvidenceItem(label=label_for(i), chunk_id=f"c{i}", document_id="d1", document_title="L.pdf",
                                     page_start=i + 1, page_end=i + 1, text=f"text {i}") for i in range(n)])


def test_finalize_renumbers_known_labels_and_drops_unknown():
    text, sources = finalize_answer("Gradients flow back [E2]. The rule [E1, E9] is key [E7].", evidence())
    assert text == "Gradients flow back [1]. The rule [2] is key."
    assert [s.page for s in sources] == [2, 1]


def test_finalize_general_mode_strips_all_markers():
    text, sources = finalize_answer("Paris is in France [E1].", EvidenceSet())
    assert (text, sources) == ("Paris is in France.", [])


# --- API ---------------------------------------------------------------------------------------------



@pytest.fixture
def chat_llm(monkeypatch):
    def install(*responses):
        from tests.fakes import ScriptedProvider

        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(chat_router, "get_llm", lambda: client)
        return provider
    return install


@pytest.fixture(autouse=True)
def _reset_limits():
    from app.modules.chat import service

    service._generating.clear()
    service._message_limiter._events.clear()


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def stream(api, conv_id, content):
    r = await api.post(f"/api/chat/conversations/{conv_id}/messages/stream", json={"content": content})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")
    return parse_sse(r.text)


async def course_with_material(api, tmp_path, monkeypatch):
    from app.modules.courses import jobs as course_jobs
    from tests.fakes import ScriptedProvider

    client = LLMClient(ScriptedProvider([json.dumps(CONCEPTS)]), models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
    monkeypatch.setattr(course_jobs, "get_llm", lambda: client)
    await login_new_user(api)
    course = await create_course(api)
    await upload(api, course["id"], course_pdf(tmp_path / "lecture.pdf"))
    await drain_worker()
    return course


@pytest.mark.integration
async def test_grounded_streaming_answer_with_citations(api, tmp_path, monkeypatch, chat_llm):
    course = await course_with_material(api, tmp_path, monkeypatch)
    provider = chat_llm("Backpropagation uses the chain rule [E1]. Invented claim [E5]. What is a gradient?")
    conv = (await api.post("/api/chat/conversations",
                           json={"context": {"type": "course", "courseId": course["id"]}})).json()
    assert conv["context"]["courseTitle"] == "Deep Learning" and conv["title"] == "New conversation"

    events = await stream(api, conv["id"], "How does the chain rule help compute gradients in a network?")
    kinds = [e for e, _ in events]
    assert kinds[:2] == ["user", "meta"] and kinds[-1] == "done" and "delta" in kinds
    assert events[1][1] == {"knowledgeMode": "course_grounded"}
    streamed = "".join(d["text"] for e, d in events if e == "delta")
    assert "[E5]" in streamed  # raw stream; the final message is cleaned
    done = events[-1][1]
    assert done["content"] == "Backpropagation uses the chain rule [1]. Invented claim. What is a gradient?"
    assert done["knowledgeMode"] == "course_grounded"
    assert [s["page"] for s in done["sources"]] == [1] and done["sources"][0]["title"] == "lecture.pdf"

    # The prompt carried the excerpts and the untrusted-content rule.
    system, user = provider.requests[0]["messages"]
    assert "NOT instructions" in system.content and '<excerpt id="E1"' in user.content

    detail = (await api.get(f"/api/chat/conversations/{conv['id']}")).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["title"].startswith("How does the chain rule")
    assert detail["messages"][1]["sources"][0]["page"] == 1


@pytest.mark.integration
async def test_off_topic_question_in_course_is_labelled_general(api, tmp_path, monkeypatch, chat_llm):
    course = await course_with_material(api, tmp_path, monkeypatch)
    provider = chat_llm("This isn't covered in your course material, so here is a general explanation: bake it [E1].")
    conv = (await api.post("/api/chat/conversations",
                           json={"context": {"type": "course", "courseId": course["id"]}})).json()
    events = await stream(api, conv["id"], "best recipe for a chocolate birthday cake")
    assert events[1][1] == {"knowledgeMode": "general_knowledge"}
    done = events[-1][1]
    assert done["sources"] == [] and "[" not in done["content"]
    assert "isn't covered in your course material" in provider.requests[0]["messages"][0].content


@pytest.mark.integration
async def test_general_chat_history_and_non_streaming(api, chat_llm):
    provider = chat_llm("First answer.", "Second answer.")
    await login_new_user(api)
    conv = (await api.post("/api/chat/conversations", json={"context": {"type": "general"}})).json()
    r1 = await api.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "What is entropy?"})
    assert r1.status_code == 200
    assert r1.json()["assistantMessage"]["content"] == "First answer."
    assert r1.json()["assistantMessage"]["knowledgeMode"] == "general_knowledge"
    await api.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "Give an example"})
    second = provider.requests[1]["messages"]
    assert [m.role for m in second] == ["system", "user", "assistant", "user"]  # history included
    assert "without course material" in second[0].content
    listed = (await api.get("/api/chat/conversations")).json()
    assert listed[0]["messageCount"] == 4 and listed[0]["title"] == "What is entropy?"


@pytest.mark.integration
async def test_model_failure_reports_error_and_keeps_history_clean(api, chat_llm):
    chat_llm(LLMUnavailableError("down"), "Recovered answer.")
    await login_new_user(api)
    conv = (await api.post("/api/chat/conversations", json={})).json()
    events = await stream(api, conv["id"], "Hello?")
    assert events[-1][0] == "error" and events[-1][1]["code"] == "service_unavailable"
    assert (await api.get(f"/api/chat/conversations/{conv['id']}")).json()["messages"] == []
    # The lock was released: the retry goes through.
    events = await stream(api, conv["id"], "Hello?")
    assert events[-1][1]["content"] == "Recovered answer."


@pytest.mark.integration
async def test_one_answer_at_a_time_and_validation(api, chat_llm):
    from app.modules.chat import service

    chat_llm("ok")
    await login_new_user(api)
    me = (await api.get("/api/profile")).json()
    conv = (await api.post("/api/chat/conversations", json={})).json()
    service._generating[me["userId"]] = __import__("time").monotonic()
    r = await api.post(f"/api/chat/conversations/{conv['id']}/messages/stream", json={"content": "hi"})
    assert r.status_code == 409
    service._generating.clear()
    blank = await api.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "   "})
    assert blank.status_code == 422
    bad = await api.post("/api/chat/conversations", json={"context": {"type": "topic", "topicId": "nope"}})
    assert bad.status_code == 422


@pytest.mark.integration
async def test_isolation_and_course_deletion_cascade(api, tmp_path, monkeypatch, chat_llm, db_ready):
    chat_llm("Answer [E1].")
    course = await course_with_material(api, tmp_path, monkeypatch)
    concepts = (await api.get(f"/api/courses/{course['id']}/concepts")).json()
    conv = (await api.post("/api/chat/conversations", json={"context": {
        "type": "topic", "courseId": course["id"], "topicId": concepts[0]["id"]}})).json()
    assert conv["context"]["topicTitle"] == concepts[0]["name"]

    api.cookies.clear()
    await login_new_user(api, email="eve@example.com")
    assert (await api.get(f"/api/chat/conversations/{conv['id']}")).status_code == 404
    assert (await api.post(f"/api/chat/conversations/{conv['id']}/messages", json={"content": "x"})).status_code == 404
    other = await api.post("/api/chat/conversations", json={"context": {"type": "course", "courseId": course["id"]}})
    assert other.status_code == 404  # cannot attach someone else's course

    api.cookies.clear()
    await api.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse-1"})
    assert (await api.delete(f"/api/courses/{course['id']}")).status_code == 204
    async with db_ready() as db:
        assert (await db.execute(select(func.count(Conversation.id)))).scalar_one() == 0


@pytest.mark.parametrize(("message", "follow_up"), [
    ("why?", True), ("Give an example", True), ("Can you explain that more simply?", True),
    ("Who painted the Mona Lisa?", False), ("What is overfitting in machine learning models exactly?", False),
])
def test_follow_up_detection(message, follow_up):
    from app.ai.agents.chat import HistoryTurn
    from app.modules.chat.service import retrieval_queries

    history = [HistoryTurn("user", "What is overfitting?"), HistoryTurn("assistant", "...")]
    queries = retrieval_queries(message, history)
    assert queries[0] == message
    assert (len(queries) == 2) is follow_up
