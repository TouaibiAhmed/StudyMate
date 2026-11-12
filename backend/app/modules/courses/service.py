import asyncio
import logging
import re
from pathlib import Path

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.courses.models import Concept, Course
from app.modules.courses.schemas import ConceptOut, CourseCreate, CourseOut, SourceRef
from app.modules.documents.models import Document
from app.modules.profile.domains import classify_domain

log = logging.getLogger(__name__)


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", name.lower())).strip()[:120]


async def get_owned_course(db: AsyncSession, user_id: str, course_id: str) -> Course:
    """The only way to load a course: a foreign or unknown id is a 404, never a 403."""
    course = (await db.execute(
        select(Course).where(Course.id == course_id, Course.user_id == user_id)
    )).scalar_one_or_none()
    if course is None:
        raise NotFoundError("Course not found.")
    return course


async def _material_counts(db: AsyncSession, course_ids: list[str]) -> dict[str, tuple[int, int]]:
    if not course_ids:
        return {}
    rows = await db.execute(
        select(
            Document.course_id,
            func.count(Document.id),
            func.count(case((Document.status == "ready", 1))),
        ).where(Document.course_id.in_(course_ids)).group_by(Document.course_id)
    )
    return {cid: (total, ready) for cid, total, ready in rows.all()}


async def _concept_levels(db: AsyncSession, user_id: str, course_ids: list[str]) -> dict[str, dict[str, str]]:
    """course_id -> {concept_id: status} for the student's concepts."""
    from app.modules.study.models import ConceptProgress  # local import: study depends on courses

    rows = (await db.execute(
        select(Concept.course_id, Concept.id, ConceptProgress.status)
        .outerjoin(ConceptProgress, (ConceptProgress.concept_id == Concept.id) & (ConceptProgress.user_id == user_id))
        .where(Concept.course_id.in_(course_ids))
    )).all() if course_ids else []
    out: dict[str, dict[str, str]] = {}
    for course_id, concept_id, status in rows:
        out.setdefault(course_id, {})[concept_id] = status or "not_enough_evidence"
    return out


def _course_level(statuses: dict[str, str] | None) -> int:
    """Average concept level (see learning.policy.STATUS_LEVEL); 0 for a course without concepts."""
    from app.learning.policy import STATUS_LEVEL, ConceptStatus

    if not statuses:
        return 0
    return round(sum(STATUS_LEVEL[ConceptStatus(s)] for s in statuses.values()) / len(statuses))


def _to_out(course: Course, counts: tuple[int, int] | None, statuses: dict[str, str] | None = None) -> CourseOut:
    total, ready = counts or (0, 0)
    return CourseOut.model_validate(course).model_copy(update={
        "material_count": total, "completed_materials": ready, "progress": _course_level(statuses)})


async def list_courses(db: AsyncSession, user_id: str) -> list[CourseOut]:
    courses = (await db.execute(
        select(Course).where(Course.user_id == user_id).order_by(Course.updated_at.desc())
    )).scalars().all()
    ids = [c.id for c in courses]
    counts = await _material_counts(db, ids)
    levels = await _concept_levels(db, user_id, ids)
    return [_to_out(c, counts.get(c.id), levels.get(c.id)) for c in courses]


async def create_course(db: AsyncSession, user_id: str, data: CourseCreate) -> CourseOut:
    course = Course(
        user_id=user_id,
        title=data.title,
        subject=data.subject,
        level=data.level,
        description=data.description,
        domain=(data.domain or "").strip() or None,
        domain_type=classify_domain(data.subject, data.domain),
        status="active",
        concepts_status="idle",
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return _to_out(course, None)


async def get_course(db: AsyncSession, user_id: str, course_id: str) -> CourseOut:
    from app.modules.progress.service import session_history  # local import: progress depends on courses

    course = await get_owned_course(db, user_id, course_id)
    counts = await _material_counts(db, [course.id])
    levels = await _concept_levels(db, user_id, [course.id])
    history = await session_history(db, user_id, course_id=course.id, limit=5)
    out = _to_out(course, counts.get(course.id), levels.get(course.id))
    return out.model_copy(update={
        "last_studied": history[0].date if history else None,
        "sessions": [{"id": h.session_id, "title": h.title, "date": h.date,
                      "duration": f"{max(1, h.duration_seconds // 60)} min", "score": h.outcome} for h in history],
    })


async def delete_course(db: AsyncSession, user_id: str, course_id: str) -> None:
    """Deletes the course and everything derived from it (FR-10): documents, chunks, concepts
    (database cascade) and the uploaded files on disk."""
    course = await get_owned_course(db, user_id, course_id)
    paths = (await db.execute(select(Document.storage_path).where(Document.course_id == course.id))).scalars().all()
    await db.delete(course)
    await db.commit()
    for p in paths:
        try:
            await asyncio.to_thread(Path(p).unlink, missing_ok=True)
        except OSError:
            log.warning("Could not delete an uploaded file of a deleted course")


def concept_out(concept: Concept, status: str = "not_enough_evidence") -> ConceptOut:
    from app.learning.policy import STATUS_LEVEL, ConceptStatus

    return ConceptOut(
        status=status,
        progress=STATUS_LEVEL[ConceptStatus(status)],
        id=concept.id,
        course_id=concept.course_id,
        name=concept.name,
        title=concept.name,
        description=concept.description,
        aliases=concept.aliases or [],
        prerequisites=concept.prerequisite_ids or [],
        source_refs=[SourceRef.model_validate(r) for r in concept.source_refs or []],
        origin=concept.origin,
    )


async def list_concepts(db: AsyncSession, user_id: str, course_id: str) -> list[ConceptOut]:
    await get_owned_course(db, user_id, course_id)
    concepts = (await db.execute(
        select(Concept).where(Concept.course_id == course_id).order_by(Concept.position, Concept.created_at)
    )).scalars().all()
    statuses = (await _concept_levels(db, user_id, [course_id])).get(course_id, {})
    return [concept_out(c, statuses.get(c.id, "not_enough_evidence")) for c in concepts]


async def extract_concepts_again(db: AsyncSession, user_id: str, course_id: str) -> CourseOut:
    """Re-run concept extraction over every indexed document (e.g. after the model was unavailable)."""
    from app.core.errors import ConflictError
    from app.modules.documents.jobs import enqueue_concept_extraction  # local: avoids an import cycle

    course = await get_owned_course(db, user_id, course_id)
    if course.concepts_status == "processing":
        raise ConflictError("Concepts are already being identified for this course.")
    doc_ids = (await db.execute(
        select(Document.id).where(Document.course_id == course.id, Document.status == "ready")
    )).scalars().all()
    if not doc_ids:
        raise ConflictError("Upload a document and wait until it is ready first.")
    for doc_id in doc_ids:
        await enqueue_concept_extraction(db, course.id, doc_id, user_id)
    course.concepts_status = "processing"
    await db.commit()
    return await get_course(db, user_id, course_id)
