import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.ai.llm.client import LLMClient
from app.ai.llm.types import LLMTimeoutError, ModelTier
from app.jobs.worker import Worker
from app.modules.courses import jobs as course_jobs
from app.modules.documents.models import Chunk, Document
from tests.conftest import SIGNUP
from tests.fakes import ScriptedProvider
from tests.pdfs import course_pdf

pytestmark = pytest.mark.integration

CONCEPTS = {"concepts": [
    {"name": "Chain rule", "description": "Derivative of composed functions as a product of derivatives",
     "prerequisites": []},
    {"name": "Backpropagation", "description": "Computing loss gradients for every weight, layer by layer",
     "prerequisites": ["Chain rule"]},
    {"name": "Introduction", "description": "Generic chapter label that must be dropped", "prerequisites": []},
    {"name": "Photosynthesis", "description": "Plants turning light energy into chemical energy",
     "prerequisites": []},
]}


@pytest.fixture
def scripted_llm(monkeypatch):
    def install(*responses):
        provider = ScriptedProvider(list(responses))
        client = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
        monkeypatch.setattr(course_jobs, "get_llm", lambda: client)
        return provider
    return install


async def login_new_user(api, email="ada@example.com"):
    r = await api.post("/api/auth/register", json={**SIGNUP, "email": email})
    assert r.status_code == 201, r.text


async def create_course(api, **overrides):
    body = {"title": "Deep Learning", "subject": "Deep Learning", "level": "Intermediate",
            "description": "Neural networks", **overrides}
    r = await api.post("/api/courses", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def upload(api, course_id, path, name="lecture.pdf"):
    with open(path, "rb") as fh:
        return await api.post(f"/api/courses/{course_id}/documents", files={"file": (name, fh, "application/pdf")})


async def drain_worker():
    """Run jobs until none are left, making retries due immediately (no backoff waits in tests)."""
    from sqlalchemy import update

    from app.db.session import SessionFactory
    from app.jobs.models import Job, JobStatus

    for _ in range(20):
        while await Worker().run_once():
            pass
        async with SessionFactory() as db:
            result = await db.execute(update(Job).where(Job.status == JobStatus.QUEUED)
                                      .values(run_after=func.now() - func.make_interval(0, 0, 0, 0, 0, 1)))
            await db.commit()
        if not result.rowcount:
            return


async def test_course_crud_and_domain_type(api):
    await login_new_user(api)
    course = await create_course(api, subject="Statistics")
    assert (course["domainType"], course["conceptsStatus"], course["materialCount"]) == ("quantitative", "idle", 0)
    listed = (await api.get("/api/courses")).json()
    assert [c["id"] for c in listed] == [course["id"]]
    assert (await api.get(f"/api/courses/{course['id']}")).json()["title"] == "Deep Learning"
    bad = await api.post("/api/courses", json={"title": " ", "subject": "x", "level": "y"})
    assert bad.status_code == 422


async def test_upload_ingest_search_and_concepts(api, tmp_path, scripted_llm, db_ready):
    provider = scripted_llm(json.dumps(CONCEPTS))
    await login_new_user(api)
    course = await create_course(api)
    pdf = course_pdf(tmp_path / "lecture.pdf", blank_pages=1)

    r = await upload(api, course["id"], pdf)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert (doc["status"], doc["fileName"], doc["origin"]) == ("queued", "lecture.pdf", "student_upload")

    await drain_worker()  # ingestion, then concept extraction

    status = (await api.get(f"/api/documents/{doc['id']}/status")).json()
    assert (status["status"], status["pageCount"], status["progress"]) == ("ready", 4, 1.0)
    assert "little or no extractable text" in status["warnings"][0]
    listed = (await api.get(f"/api/courses/{course['id']}/documents")).json()
    assert listed[0]["chunkCount"] >= 3
    c = (await api.get(f"/api/courses/{course['id']}")).json()
    assert (c["materialCount"], c["completedMaterials"], c["conceptsStatus"]) == (1, 1, "ready")

    # Retrieval: the right section ranks first; an unrelated question finds nothing (general knowledge).
    hits = (await api.post(f"/api/courses/{course['id']}/search",
                           json={"query": "How does the chain rule help compute gradients in a network?"})).json()
    assert hits["knowledgeMode"] == "course_grounded"
    assert hits["items"][0]["pageStart"] == 1 and "chain rule" in hits["items"][0]["text"]
    assert hits["items"][0]["label"] == "E1"
    plants = (await api.post(f"/api/courses/{course['id']}/search",
                             json={"query": "what releases oxygen in plants"})).json()
    assert plants["items"][0]["pageStart"] == 2
    unrelated = (await api.post(f"/api/courses/{course['id']}/search",
                                json={"query": "best recipe for a chocolate birthday cake"})).json()
    assert unrelated == {"knowledgeMode": "general_knowledge", "items": []}

    # Concepts: generic label dropped, prerequisites resolved to ids, pages linked by embeddings.
    concepts = (await api.get(f"/api/courses/{course['id']}/concepts")).json()
    names = [x["name"] for x in concepts]
    assert names == ["Chain rule", "Backpropagation", "Photosynthesis"]
    by_name = {x["name"]: x for x in concepts}
    assert by_name["Backpropagation"]["prerequisites"] == [by_name["Chain rule"]["id"]]
    assert by_name["Photosynthesis"]["sourceRefs"][0]["pageStart"] == 2
    assert by_name["Chain rule"]["status"] == "not_enough_evidence"
    # The model saw the outline (headings), not the whole document.
    user_prompt = provider.requests[0]["messages"][1].content
    assert "- Photosynthesis (p. 2)" in user_prompt and "Calvin cycle" not in user_prompt


async def test_concept_extraction_failure_marks_course_failed(api, tmp_path, scripted_llm, monkeypatch):
    provider = scripted_llm(*[LLMTimeoutError("slow")] * 5, json.dumps(CONCEPTS))
    await login_new_user(api)
    course = await create_course(api)
    await upload(api, course["id"], course_pdf(tmp_path / "a.pdf"))
    await drain_worker()  # ingest + 5 attempts at extraction (no backoff in the test)
    c = (await api.get(f"/api/courses/{course['id']}")).json()
    assert c["conceptsStatus"] == "failed" and c["completedMaterials"] == 1
    assert (await api.get(f"/api/courses/{course['id']}/concepts")).json() == []

    # The student retries once the model is back.
    r = await api.post(f"/api/courses/{course['id']}/concepts/extract")
    assert r.status_code == 202 and r.json()["conceptsStatus"] == "processing"
    assert (await api.post(f"/api/courses/{course['id']}/concepts/extract")).status_code == 409
    await drain_worker()
    c = (await api.get(f"/api/courses/{course['id']}")).json()
    assert c["conceptsStatus"] == "ready"
    assert len((await api.get(f"/api/courses/{course['id']}/concepts")).json()) == 3
    assert len(provider.requests) == 6


async def test_model_outage_waits_minutes_not_seconds(api, tmp_path, scripted_llm, db_ready):
    from app.ai.llm.types import LLMUnavailableError
    from app.jobs.models import Job

    scripted_llm(LLMUnavailableError("down"))
    await login_new_user(api)
    course = await create_course(api)
    await upload(api, course["id"], course_pdf(tmp_path / "a.pdf"))
    while await Worker().run_once():  # ingest, then one failed extraction attempt
        pass
    async with db_ready() as db:
        job = (await db.execute(select(Job).where(Job.kind == "courses.extract_concepts"))).scalar_one()
    assert job.status == "queued" and job.max_attempts == 5
    assert (job.run_after - job.updated_at).total_seconds() >= 25


async def test_upload_validation_duplicates_and_failures(api, tmp_path, scripted_llm):
    scripted_llm(json.dumps(CONCEPTS))
    await login_new_user(api)
    course = await create_course(api)
    not_pdf = tmp_path / "notes.pdf"
    not_pdf.write_text("just text")
    r = await upload(api, course["id"], not_pdf)
    assert r.status_code == 400 and r.json()["error"]["message"] == "This file is not a valid PDF."

    pdf = course_pdf(tmp_path / "lecture.pdf")
    assert (await upload(api, course["id"], pdf)).status_code == 201
    dup = await upload(api, course["id"], pdf, name="copy.pdf")
    assert dup.status_code == 409

    # A corrupt PDF fails ingestion with a readable message and can be retried.
    corrupt = tmp_path / "corrupt.pdf"
    corrupt.write_bytes(b"%PDF-1.4\n" + b"\x00garbage" * 50)
    bad = (await upload(api, course["id"], corrupt)).json()
    await drain_worker()
    st = (await api.get(f"/api/documents/{bad['id']}/status")).json()
    assert st["status"] == "failed" and "could not be read" in st["error"]
    retried = await api.post(f"/api/documents/{bad['id']}/retry")
    assert retried.status_code == 200 and retried.json()["status"] == "queued"
    ready = [d for d in (await api.get(f"/api/courses/{course['id']}/documents")).json() if d["status"] == "ready"]
    assert (await api.post(f"/api/documents/{ready[0]['id']}/retry")).status_code == 409


async def test_isolation_and_deletion(api, tmp_path, scripted_llm, db_ready):
    scripted_llm(json.dumps(CONCEPTS))
    await login_new_user(api)
    course = await create_course(api)
    doc = (await upload(api, course["id"], course_pdf(tmp_path / "lecture.pdf"))).json()
    await drain_worker()
    async with db_ready() as db:
        stored = Path((await db.get(Document, doc["id"])).storage_path)
    assert stored.exists()

    # Another student sees none of it.
    api.cookies.clear()
    await login_new_user(api, email="bob@example.com")
    cid, did = course["id"], doc["id"]
    for method, path in [("GET", f"/api/courses/{cid}"), ("GET", f"/api/courses/{cid}/concepts"),
                         ("GET", f"/api/courses/{cid}/documents"), ("GET", f"/api/documents/{did}/status"),
                         ("DELETE", f"/api/documents/{did}"), ("DELETE", f"/api/courses/{cid}")]:
        assert (await api.request(method, path)).status_code == 404, path
    r = await api.post(f"/api/courses/{course['id']}/search", json={"query": "chain rule"})
    assert r.status_code == 404
    assert (await api.get("/api/courses")).json() == []

    # The owner deletes the course: rows, chunks and the file are gone.
    api.cookies.clear()
    r = await api.post("/api/auth/login", json={"email": "ada@example.com", "password": SIGNUP["password"]})
    assert r.status_code == 200
    assert (await api.delete(f"/api/courses/{course['id']}")).status_code == 204
    assert not stored.exists()
    async with db_ready() as db:
        assert (await db.execute(select(func.count(Chunk.id)))).scalar_one() == 0
    assert (await api.get(f"/api/courses/{course['id']}")).status_code == 404
