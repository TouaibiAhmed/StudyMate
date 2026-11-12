"""Registry of job handlers and periodic tasks.

Feature modules register their handlers at import time:

    @job_handler("ingest_document")
    async def ingest(ctx: JobContext) -> dict | None: ...

    @periodic("exam_sweeper", every_s=30)
    async def sweep(db: AsyncSession) -> None: ...
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.jobs import queue
from app.jobs.models import Job


class RetryableJobError(Exception):
    """Raise for transient failures (model timeout, Ollama down) so the job is retried.

    `delay_s` overrides the default exponential backoff, e.g. to wait longer for a model runtime
    that is restarting.
    """

    def __init__(self, message: str, *, delay_s: float | None = None):
        super().__init__(message)
        self.delay_s = delay_s


@dataclass
class JobContext:
    job: Job
    sessions: async_sessionmaker[AsyncSession]

    @property
    def payload(self) -> dict[str, Any]:
        return self.job.payload

    async def progress(self, value: float, message: str | None = None) -> None:
        async with self.sessions() as db:
            await queue.set_progress(db, self.job.id, value, message)


JobHandler = Callable[[JobContext], Awaitable[dict[str, Any] | None]]
PeriodicTask = Callable[[AsyncSession], Awaitable[None]]


@dataclass(frozen=True)
class PeriodicSpec:
    name: str
    every_s: float
    fn: PeriodicTask


HANDLERS: dict[str, JobHandler] = {}
PERIODIC: dict[str, PeriodicSpec] = {}


def job_handler(kind: str) -> Callable[[JobHandler], JobHandler]:
    def register(fn: JobHandler) -> JobHandler:
        if kind in HANDLERS:
            raise ValueError(f"Duplicate job handler for kind {kind!r}")
        HANDLERS[kind] = fn
        return fn

    return register


def periodic(name: str, *, every_s: float) -> Callable[[PeriodicTask], PeriodicTask]:
    def register(fn: PeriodicTask) -> PeriodicTask:
        PERIODIC[name] = PeriodicSpec(name, every_s, fn)
        return fn

    return register
