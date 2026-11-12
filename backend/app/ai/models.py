"""Audit trail for every model call (the doc's traceability requirement, section 7.1).

Stores which role ran, with which model and prompt version, how long it took and which source
chunks it saw. Prompt text and student answers are NOT stored here.
"""

from typing import Any

from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class AICall(IdMixin, TimestampMixin, Base):
    __tablename__ = "ai_calls"

    role: Mapped[str] = mapped_column(String(48), index=True)  # e.g. "tutor", "assessment"
    prompt_version: Mapped[str | None] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(24))
    model: Mapped[str] = mapped_column(String(80))
    tier: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(24))  # ok | invalid_output | timeout | unavailable | error
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    subject: Mapped[str | None] = mapped_column(String(80))  # e.g. "session:<id>", "quiz:<id>"
    source_chunk_ids: Mapped[list[str] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
