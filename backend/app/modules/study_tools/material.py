"""Which excerpts each summary section / quiz batch is written from.

* With topics: one group per concept, made of the 3 chunks closest to the concept (by embedding).
* Without topics: the selected documents are cut into N contiguous parts (keeping the order of the
  material) and up to 3 chunks are sampled from each part.

Groups are small on purpose: a local model reads ~1,000 tokens quickly, not 20,000.
"""

from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.modules.courses.models import Concept
from app.modules.documents.models import Chunk, Document
from app.rag.evidence import EvidenceItem, EvidenceSet, label_for

CHUNKS_PER_GROUP = 3


class NoMaterialError(AppError):
    status_code, code = 409, "conflict"
    message = "Upload a document and wait until it is ready before generating study tools."


@dataclass
class MaterialGroup:
    focus: str | None
    evidence: EvidenceSet
    concept_id: str | None = None


async def ready_document_ids(db: AsyncSession, course_id: str, requested: list[str]) -> list[str]:
    rows = (await db.execute(
        select(Document.id).where(Document.course_id == course_id, Document.status == "ready")
        .order_by(Document.created_at)
    )).scalars().all()
    if requested:
        unknown = set(requested) - set(rows)
        if unknown:
            raise NotFoundError("One of the selected documents is not available in this course.")
        rows = [d for d in rows if d in set(requested)]
    if not rows:
        raise NoMaterialError()
    return list(rows)


async def validated_topics(db: AsyncSession, course_id: str, topic_ids: list[str]) -> list[Concept]:
    if not topic_ids:
        return []
    concepts = (await db.execute(
        select(Concept).where(Concept.course_id == course_id, Concept.id.in_(topic_ids))
    )).scalars().all()
    if len(concepts) != len(set(topic_ids)):
        raise NotFoundError("One of the selected topics is not part of this course.")
    order = {cid: i for i, cid in enumerate(topic_ids)}
    return sorted(concepts, key=lambda c: order[c.id])


def _evidence(rows: list) -> EvidenceSet:
    return EvidenceSet([
        EvidenceItem(label=label_for(i), chunk_id=r.id, document_id=r.document_id, document_title=r.filename,
                     page_start=r.page_start, page_end=r.page_end, text=r.text)
        for i, r in enumerate(rows)
    ])


async def material_groups(db: AsyncSession, document_ids: list[str], topics: list[Concept],
                          n_groups: int) -> list[MaterialGroup]:
    if topics:
        groups = []
        for concept in topics:
            if concept.embedding is None:
                continue
            rows = (await db.execute(text(
                "SELECT c.id, c.document_id, d.filename, c.page_start, c.page_end, c.text FROM chunks c "
                "JOIN documents d ON d.id = c.document_id WHERE c.document_id = ANY(CAST(:docs AS text[])) "
                "ORDER BY c.embedding <=> CAST(:v AS vector) LIMIT :k"
            ), {"docs": document_ids, "v": str([float(x) for x in concept.embedding]), "k": CHUNKS_PER_GROUP})).all()
            if rows:
                groups.append(MaterialGroup(concept.name, _evidence(rows), concept.id))
        return groups

    rows = (await db.execute(
        select(Chunk.id, Chunk.document_id, Document.filename, Chunk.page_start, Chunk.page_end, Chunk.text,
               Chunk.section_title)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.document_id.in_(document_ids))
        .order_by(Document.created_at, Chunk.chunk_index)
    )).all()
    if not rows:
        raise NoMaterialError()
    n = max(1, min(n_groups, len(rows)))
    groups = []
    for g in range(n):
        part = rows[g * len(rows) // n:(g + 1) * len(rows) // n]
        step = max(1, len(part) // CHUNKS_PER_GROUP)
        picked = part[::step][:CHUNKS_PER_GROUP]
        titles = Counter(r.section_title for r in part if r.section_title)
        groups.append(MaterialGroup(titles.most_common(1)[0][0] if titles else None, _evidence(picked)))
    return groups
