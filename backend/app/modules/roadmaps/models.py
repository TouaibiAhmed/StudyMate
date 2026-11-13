"""Learning roadmaps (doc section 15).

Curated roadmaps are shared platform content (owner_id NULL). Generated roadmaps belong to the student
who asked for them and stay private. A student's position on a roadmap lives in RoadmapNodeProgress:
the manual status they set, and the study sessions they started from a node. Evidence-based status is
derived on read from their learning profile, so it never goes stale.
"""

from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, IdMixin, TimestampMixin

EMBED_DIM = get_settings().embedding_dim


class Roadmap(IdMixin, TimestampMixin, Base):
    __tablename__ = "roadmaps"

    slug: Mapped[str | None] = mapped_column(String(80), unique=True)  # curated only
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(16))  # curated | generated
    role: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(32))  # data | engineering | machine_learning | business
    description: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    goal: Mapped[str | None] = mapped_column(Text)  # what the student asked for (generated)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="ready")  # generating | ready | failed
    progress: Mapped[float] = mapped_column(Float, default=1.0)
    stage: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(String(80))


class RoadmapNode(IdMixin, TimestampMixin, Base):
    __tablename__ = "roadmap_nodes"
    __table_args__ = (UniqueConstraint("roadmap_id", "key", name="uq_roadmap_nodes_roadmap_key"),)

    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(80))  # stable across content versions
    position: Mapped[int] = mapped_column(Integer)  # learning order
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    optional: Mapped[bool] = mapped_column(Boolean, default=False)
    prerequisites: Mapped[list[str]] = mapped_column(JSONB, default=list)  # node keys
    resources: Mapped[list[str]] = mapped_column(JSONB, default=list)  # kinds of resources, no URLs
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    # Used to connect the node with concepts of the student's own courses; filled lazily.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))


class UserRoadmap(IdMixin, TimestampMixin, Base):
    """A roadmap the student follows (an interest signal for recommendations, too)."""

    __tablename__ = "user_roadmaps"
    __table_args__ = (UniqueConstraint("user_id", "roadmap_id", name="uq_user_roadmaps_user_roadmap"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    roadmap_version: Mapped[int] = mapped_column(Integer, default=1)
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoadmapNodeProgress(TimestampMixin, Base):
    __tablename__ = "roadmap_node_progress"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("roadmap_nodes.id", ondelete="CASCADE"), primary_key=True)
    # not_started | in_progress | completed | known, set by the student; NULL = follow the evidence
    manual_status: Mapped[str | None] = mapped_column(String(16))
    session_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
