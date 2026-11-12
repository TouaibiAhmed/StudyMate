"""Study sessions and the learning record (doc section 17).

Source content (chunks), activities, raw attempts and evaluations are kept separate from the
derived learning state (concept_progress), which can always be recomputed from evidence.
Attempts and evaluations are never overwritten.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class StudySession(IdMixin, TimestampMixin, Base):
    __tablename__ = "study_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))
    topic: Mapped[str] = mapped_column(String(160))
    goal: Mapped[str] = mapped_column(String(300))
    knowledge_mode: Mapped[str] = mapped_column(String(24), default="course_grounded")
    # preparing | active | completed | abandoned | failed
    status: Mapped[str] = mapped_column(String(16), default="preparing")
    planned_activities: Mapped[int] = mapped_column(Integer, default=3)
    model_calls: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Activity(IdMixin, TimestampMixin, Base):
    """One question of a session, written by the tutor role. The rubric never leaves the server."""

    __tablename__ = "study_activities"
    __table_args__ = (UniqueConstraint("session_id", "sequence", name="uq_study_activities_session_sequence"),)

    session_id: Mapped[str] = mapped_column(ForeignKey("study_sessions.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))
    sequence: Mapped[int] = mapped_column(Integer)
    activity_type: Mapped[str] = mapped_column(String(24))
    difficulty: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="ready")  # ready | failed
    reason: Mapped[str] = mapped_column(String(300), default="")
    prompt: Mapped[str] = mapped_column(Text)
    context: Mapped[str | None] = mapped_column(Text)
    hints: Mapped[list[str]] = mapped_column(JSONB, default=list)
    explanation: Mapped[str] = mapped_column(Text, default="")
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    knowledge_mode: Mapped[str] = mapped_column(String(24))
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    source_chunk_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)  # the excerpts it was written from
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))


class Attempt(IdMixin, TimestampMixin, Base):
    __tablename__ = "study_attempts"

    activity_id: Mapped[str] = mapped_column(ForeignKey("study_activities.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    answer: Mapped[str] = mapped_column(Text)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    hints_used: Mapped[int] = mapped_column(Integer, default=0)
    explanation_viewed: Mapped[bool] = mapped_column(default=False)


class Evaluation(IdMixin, TimestampMixin, Base):
    __tablename__ = "study_evaluations"

    attempt_id: Mapped[str] = mapped_column(ForeignKey("study_attempts.id", ondelete="CASCADE"), unique=True)
    verdict: Mapped[str] = mapped_column(String(24))
    rubric_score: Mapped[float | None] = mapped_column(Float)
    strengths: Mapped[list[str]] = mapped_column(JSONB, default=list)
    gaps: Mapped[list[str]] = mapped_column(JSONB, default=list)
    misconception: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(String(8))
    next_activity: Mapped[str] = mapped_column(String(300), default="")
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    method: Mapped[str] = mapped_column(String(16), default="model")  # model | rule
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))


class LearningEvidence(IdMixin, TimestampMixin, Base):
    """One dated, concept-linked piece of evidence (FR-06). Exam answers arrive in step 6."""

    __tablename__ = "learning_evidence"
    __table_args__ = (Index("ix_learning_evidence_user_concept", "user_id", "concept_id"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id", ondelete="CASCADE"))
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    evaluation_id: Mapped[str | None] = mapped_column(ForeignKey("study_evaluations.id", ondelete="CASCADE"))
    verdict: Mapped[str] = mapped_column(String(24))
    confidence: Mapped[str] = mapped_column(String(8))
    difficulty: Mapped[str] = mapped_column(String(16))
    hints_used: Mapped[int] = mapped_column(Integer, default=0)
    conditions: Mapped[str] = mapped_column(String(16), default="practice")  # practice | exam
    knowledge_mode: Mapped[str] = mapped_column(String(24))


class ConceptProgress(TimestampMixin, Base):
    """Derived state, recomputed from learning_evidence after every new answer."""

    __tablename__ = "concept_progress"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    concept_id: Mapped[str] = mapped_column(ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(24))
    estimate: Mapped[float | None] = mapped_column(Float)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str] = mapped_column(String(300), default="")
    recommended_action: Mapped[str] = mapped_column(String(300), default="")
    last_evidence_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
