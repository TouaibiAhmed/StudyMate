"""Catalog: idempotent seeding, browsing and enrolling (copying a template into the library)."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import get_embedder
from app.core.errors import NotFoundError
from app.modules.catalog.content import CATALOG
from app.modules.catalog.models import CatalogCourse
from app.modules.catalog.schemas import CatalogConceptOut, CatalogCourseOut
from app.modules.courses.models import Concept, Course
from app.modules.courses.schemas import CourseOut
from app.modules.courses.service import _to_out, normalize_name
from app.modules.profile.domains import classify_domain


async def ensure_catalog(db: AsyncSession) -> None:
    rows = {c.slug: c for c in (await db.execute(select(CatalogCourse))).scalars()}
    todo = [e for e in CATALOG if e.slug not in rows or rows[e.slug].version != e.version]
    if not todo:
        return
    try:
        for e in todo:
            row = rows.get(e.slug) or CatalogCourse(slug=e.slug)
            row.version, row.title, row.subject, row.level = e.version, e.title, e.subject, e.level
            row.domains, row.hours, row.description = list(e.domains), e.hours, e.description
            row.concepts = [{"name": n, "description": d} for n, d in e.concepts]
            db.add(row)
        await db.commit()
    except IntegrityError:  # seeded by a parallel request
        await db.rollback()


async def _enrolled(db: AsyncSession, user_id: str) -> dict[str, str]:
    """catalog_course_id -> the student's course id."""
    rows = (await db.execute(select(Course.catalog_course_id, Course.id).where(
        Course.user_id == user_id, Course.catalog_course_id.is_not(None), Course.status == "active"))).all()
    return dict(rows)


def _out(c: CatalogCourse, enrolled: dict[str, str]) -> CatalogCourseOut:
    return CatalogCourseOut(id=c.id, slug=c.slug, title=c.title, subject=c.subject, level=c.level,
                            domains=list(c.domains), hours=c.hours, description=c.description,
                            concept_count=len(c.concepts), concepts=[CatalogConceptOut(**x) for x in c.concepts],
                            enrolled_course_id=enrolled.get(c.id))


async def list_catalog(db: AsyncSession, user_id: str, query: str = "", domain: str = "") -> list[CatalogCourseOut]:
    await ensure_catalog(db)
    items = (await db.execute(select(CatalogCourse).order_by(CatalogCourse.title))).scalars().all()
    q = query.strip().lower()
    if q:
        items = [c for c in items if q in f"{c.title} {c.subject} {c.description} "
                 f"{' '.join(x['name'] for x in c.concepts)}".lower()]
    if domain:
        items = [c for c in items if domain in c.domains]
    enrolled = await _enrolled(db, user_id)
    return [_out(c, enrolled) for c in items]


async def get_catalog_course(db: AsyncSession, user_id: str, catalog_id: str) -> CatalogCourseOut:
    await ensure_catalog(db)
    c = await db.get(CatalogCourse, catalog_id)
    if c is None:
        raise NotFoundError("Catalog course not found.")
    return _out(c, await _enrolled(db, user_id))


async def enroll(db: AsyncSession, user_id: str, catalog_id: str) -> tuple[CourseOut, bool]:
    """Copies the catalog course into the student's library (once). Returns (course, created)."""
    c = await db.get(CatalogCourse, catalog_id)
    if c is None:
        raise NotFoundError("Catalog course not found.")
    existing = (await db.execute(select(Course).where(Course.user_id == user_id, Course.catalog_course_id == c.id,
                                                      Course.status == "active"))).scalar_one_or_none()
    if existing is not None:
        return _to_out(existing, None), False
    domain = c.domains[0] if c.domains else None
    course = Course(user_id=user_id, title=c.title, subject=c.subject, level=c.level, description=c.description,
                    domain=domain, domain_type=classify_domain(c.subject, domain), status="active",
                    concepts_status="ready", catalog_course_id=c.id)
    db.add(course)
    await db.flush()
    vectors = await get_embedder().embed_documents([f"{x['name']}: {x['description']}" for x in c.concepts])
    previous: str | None = None
    for i, (x, vec) in enumerate(zip(c.concepts, vectors, strict=True)):
        concept = Concept(course_id=course.id, user_id=user_id, name=x["name"][:120],
                          normalized_name=normalize_name(x["name"]), description=x["description"], aliases=[],
                          prerequisite_ids=[previous] if previous else [], source_refs=[], origin="catalog",
                          position=i, embedding=vec)
        db.add(concept)
        await db.flush()
        previous = concept.id
    await db.commit()
    await db.refresh(course)
    return _to_out(course, None), True
