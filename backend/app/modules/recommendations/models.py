"""Recommendation index and feedback (step 9).

RecommendationItem keeps one embedding per recommendable platform item (catalog course or curated
roadmap). It is rebuilt when the item's text changes (content_hash). Feedback records what a
student dismissed, so it is never suggested to them again.
"""

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, TimestampMixin

EMBED_DIM = get_settings().embedding_dim


class RecommendationItem(TimestampMixin, Base):
    __tablename__ = "recommendation_items"

    kind: Mapped[str] = mapped_column(String(16), primary_key=True)  # course | roadmap
    ref_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM))


class RecommendationFeedback(TimestampMixin, Base):
    __tablename__ = "recommendation_feedback"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    ref_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    action: Mapped[str] = mapped_column(String(16))  # dismiss
