import pytest
from sqlalchemy import select

from app.modules.catalog.content import CATALOG
from app.modules.courses.models import Concept
from tests.conftest import SIGNUP

pytestmark = pytest.mark.integration

PERSONAS = {
    "ml": {"domain": "Computer Science & IT", "specialization": "AI", "fieldOfStudy": "Artificial Intelligence",
           "targetRole": "Machine Learning Engineer"},
    "accounting": {"domain": "Business", "specialization": "Finance", "fieldOfStudy": "Accounting and Finance",
                   "targetRole": "Accountant"},
    "biology": {"domain": "Health & Medicine", "specialization": "Biology", "fieldOfStudy": "Biomedical Sciences",
                "targetRole": "Clinical researcher"},
}


async def register(api, persona: str, email: str | None = None):
    body = {**SIGNUP, **PERSONAS[persona], "email": email or f"{persona}@example.com"}
    r = await api.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text


async def recs(api, kind: str, limit: int = 4) -> list[dict]:
    r = await api.get(f"/api/recommendations?type={kind}&limit={limit}")
    assert r.status_code == 200, r.text
    return r.json()


async def test_catalog_browse_and_enroll(api, db_ready):
    await register(api, "ml")
    items = (await api.get("/api/catalog/courses")).json()
    assert len(items) == len(CATALOG) and all(i["enrolledCourseId"] is None for i in items)
    assert [i["title"] for i in (await api.get("/api/catalog/courses?query=backpropagation")).json()] == \
        ["Deep Learning Fundamentals"]
    business = (await api.get("/api/catalog/courses", params={"domain": "Business"})).json()
    assert {"Financial Accounting Basics", "Microeconomics"} <= {i["title"] for i in business}

    dl = next(i for i in items if i["slug"] == "deep-learning-fundamentals")
    r = await api.post(f"/api/catalog/courses/{dl['id']}/enroll")
    assert r.status_code == 201, r.text
    course = r.json()
    assert (course["title"], course["level"]) == ("Deep Learning Fundamentals", "Advanced")
    again = await api.post(f"/api/catalog/courses/{dl['id']}/enroll")
    assert again.status_code == 200 and again.json()["id"] == course["id"]  # enrolled once

    concepts = (await api.get(f"/api/courses/{course['id']}/concepts")).json()
    assert [c["name"] for c in concepts][:3] == ["Neural networks", "Activation functions", "Backpropagation"]
    async with db_ready() as db:
        rows = (await db.execute(select(Concept).where(Concept.course_id == course["id"])
                                 .order_by(Concept.position))).scalars().all()
    assert all(c.embedding is not None and c.origin == "catalog" for c in rows)
    assert rows[1].prerequisite_ids == [rows[0].id]
    assert (await api.get(f"/api/catalog/courses/{dl['id']}")).json()["enrolledCourseId"] == course["id"]

    # A study session on a catalog course works before any upload, labelled general knowledge.
    s = await api.post("/api/sessions", json={"courseId": course["id"], "conceptId": concepts[2]["id"]})
    assert s.status_code == 201, s.text
    assert (await api.post("/api/catalog/courses/nope/enroll")).status_code == 404


@pytest.mark.parametrize(("persona", "course_top", "roadmap_top"), [
    ("ml", {"Introduction to Machine Learning", "Deep Learning Fundamentals"}, "Machine Learning Engineer"),
    ("accounting", {"Financial Accounting Basics", "Microeconomics"}, "Accountant"),
    ("biology", {"Cell Biology", "Human Physiology"}, None),
])
async def test_recommendations_fit_the_student(api, persona, course_top, roadmap_top):
    await register(api, persona)
    courses = await recs(api, "course", 4)
    assert len(courses) == 4 and len({c["itemId"] for c in courses}) == 4
    assert course_top & {c["title"] for c in courses[:2]}, [c["title"] for c in courses]
    assert all(c["reason"] and c["href"] and c["subtitle"] for c in courses)
    roadmaps = await recs(api, "roadmap", 2)
    if roadmap_top:
        assert roadmaps[0]["title"] == roadmap_top, [r["title"] for r in roadmaps]
        assert roadmaps[0]["href"] == f"/roadmaps/{roadmaps[0]['itemId']}"


async def test_activity_shapes_and_explains_recommendations(api):
    await register(api, "accounting")
    before = [c["title"] for c in await recs(api, "course", 3)]
    assert "Deep Learning Fundamentals" not in before

    # The student starts following the ML roadmap: deep learning content moves up, with that reason.
    ml = next(r for r in (await api.get("/api/roadmaps")).json() if r["role"] == "Machine Learning Engineer")
    assert (await api.put(f"/api/roadmaps/{ml['id']}/follow")).status_code == 204
    after = await recs(api, "course", 6)
    titles = [c["title"] for c in after]
    assert "Introduction to Machine Learning" in titles
    intro = next(c for c in after if c["title"] == "Introduction to Machine Learning")
    assert intro["reason"] == "Because you follow the Machine Learning Engineer roadmap"
    assert all(r["itemId"] != ml["id"] for r in await recs(api, "roadmap", 5))  # already followed

    # Enrolled and dismissed items are not suggested again; reset shows dismissed ones again.
    top = after[0]
    await api.post(f"/api/catalog/courses/{top['itemId']}/enroll")
    second = (await recs(api, "course", 6))[0]
    assert top["itemId"] not in {c["itemId"] for c in await recs(api, "course", 10)}
    r = await api.post("/api/recommendations/feedback", json={"kind": "course", "itemId": second["itemId"]})
    assert r.status_code == 204
    assert second["itemId"] not in {c["itemId"] for c in await recs(api, "course", 10)}
    assert (await api.delete("/api/recommendations/feedback")).status_code == 204
    assert second["itemId"] in {c["itemId"] for c in await recs(api, "course", 10)}

    # A course the student created under the same title as a catalog course is not suggested.
    await api.post("/api/courses", json={"title": "Principles of  marketing", "subject": "Marketing",
                                         "level": "Beginner", "description": ""})
    assert "Principles of Marketing" not in {c["title"] for c in await recs(api, "course", 10)}

    bad = await api.post("/api/recommendations/feedback", json={"kind": "course", "itemId": "nope"})
    assert bad.status_code == 404
    assert (await api.get("/api/recommendations?type=article")).status_code == 422


async def test_variety_and_privacy(api):
    await register(api, "ml")
    courses = await recs(api, "course", 6)
    subjects = {c["subtitle"].split(" · ")[1] for c in courses}
    assert len(subjects) >= 5  # MMR keeps the list varied

    # Generated roadmaps are private: never recommended, even to their owner.
    r = await api.post("/api/roadmaps/generate", json={"role": "Data Engineer", "category": "Data"})
    gen_id = r.json()["id"]
    assert all(x["itemId"] != gen_id for x in await recs(api, "roadmap", 10))
    # Feedback on a private roadmap is refused like a missing one.
    api.cookies.clear()
    await register(api, "biology")
    assert (await api.post("/api/recommendations/feedback", json={"kind": "roadmap", "itemId": gen_id})
            ).status_code == 404
