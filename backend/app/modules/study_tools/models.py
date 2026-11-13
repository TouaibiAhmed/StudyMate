"""Summaries and practice quizzes generated from a course's material.

Answer keys and rubrics live only in quiz_questions and are never sent before submission.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class _Generated:
    """Shared fields of a background-generated artifact."""

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | processing | ready | failed
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    stage: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(40), default="English")
    topic_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    source_document_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    knowledge_mode: Mapped[str] = mapped_column(String(24), default="course_grounded")
    prompt_version: Mapped[str | None] = mapped_column(String(40))


class Summary(IdMixin, TimestampMixin, _Generated, Base):
    __tablename__ = "summaries"

    length: Mapped[str] = mapped_column(String(16))  # Short | Medium | Detailed
    structure: Mapped[str] = mapped_column(String(32))  # Key Concepts | Definitions | Important Points | ...
    sections: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)  # [{heading, points}]


class Quiz(IdMixin, TimestampMixin, _Generated, Base):
    __tablename__ = "quizzes"

    question_count: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[str] = mapped_column(String(16))  # Easy | Medium | Hard | Mixed
    question_types: Mapped[list[str]] = mapped_column(JSONB, default=list)


class QuizQuestion(IdMixin, TimestampMixin, Base):
    __tablename__ = "quiz_questions"

    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(20))  # Multiple Choice | True/False | Short Answer
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str] | None] = mapped_column(JSONB)
    answer: Mapped[str] = mapped_column(Text)  # the correct option, True/False, or a model answer
    explanation: Mapped[str] = mapped_column(Text, default="")
    required_ideas: Mapped[list[str]] = mapped_column(JSONB, default=list)  # short answers only
    concept_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)


class QuizAttempt(IdMixin, TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")  # in_progress | submitted
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    unanswered_count: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float | None] = mapped_column(Float)


class QuizAnswer(IdMixin, TimestampMixin, Base):
    __tablename__ = "quiz_answers"

    attempt_id: Mapped[str] = mapped_column(ForeignKey("quiz_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("quiz_questions.id", ondelete="CASCADE"))
    answer: Mapped[str] = mapped_column(Text, default="")
    is_correct: Mapped[bool] = mapped_column(default=False)
    method: Mapped[str] = mapped_column(String(16))  # exact | model | empty
    feedback: Mapped[str | None] = mapped_column(Text)
