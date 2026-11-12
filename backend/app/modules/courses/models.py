from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.db.base import Base, IdMixin, TimestampMixin

EMBED_DIM = get_settings().embedding_dim


class Course(IdMixin, TimestampMixin, Base):
    __tablename__ = "courses"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text, default="")
    domain: Mapped[str | None] = mapped_column(String(120))
    domain_type: Mapped[str] = mapped_column(String(24), default="conceptual")
    status: Mapped[str] = mapped_column(String(16), default="active")
    # idle | processing | ready | failed - concept extraction across the course's documents
    concepts_status: Mapped[str] = mapped_column(String(16), default="idle")


class Concept(IdMixin, TimestampMixin, Base):
    """A study concept of a course (doc 11.1). Proposed by the model, editable by the student."""

    __tablename__ = "concepts"
    __table_args__ = (UniqueConstraint("course_id", "normalized_name", name="uq_concepts_course_name"),)

    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(120))
    normalized_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    aliases: Mapped[list[str]] = mapped_column(JSONB, default=list)
    prerequisite_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # [{"documentId", "pageStart", "pageEnd"}] - where the concept is covered
    source_refs: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    origin: Mapped[str] = mapped_column(String(16), default="extracted")  # extracted | manual
    position: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM))
