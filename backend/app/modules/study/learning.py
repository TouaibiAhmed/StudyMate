"""Evidence -> concept state. Thin persistence layer around app.learning.policy."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.learning.policy import ConceptState, EvidencePoint, concept_state
from app.modules.study.models import ConceptProgress, LearningEvidence


async def evidence_points(db: AsyncSession, user_id: str, concept_id: str) -> list[EvidencePoint]:
    rows = (await db.execute(
        select(LearningEvidence).where(LearningEvidence.user_id == user_id, LearningEvidence.concept_id == concept_id)
        .order_by(LearningEvidence.created_at)
    )).scalars().all()
    return [EvidencePoint(verdict=r.verdict, created_at=r.created_at, difficulty=r.difficulty, hints_used=r.hints_used,
                          confidence=r.confidence, exam=r.conditions == "exam",
                          general_knowledge=r.knowledge_mode == "general_knowledge") for r in rows]


async def current_state(db: AsyncSession, user_id: str, concept_id: str) -> ConceptState:
    return concept_state(await evidence_points(db, user_id, concept_id), utcnow())


async def recompute(db: AsyncSession, user_id: str, concept_id: str) -> ConceptState:
    """Recalculate and store the derived state (call after adding evidence; caller commits)."""
    await db.flush()
    points = await evidence_points(db, user_id, concept_id)
    state = concept_state(points, utcnow())
    row = await db.get(ConceptProgress, (user_id, concept_id))
    if row is None:
        row = ConceptProgress(user_id=user_id, concept_id=concept_id)
        db.add(row)
    row.status = state.status.value
    row.estimate = state.estimate
    row.evidence_count = state.evidence_count
    row.reason = state.reason
    row.recommended_action = state.recommended_action
    row.last_evidence_at = max((p.created_at for p in points), default=None)
    return state
