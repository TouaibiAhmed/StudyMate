"""Records model calls. Uses its own DB session so a trace survives a rolled-back request."""

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.ai.models import AICall

log = logging.getLogger(__name__)


@dataclass
class CallTrace:
    role: str
    provider: str
    model: str
    tier: str
    status: str = "ok"
    prompt_version: str | None = None
    attempts: int = 1
    latency_ms: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    user_id: str | None = None
    subject: str | None = None
    source_chunk_ids: list[str] | None = None
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


class Tracer(Protocol):
    async def record(self, trace: CallTrace) -> None: ...


class NullTracer:
    async def record(self, trace: CallTrace) -> None:
        return None


class MemoryTracer:
    """For tests."""

    def __init__(self) -> None:
        self.traces: list[CallTrace] = []

    async def record(self, trace: CallTrace) -> None:
        self.traces.append(trace)


class DbTracer:
    async def record(self, trace: CallTrace) -> None:
        from app.db.session import SessionFactory

        try:
            async with SessionFactory() as db:
                db.add(AICall(**{k: v for k, v in trace.__dict__.items() if k != "meta"}, meta=trace.meta or None))
                await db.commit()
        except Exception:  # noqa: BLE001 - tracing must never break the user-facing call
            log.warning("Could not record AI call trace", exc_info=True)
