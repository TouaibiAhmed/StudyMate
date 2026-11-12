"""Built-in jobs used by the worker itself and by tests."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs import queue
from app.jobs.registry import JobContext, job_handler, periodic


@job_handler("system.echo")
async def echo(ctx: JobContext) -> dict:
    await ctx.progress(0.5, "halfway")
    return {"echo": ctx.payload}


@periodic("system.requeue_stale_jobs", every_s=60)
async def requeue_stale_jobs(db: AsyncSession) -> None:
    # A job "running" for more than 30 min without finishing belongs to a dead worker.
    await queue.requeue_stale(db, timedelta(minutes=30))
