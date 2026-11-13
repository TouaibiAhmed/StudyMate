import json

import pytest
from sqlalchemy import select

from app.ai.agents.roadmap import OutlineTopic
from app.ai.llm.client import LLMClient
from app.ai.llm.types import ModelTier
from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.roadmaps import curated
from app.modules.roadmaps import jobs as roadmap_jobs
from app.modules.roadmaps.graph import clean_prerequisites, depths, find_cycle, layout
from app.modules.roadmaps.jobs import clean_outline
from app.modules.roadmaps.models import RoadmapNode
from app.modules.roadmaps.service import concept_fits, ensure_curated
from app.modules.study.models import ConceptProgress, StudySession
from tests.fakes import ScriptedProvider
from tests.pdfs import course_pdf
from tests.test_courses_documents import CONCEPTS, create_course, drain_worker, login_new_user, upload

# --- Pure functions -----------------------------------------------------------------------------------


def test_cycle_detection_and_cleaning():
    assert find_cycle({"a": [], "b": ["a"], "c": ["a", "b"]}) is None
    cycle = find_cycle({"a": ["c"], "b": ["a"], "c": ["b"]})
    assert cycle is not None and cycle[0] == cycle[-1] and set(cycle) == {"a", "b", "c"}
    assert find_cycle({"a": ["a"]}) == ["a", "a"]
    # Forward edges, self edges, unknown ids and duplicates are dropped: the result is always a DAG.
    cleaned = clean_prerequisites([1, 2, 3], {1: [3, 1], 2: [1, 1, 99], 3: [2, 1]})
    assert cleaned == {1: [], 2: [1], 3: [2, 1]}
    assert find_cycle(cleaned) is None


def test_layout_layers_by_depth():
    prereqs = {"a": [], "b": ["a"], "c": ["a"], "d": ["b", "c"]}
    assert depths(list(prereqs), prereqs) == {"a": 0, "b": 1, "c": 1, "d": 2}
    pos = layout(list(prereqs), prereqs)
    assert pos["a"][0] < pos["b"][0] == pos["c"][0] < pos["d"][0]
    assert pos["b"][1] != pos["c"][1]


def test_curated_roadmaps_are_valid():
    slugs = [r.slug for r in curated.CURATED]
    assert len(slugs) == len(set(slugs)) >= 5
    categories = {r.category for r in curated.CURATED}
    assert categories == {"data", "engineering", "machine_learning", "business"}
    for r in curated.CURATED:
        keys = [n.key for n in r.nodes]
        assert len(keys) == len(set(keys)), r.slug
        assert 8 <= len(keys) <= get_settings().roadmap_max_nodes, r.slug
        prereqs = {n.key: list(n.prerequisites) for n in r.nodes}
        assert all(p in prereqs for ps in prereqs.values() for p in ps), r.slug
        assert find_cycle(prereqs) is None, r.slug
        assert all("http" not in res and "www." not in res for n in r.nodes for res in n.resources), r.slug
        assert any(n.optional for n in r.nodes) and sum(not n.optional for n in r.nodes) >= 6


def test_outline_cleaning():
    topics = [OutlineTopic(id=1, title="Python basics", prerequisites=[2]),
              OutlineTopic(id=2, title="Data cleaning", prerequisites=[1, 2]),
              OutlineTopic(id=3, title="python  BASICS", prerequisites=[1]),  # duplicate title
              OutlineTopic(id=4, title="Dashboards", prerequisites=[3, 2])]
    kept, prereqs = clean_outline(topics, max_nodes=10)
    assert [t.id for t in kept] == [1, 2, 4]
    assert prereqs == {1: [], 2: [1], 4: [2]}


def test_concept_fits_needs_words_or_very_high_similarity():
    node = "Neural networks and deep learning Layers, activation functions, backpropagation and training."
    assert concept_fits(node, "Backpropagation", 0.85)
    assert concept_fits(node, "Activation functions", 0.83)
    assert not concept_fits(node, "Backpropagation", 0.70)  # words alone are not enough either
    assert not concept_fits(node, "Photosynthesis", 0.86)  # a similar-looking score but unrelated
    assert concept_fits(node, "Deep nets", 0.95)


# --- API --------------------------------------------------------------------------------------------

OUTLINE = {"description": "Grow into data engineering work by building reliable pipelines.", "topics": [
    {"id": 1, "title": "Python programming", "prerequisites": []},
    {"id": 2, "title": "SQL and relational databases", "prerequisites": [1]},
    {"id": 3, "title": "Data modelling", "prerequisites": [2, 7]},  # 7 is later: dropped
    {"id": 4, "title": "Batch pipelines", "prerequisites": [1, 3]},
    {"id": 5, "title": "Workflow orchestration", "prerequisites": [4]},
    {"id": 6, "title": "Data quality testing", "prerequisites": [4, 6]},  # self edge dropped
    {"id": 7, "title": "Streaming data", "optional": True, "prerequisites": [4]},
    {"id": 8, "title": "Capstone pipeline project", "prerequisites": [5, 6]},
]}


def details(ids, resource="The official documentation of the tool you chose"):
    return json.dumps({"topics": [{"id": i, "description": f"What topic {i} covers and why it matters.",
                                   "resources": [resource, "https://example.com/made-up"]} for i in ids]})


@pytest.fixture
def roadmap_llm(monkeypatch):
    def install(*responses):
        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(roadmap_jobs, "get_llm", lambda: client)
        return provider
    return install


@pytest.mark.integration
async def test_curated_library_and_detail(api, db_ready):
    await login_new_user(api)
    items = (await api.get("/api/roadmaps")).json()
    assert len(items) == len(curated.CURATED)
    assert all(i["source"] == "curated" and i["status"] == "ready" and i["progress"] == 0 for i in items)
    ml = next(i for i in items if i["role"] == "Machine Learning Engineer")
    assert ml["topicCount"] == 13 and len(ml["coreTopics"]) == 4 and ml["optionalTopics"]

    detail = (await api.get(f"/api/roadmaps/{ml['id']}")).json()
    by_key = {n["key"]: n for n in detail["nodes"]}
    assert by_key["supervised"]["prerequisites"] == [by_key["data-prep"]["id"], by_key["math"]["id"]]
    assert by_key["python"]["position"]["x"] < by_key["supervised"]["position"]["x"]
    assert all(n["status"] == "not_started" for n in detail["nodes"])

    # Seeding is idempotent and a content update keeps node ids (and with them, progress).
    async with db_ready() as db:
        await ensure_curated(db)
        count = len((await db.execute(select(RoadmapNode))).scalars().all())
    assert count == sum(len(r.nodes) for r in curated.CURATED)


@pytest.mark.integration
async def test_manual_status_and_general_session(api, db_ready):
    await login_new_user(api)
    roadmap = next(i for i in (await api.get("/api/roadmaps")).json() if i["role"] == "Accountant")
    detail = (await api.get(f"/api/roadmaps/{roadmap['id']}")).json()
    first, second = detail["nodes"][0], detail["nodes"][1]

    r = await api.patch(f"/api/roadmaps/{roadmap['id']}/nodes/{first['id']}", json={"status": "known"})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["manualOverride"], r.json()["progress"]) == ("known", True, 100)
    assert (await api.patch(f"/api/roadmaps/{roadmap['id']}/nodes/{first['id']}",
                            json={"status": "mastered"})).status_code == 422

    session = await api.post(f"/api/roadmaps/{roadmap['id']}/nodes/{second['id']}/sessions")
    assert session.status_code == 201, session.text
    body = session.json()
    assert (body["knowledgeMode"], body["courseId"], body["topic"]) == ("general_knowledge", None, second["title"])
    async with db_ready() as db:
        s = await db.get(StudySession, body["sessionId"])
    assert s.topic == second["title"] and "Accountant roadmap" in s.goal

    detail = (await api.get(f"/api/roadmaps/{roadmap['id']}")).json()
    states = {n["id"]: n for n in detail["nodes"]}
    assert states[second["id"]]["status"] == "in_progress" and states[second["id"]]["manualOverride"] is False
    assert detail["following"] is True and detail["progress"] > 0

    listed = next(i for i in (await api.get("/api/roadmaps")).json() if i["id"] == roadmap["id"])
    assert listed["following"] and listed["progress"] == detail["progress"]

    # Clearing the manual status goes back to the evidence (none for that topic).
    cleared = (await api.patch(f"/api/roadmaps/{roadmap['id']}/nodes/{first['id']}", json={"status": None})).json()
    assert (cleared["status"], cleared["manualOverride"]) == ("not_started", False)

    assert (await api.delete(f"/api/roadmaps/{roadmap['id']}")).status_code == 409  # curated
    assert (await api.delete(f"/api/roadmaps/{roadmap['id']}/follow")).status_code == 204


@pytest.mark.integration
async def test_course_concepts_move_matching_topics(api, tmp_path, monkeypatch, db_ready):
    from app.modules.courses import jobs as course_jobs

    client = LLMClient(ScriptedProvider([json.dumps(CONCEPTS)]), models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
    monkeypatch.setattr(course_jobs, "get_llm", lambda: client)
    await login_new_user(api)
    course = await create_course(api)
    await upload(api, course["id"], course_pdf(tmp_path / "lecture.pdf"))
    await drain_worker()
    concepts = {c["name"]: c for c in (await api.get(f"/api/courses/{course['id']}/concepts")).json()}

    roadmap = next(i for i in (await api.get("/api/roadmaps")).json() if i["role"] == "Machine Learning Engineer")
    nodes = {n["key"]: n for n in (await api.get(f"/api/roadmaps/{roadmap['id']}")).json()["nodes"]}
    deep = nodes["deep-learning"]
    assert (deep["conceptName"], deep["courseId"]) == ("Backpropagation", course["id"])
    assert not any(n["conceptName"] == "Photosynthesis" for n in nodes.values())
    assert deep["status"] == "not_started"  # matched, but no evidence yet

    async with db_ready() as db:
        user_id = (await db.execute(select(User.id))).scalar_one()
        db.add(ConceptProgress(user_id=user_id,
                               concept_id=concepts["Backpropagation"]["id"], status="good_evidence", estimate=0.9,
                               evidence_count=3, reason="Two independent correct answers"))
        await db.commit()
    deep = next(n for n in (await api.get(f"/api/roadmaps/{roadmap['id']}")).json()["nodes"]
                if n["key"] == "deep-learning")
    assert (deep["status"], deep["progress"]) == ("completed", 100)
    assert "Backpropagation" in deep["evidenceSummary"]

    session = (await api.post(f"/api/roadmaps/{roadmap['id']}/nodes/{deep['id']}/sessions")).json()
    assert (session["knowledgeMode"], session["courseId"]) == ("course_grounded", course["id"])
    async with db_ready() as db:
        s = await db.get(StudySession, session["sessionId"])
    assert s.concept_id == concepts["Backpropagation"]["id"]


@pytest.mark.integration
async def test_generation_two_passes(api, roadmap_llm, db_ready):
    provider = roadmap_llm(json.dumps(OUTLINE), details([1, 2, 3, 4, 5, 6]), details([7]),
                           details([8]))  # topic 8 was missing in the first detail pass: retried once
    await login_new_user(api)
    bad = await api.post("/api/roadmaps/generate", json={"role": "x"})
    assert bad.status_code == 422
    r = await api.post("/api/roadmaps/generate",
                       json={"role": "Data Engineer", "category": "Data", "goal": "Build pipelines for analytics"})
    assert r.status_code == 202, r.text
    pending = r.json()
    assert (pending["status"], pending["source"], pending["nodes"]) == ("generating", "generated", [])
    assert pending["category"] == "data" and pending["following"]
    again = await api.post("/api/roadmaps/generate", json={"role": "Another role", "goal": ""})
    assert again.status_code == 409  # one generation at a time

    await drain_worker()
    done = (await api.get(f"/api/roadmaps/{pending['id']}")).json()
    assert done["status"] == "ready", done
    assert done["description"].startswith("Grow into data engineering")
    assert len(done["nodes"]) == 8 and len(provider.requests) == 4
    by_title = {n["title"]: n for n in done["nodes"]}
    modelling = by_title["Data modelling"]
    assert modelling["prerequisites"] == [by_title["SQL and relational databases"]["id"]]
    assert by_title["Data quality testing"]["prerequisites"] == [by_title["Batch pipelines"]["id"]]
    assert by_title["Streaming data"]["type"] == "optional"
    assert all(n["description"] for n in done["nodes"])
    assert all(n["resources"] == ["The official documentation of the tool you chose"] for n in done["nodes"])
    assert "not official career requirements" in done["note"]
    outline_prompt = " ".join(m.content for m in provider.requests[0]["messages"])
    assert "Data Engineer" in outline_prompt and "Build pipelines for analytics" in outline_prompt

    listed = (await api.get("/api/roadmaps")).json()
    assert listed[0]["id"] == done["id"]  # generated roadmaps first

    # Private: another student cannot see or use it.
    api.cookies.clear()
    await login_new_user(api, email="mallory@example.com")
    assert all(i["id"] != done["id"] for i in (await api.get("/api/roadmaps")).json())
    assert (await api.get(f"/api/roadmaps/{done['id']}")).status_code == 404
    node = done["nodes"][0]["id"]
    assert (await api.patch(f"/api/roadmaps/{done['id']}/nodes/{node}", json={"status": "known"})).status_code == 404
    assert (await api.delete(f"/api/roadmaps/{done['id']}")).status_code == 404


@pytest.mark.integration
async def test_generation_failure_and_retry(api, roadmap_llm):
    roadmap_llm(json.dumps({"description": "Too short a plan.", "topics": [
        {"id": 1, "title": "One"}, {"id": 2, "title": "Two"}, {"id": 3, "title": "Three"},
        {"id": 4, "title": "Four"}]}), json.dumps(OUTLINE), details(range(1, 7)), details([7, 8]))
    await login_new_user(api)
    pending = (await api.post("/api/roadmaps/generate", json={"role": "Data Engineer"})).json()
    await drain_worker()
    failed = (await api.get(f"/api/roadmaps/{pending['id']}")).json()
    assert failed["status"] == "failed" and "too few topics" in failed["error"]
    node_attempt = await api.post(f"/api/roadmaps/{pending['id']}/retry")
    assert node_attempt.status_code == 202 and node_attempt.json()["status"] == "generating"
    await drain_worker()
    done = (await api.get(f"/api/roadmaps/{pending['id']}")).json()
    assert done["status"] == "ready" and len(done["nodes"]) == 8
    assert (await api.delete(f"/api/roadmaps/{pending['id']}")).status_code == 204
    assert (await api.get(f"/api/roadmaps/{pending['id']}")).status_code == 404
