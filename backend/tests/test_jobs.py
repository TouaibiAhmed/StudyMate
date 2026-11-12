import pytest
from sqlalchemy import update

from app.jobs import queue
from app.jobs.models import Job, JobStatus
from app.jobs.registry import HANDLERS, JobContext, RetryableJobError
from app.jobs.worker import Worker

pytestmark = pytest.mark.integration


async def test_echo_job_runs_to_success(db_ready):
    async with db_ready() as db:
        job = await queue.enqueue(db, "system.echo", {"hello": "world"}, user_id="u1")
        await db.commit()

    assert await Worker().run_once() is True
    assert await Worker().run_once() is False  # queue drained

    async with db_ready() as db:
        done = await db.get(Job, job.id)
    assert done.status == JobStatus.SUCCEEDED
    assert done.result == {"echo": {"hello": "world"}}
    assert done.progress == 1.0 and done.attempts == 1


async def test_retryable_failure_is_requeued_then_fails(db_ready, monkeypatch):
    async def flaky(ctx: JobContext):
        raise RetryableJobError("model timeout")

    monkeypatch.setitem(HANDLERS, "test.flaky", flaky)
    async with db_ready() as db:
        job = await queue.enqueue(db, "test.flaky", max_attempts=2)
        await db.commit()

    await Worker().run_once()
    async with db_ready() as db:
        j = await db.get(Job, job.id)
        assert (j.status, j.attempts, j.error) == (JobStatus.QUEUED, 1, "model timeout")
        assert j.run_after > j.created_at  # backoff
        await db.execute(update(Job).where(Job.id == job.id).values(run_after=j.created_at))
        await db.commit()

    await Worker().run_once()
    async with db_ready() as db:
        j = await db.get(Job, job.id, populate_existing=True)
    assert (j.status, j.attempts) == (JobStatus.FAILED, 2)


async def test_handler_bug_fails_without_retry(db_ready, monkeypatch):
    async def broken(ctx: JobContext):
        raise KeyError("oops")

    monkeypatch.setitem(HANDLERS, "test.broken", broken)
    async with db_ready() as db:
        job = await queue.enqueue(db, "test.broken")
        await db.commit()
    await Worker().run_once()
    async with db_ready() as db:
        j = await db.get(Job, job.id)
    assert j.status == JobStatus.FAILED and j.attempts == 1 and "KeyError" in j.error


async def test_priority_order(db_ready):
    async with db_ready() as db:
        low = await queue.enqueue(db, "system.echo", {"n": "bulk"}, priority=10)
        high = await queue.enqueue(db, "system.echo", {"n": "interactive"}, priority=0)
        await db.commit()
        claimed = await queue.claim_next(db, "w", ["system.echo"])
    assert claimed.id == high.id != low.id
