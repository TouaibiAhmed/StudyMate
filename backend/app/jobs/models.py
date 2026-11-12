"""Background job table. Postgres is the queue (claimed with SELECT ... FOR UPDATE SKIP LOCKED)."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Job(IdMixin, TimestampMixin, Base):
    __tablename__ = "jobs"

    kind: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default=JobStatus.QUEUED, server_default=JobStatus.QUEUED)
    # Lower runs first. Interactive pre-generation uses 0, bulk generation 10.
    priority: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    # The domain object this job produces or processes (e.g. "document:<id>", "quiz:<id>").
    subject: Mapped[str | None] = mapped_column(String(80), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    progress: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    progress_message: Mapped[str | None] = mapped_column(String(200))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(64))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_jobs_claim", "status", "priority", "run_after"),)
