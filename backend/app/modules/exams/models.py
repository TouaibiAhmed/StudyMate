"""Timed practice exams (doc section 14).

Questions and rubrics are stored when the exam is generated, before any attempt starts, so model
latency never consumes exam time and grading is reproducible (doc 17.1).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class PracticeExam(IdMixin, TimestampMixin, Base):
    __tablename__ = "practice_exams"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    topic_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    question_count: Mapped[int] = mapped_column(Integer)
    time_limit_s: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="preparing")  # preparing | ready | failed
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    stage: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(String(40))


class ExamQuestion(IdMixin, TimestampMixin, Base):
    __tablename__ = "exam_questions"

    exam_id: Mapped[str] = mapped_column(ForeignKey("practice_exams.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(20))  # multiple_choice | short_answer
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str] | None] = mapped_column(JSONB)
    answer: Mapped[str] = mapped_column(Text)  # correct option, or a model answer
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # required_ideas, ...
    explanation: Mapped[str] = mapped_column(Text, default="")
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    source_chunk_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)


class ExamAttempt(IdMixin, TimestampMixin, Base):
    __tablename__ = "exam_attempts"

    exam_id: Mapped[str] = mapped_column(ForeignKey("practice_exams.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    course_id: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")  # in_progress | submitted
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    # pending | grading | graded | failed (grading runs in the worker after submission)
    grading_status: Mapped[str] = mapped_column(String(16), default="pending")
    grading_progress: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float | None] = mapped_column(Float)


class ExamAnswer(IdMixin, TimestampMixin, Base):
    __tablename__ = "exam_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_exam_answers_attempt_question"),)

    attempt_id: Mapped[str] = mapped_column(ForeignKey("exam_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("exam_questions.id", ondelete="CASCADE"))
    answer: Mapped[str] = mapped_column(Text, default="")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    # Filled by grading
    verdict: Mapped[str | None] = mapped_column(String(24))
    confidence: Mapped[str | None] = mapped_column(String(8))
    strengths: Mapped[list[str]] = mapped_column(JSONB, default=list)
    gaps: Mapped[list[str]] = mapped_column(JSONB, default=list)
    misconception: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str | None] = mapped_column(String(16))  # exact | model | empty
