"""Recommendations of platform items: catalog courses and curated roadmaps (doc section 8).

Never other students' content, never generated roadmaps. Content-based and explainable:

1. Interest signals of the student, each an embedding with a weight and a human reason:
   profile field, target role, their own courses, followed roadmaps, concepts studied recently.
2. Item vectors (catalog courses, curated roadmaps), cached in recommendation_items.
3. score = cosine(weighted interest vector, item) + small domain boost.
   The reason shown is the single signal closest to the item.
4. Exclude what the student already has (enrolled, followed) or dismissed; re-rank with MMR so the
   list is not five variations of one topic.
"""

import hashlib
from dataclasses import dataclass
from datetime import timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import get_embedder
from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.modules.catalog.models import CatalogCourse
from app.modules.catalog.service import ensure_catalog
from app.modules.courses.models import Concept, Course
from app.modules.profile.models import StudentProfile
from app.modules.recommendations.models import RecommendationFeedback, RecommendationItem
from app.modules.recommendations.schemas import FeedbackIn, RecommendationOut
from app.modules.roadmaps.models import Roadmap, RoadmapNode, UserRoadmap
from app.modules.roadmaps.service import ensure_curated
from app.modules.study.models import ConceptProgress

DOMAIN_BOOST = 0.02
MMR_LAMBDA = 0.7
RECENT_STUDY = timedelta(days=30)
# Profile domain -> roadmap categories that usually fit it.
DOMAIN_CATEGORIES = {
    "Computer Science & IT": {"machine_learning", "engineering", "data"},
    "Engineering": {"engineering", "data"},
    "Business": {"business", "data"},
    "Health & Medicine": {"data"},
    "Humanities & Social Sciences": {"business", "data"},
}
CATEGORY_LABEL = {"data": "Data", "engineering": "Engineering", "machine_learning": "Machine learning",
                  "business": "Business"}


@dataclass
class Item:
    kind: str  # course | roadmap
    id: str
    title: str
    subtitle: str
    description: str
    text: str
    domains: set[str]  # course: profile domains; roadmap: {category}
    href: str


@dataclass
class Signal:
    reason: str
    weight: float
    vector: np.ndarray


def _unit(v) -> np.ndarray:
    a = np.asarray(v, dtype=np.float32)
    return a / (np.linalg.norm(a) + 1e-9)


# --- Items -------------------------------------------------------------------------------------------


async def _items(db: AsyncSession, kind: str) -> list[Item]:
    out: list[Item] = []
    if kind == "course":
        await ensure_catalog(db)
        for c in (await db.execute(select(CatalogCourse).order_by(CatalogCourse.title))).scalars():
            names = ", ".join(x["name"] for x in c.concepts)
            out.append(Item("course", c.id, c.title, f"{c.level} · {c.subject} · about {c.hours} h", c.description,
                            f"{c.title}. {c.subject}. {c.description} Topics: {names}", set(c.domains),
                            f"/courses?catalog={c.id}"))
    else:
        await ensure_curated(db)
        roadmaps = (await db.execute(select(Roadmap).where(Roadmap.source == "curated", Roadmap.status == "ready")
                                     .order_by(Roadmap.role))).scalars().all()
        for r in roadmaps:
            nodes = (await db.execute(select(RoadmapNode.title).where(RoadmapNode.roadmap_id == r.id)
                                      .order_by(RoadmapNode.position))).scalars().all()
            label = CATEGORY_LABEL.get(r.category, r.category)
            out.append(Item("roadmap", r.id, r.role, f"{label} · {len(nodes)} topics",
                            r.description, f"{r.role}. {r.description} Topics: {', '.join(nodes)}", {r.category},
                            f"/roadmaps/{r.id}"))
    return out


async def _vectors(db: AsyncSession, items: list[Item]) -> dict[str, np.ndarray]:
    """Item embeddings, recomputed only when an item's text changed."""
    if not items:
        return {}
    kind = items[0].kind
    cached = {r.ref_id: r for r in (await db.execute(select(RecommendationItem).where(
        RecommendationItem.kind == kind, RecommendationItem.ref_id.in_([i.id for i in items])))).scalars()}
    hashes = {i.id: hashlib.sha256(i.text.encode()).hexdigest() for i in items}
    stale = [i for i in items if i.id not in cached or cached[i.id].content_hash != hashes[i.id]]
    if stale:
        vectors = await get_embedder().embed_documents([i.text for i in stale])
        for item, vec in zip(stale, vectors, strict=True):
            row = cached.get(item.id) or RecommendationItem(kind=kind, ref_id=item.id)
            row.content_hash, row.embedding = hashes[item.id], vec
            db.add(row)
            cached[item.id] = row
        await db.commit()
    return {i.id: _unit(cached[i.id].embedding) for i in items}


# --- Interest signals --------------------------------------------------------------------------------


async def _signals(db: AsyncSession, user_id: str, profile: StudentProfile | None) -> list[Signal]:
    texts: list[tuple[str, float, str]] = []  # (reason, weight, text to embed)
    if profile:
        field = profile.specialization or profile.field_of_study or profile.domain
        about = ", ".join(x for x in (profile.field_of_study, profile.specialization, profile.domain) if x)
        if about:
            texts.append((f"Matches your field: {field}", 1.0, about))
        if profile.target_role:
            texts.append((f"Fits your target role: {profile.target_role}", 1.2, profile.target_role))

    courses = (await db.execute(select(Course).where(Course.user_id == user_id, Course.status == "active")
                                .order_by(Course.updated_at.desc()).limit(6))).scalars().all()
    for c in courses:
        names = (await db.execute(select(Concept.name).where(Concept.course_id == c.id)
                                  .order_by(Concept.position).limit(10))).scalars().all()
        texts.append((f"Related to your course {c.title}", 1.5,
                      f"{c.title}. {c.subject}. {c.description} Topics: {', '.join(names)}"))

    followed = (await db.execute(select(Roadmap).join(UserRoadmap, UserRoadmap.roadmap_id == Roadmap.id)
                                 .where(UserRoadmap.user_id == user_id, Roadmap.status == "ready"))).scalars().all()
    for r in followed:
        nodes = (await db.execute(select(RoadmapNode.title).where(RoadmapNode.roadmap_id == r.id)
                                  .order_by(RoadmapNode.position))).scalars().all()
        texts.append((f"Because you follow the {r.role} roadmap", 1.5,
                      f"{r.role}. {r.description} Topics: {', '.join(nodes)}"))

    signals: list[Signal] = []
    if texts:
        vectors = await get_embedder().embed_documents([t for _, _, t in texts])
        signals = [Signal(reason, weight, _unit(v)) for (reason, weight, _), v in zip(texts, vectors, strict=True)]

    studied = (await db.execute(
        select(Concept.name, Concept.embedding).join(ConceptProgress, ConceptProgress.concept_id == Concept.id)
        .where(ConceptProgress.user_id == user_id, ConceptProgress.last_evidence_at >= utcnow() - RECENT_STUDY,
               Concept.embedding.is_not(None))
        .order_by(ConceptProgress.last_evidence_at.desc()).limit(12))).all()
    if studied:
        mean = _unit(np.mean([_unit(e) for _, e in studied], axis=0))
        names = " and ".join(n for n, _ in studied[:2])
        signals.append(Signal(f"Builds on what you are studying: {names}", 1.0, mean))
    return signals


# --- Ranking -----------------------------------------------------------------------------------------


async def _excluded(db: AsyncSession, user_id: str, kind: str) -> set[str]:
    dismissed = set((await db.execute(select(RecommendationFeedback.ref_id).where(
        RecommendationFeedback.user_id == user_id, RecommendationFeedback.kind == kind,
        RecommendationFeedback.action == "dismiss"))).scalars())
    if kind == "course":
        owned = set((await db.execute(select(Course.catalog_course_id).where(
            Course.user_id == user_id, Course.catalog_course_id.is_not(None), Course.status == "active"))).scalars())
    else:
        owned = set((await db.execute(select(UserRoadmap.roadmap_id).where(UserRoadmap.user_id == user_id)))
                    .scalars())
    return dismissed | owned


def _supports(signals: list[Signal], ids: list[str], vectors: dict[str, np.ndarray]) -> dict[int, set[str]]:
    """Items a signal can honestly be named as the reason for: its top few among ALL items.

    Cosine values of a small embedding model are compressed (unrelated pairs score 0.8+), so an
    absolute threshold misleads; rank within the catalog is robust. A weak signal claims nothing.
    """
    top = max(1, len(ids) // 5)
    out: dict[int, set[str]] = {}
    for s in signals:
        ranked = sorted(ids, key=lambda i: float(s.vector @ vectors[i]), reverse=True)
        out[id(s)] = set(ranked[:top])
    return out


def _mmr(candidates: list[tuple[Item, float]], vectors: dict[str, np.ndarray], limit: int) -> list[tuple[Item, float]]:
    chosen: list[tuple[Item, float]] = []
    pool = list(candidates)
    while pool and len(chosen) < limit:
        def value(entry: tuple[Item, float]) -> float:
            redundancy = max((float(vectors[entry[0].id] @ vectors[c.id]) for c, _ in chosen), default=0.0)
            return MMR_LAMBDA * entry[1] - (1 - MMR_LAMBDA) * redundancy
        best = max(pool, key=value)
        chosen.append(best)
        pool.remove(best)
    return chosen


async def recommend(db: AsyncSession, user_id: str, kind: str, limit: int = 4) -> list[RecommendationOut]:
    profile = await db.get(StudentProfile, user_id)
    items = await _items(db, kind)
    vectors = await _vectors(db, items)
    excluded = await _excluded(db, user_id, kind)
    catalog_ids = [i.id for i in items]  # every item, for rank-based reasons
    if kind == "course":  # a course the student already made themselves under the same name
        own = {" ".join(t.lower().split()) for t in (await db.execute(select(Course.title).where(
            Course.user_id == user_id, Course.status == "active"))).scalars()}
        excluded |= {i.id for i in items if " ".join(i.title.lower().split()) in own}
    items = [i for i in items if i.id not in excluded]
    if not items:
        return []
    signals = await _signals(db, user_id, profile)
    domain = profile.domain if profile else None
    fitting = (DOMAIN_CATEGORIES.get(domain or "", set()) if kind == "roadmap" else {domain} if domain else set())

    scored: list[tuple[Item, float, list[str]]] = []
    if signals:
        weights = np.array([s.weight for s in signals], dtype=np.float32)
        interest = _unit((weights[:, None] * np.stack([s.vector for s in signals])).sum(axis=0))
        supports = _supports(signals, catalog_ids, vectors)
        for item in items:
            score = float(interest @ vectors[item.id])
            backing = [s for s in signals if item.id in supports[id(s)]]
            backing.sort(key=lambda s: (s.weight, float(s.vector @ vectors[item.id])), reverse=True)
            reasons = [s.reason for s in backing[:2]]
            if item.domains & fitting:
                score += DOMAIN_BOOST
                if domain:
                    reasons.append(f"Common in {domain}")
            scored.append((item, score, reasons or ["Broadens your skills beyond your current topics"]))
    else:  # no profile and no activity yet: a stable, neutral order
        scored = [(item, 0.0, ["A good place to start"]) for item in items]

    reasons_by_id = {item.id: reasons for item, _, reasons in scored}
    ranked = sorted(((item, score) for item, score, _ in scored), key=lambda x: x[1], reverse=True)
    picked = _mmr(ranked, vectors, limit)
    return [RecommendationOut(kind=item.kind, item_id=item.id, title=item.title, subtitle=item.subtitle,
                              description=item.description, reason=reasons_by_id[item.id][0],
                              reasons=reasons_by_id[item.id], score=round(score, 4), href=item.href)
            for item, score in picked]


async def feedback(db: AsyncSession, user_id: str, data: FeedbackIn) -> None:
    exists = (await db.get(CatalogCourse, data.item_id) if data.kind == "course"
              else await db.get(Roadmap, data.item_id))
    if exists is None or (data.kind == "roadmap" and exists.owner_id is not None):
        raise NotFoundError("Recommendation not found.")
    row = await db.get(RecommendationFeedback, (user_id, data.kind, data.item_id))
    if row is None:
        db.add(RecommendationFeedback(user_id=user_id, kind=data.kind, ref_id=data.item_id, action=data.action))
    else:
        row.action = data.action
    await db.commit()


async def clear_feedback(db: AsyncSession, user_id: str) -> int:
    rows = (await db.execute(select(RecommendationFeedback).where(RecommendationFeedback.user_id == user_id))
            ).scalars().all()
    for r in rows:
        await db.delete(r)
    await db.commit()
    return len(rows)
