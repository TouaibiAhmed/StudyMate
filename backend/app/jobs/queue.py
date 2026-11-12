"""Enqueue, claim and complete background jobs."""

from datetime import timedelta
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.base import utcnow
from app.jobs.models import Job, JobStatus


async def enqueue(
    db: AsyncSession,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    user_id: str | None = None,
    subject: str | None = None,
    priority: int = 10,
    max_attempts: int | None = None,
) -> Job:
    """Add a job in the caller's transaction (the caller commits, so the job and its domain row
    appear atomically)."""
    job = Job(
        kind=kind,
        payload=payload or {},
        user_id=user_id,
        subject=subject,
        priority=priority,
        max_attempts=max_attempts or get_settings().job_max_attempts,
    )
    db.add(job)
    await db.flush()
    return job


_CLAIM_SQL = text(
    """
    UPDATE jobs SET status = 'running', locked_at = now(), locked_by = :worker,
                    attempts = attempts + 1, updated_at = now()
    WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued' AND run_after <= now() AND kind = ANY(:kinds)
        ORDER BY priority, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id
    """
)


async def claim_next(db: AsyncSession, worker_id: str, kinds: list[str]) -> Job | None:
    job_id = (await db.execute(_CLAIM_SQL, {"worker": worker_id, "kinds": kinds})).scalar_one_or_none()
    await db.commit()
    if job_id is None:
        return None
    return await db.get(Job, job_id, populate_existing=True)


async def set_progress(db: AsyncSession, job_id: str, progress: float, message: str | None = None) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(progress=max(0.0, min(1.0, progress)), progress_message=message, updated_at=utcnow())
    )
    await db.commit()


async def mark_succeeded(db: AsyncSession, job_id: str, result: dict[str, Any] | None = None) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status=JobStatus.SUCCEEDED, result=result, progress=1.0, finished_at=utcnow(), error=None)
    )
    await db.commit()


async def mark_failed(
    db: AsyncSession, job: Job, error: str, *, retryable: bool, delay_s: float | None = None
) -> None:
    """Retry with backoff while attempts remain, otherwise fail permanently."""
    if retryable and job.attempts < job.max_attempts:
        delay = delay_s if delay_s is not None else 10 * 2 ** (job.attempts - 1)
        values = {
            "status": JobStatus.QUEUED,
            "run_after": utcnow() + timedelta(seconds=delay),
            "error": error[:2000],
            "locked_at": None,
            "locked_by": None,
        }
    else:
        values = {"status": JobStatus.FAILED, "error": error[:2000], "finished_at": utcnow()}
    await db.execute(update(Job).where(Job.id == job.id).values(**values))
    await db.commit()


async def requeue_stale(db: AsyncSession, older_than: timedelta) -> int:
    """Jobs left 'running' by a crashed worker go back to the queue."""
    result = await db.execute(
        update(Job)
        .where(Job.status == JobStatus.RUNNING, Job.locked_at < utcnow() - older_than)
        .values(status=JobStatus.QUEUED, locked_at=None, locked_by=None)
    )
    await db.commit()
    return result.rowcount or 0


async def get_job(db: AsyncSession, job_id: str, *, user_id: str | None = None) -> Job | None:
    stmt = select(Job).where(Job.id == job_id)
    if user_id is not None:
        stmt = stmt.where(Job.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()
