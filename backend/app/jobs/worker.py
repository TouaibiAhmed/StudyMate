"""Background worker process.

Run with:  python -m app.jobs.worker

Runs one job at a time (the local LLM handles one request at a time anyway), plus periodic
tasks (exam sweeper, stale-job recovery, ...) in a separate loop so a long generation job never
delays an exam auto-submit.
"""

import asyncio
import logging
import os
import signal
import socket
import time

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionFactory
from app.jobs import queue
from app.jobs.registry import HANDLERS, PERIODIC, JobContext, RetryableJobError
from app.modules import load_modules

log = logging.getLogger("app.worker")


class Worker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.worker_id = f"{socket.gethostname()}:{os.getpid()}"
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        load_modules()
        log.info("Worker %s started; handlers=%s periodic=%s", self.worker_id, sorted(HANDLERS), sorted(PERIODIC))
        await asyncio.gather(self._job_loop(), self._periodic_loop())

    async def run_once(self) -> bool:
        """Claim and run a single job. Returns False when the queue is empty."""
        async with SessionFactory() as db:
            job = await queue.claim_next(db, self.worker_id, list(HANDLERS))
        if job is None:
            return False
        handler = HANDLERS[job.kind]
        started = time.perf_counter()
        log.info("Job %s (%s) started, attempt %d", job.id, job.kind, job.attempts)
        try:
            result = await handler(JobContext(job=job, sessions=SessionFactory))
        except RetryableJobError as exc:
            async with SessionFactory() as db:
                await queue.mark_failed(db, job, str(exc), retryable=True)
            log.warning("Job %s failed (retryable): %s", job.id, exc)
        except Exception as exc:  # noqa: BLE001 - a handler bug must not kill the worker
            async with SessionFactory() as db:
                await queue.mark_failed(db, job, f"{type(exc).__name__}: {exc}", retryable=False)
            log.exception("Job %s failed", job.id)
        else:
            async with SessionFactory() as db:
                await queue.mark_succeeded(db, job.id, result)
            log.info("Job %s done in %.1fs", job.id, time.perf_counter() - started)
        return True

    async def _job_loop(self) -> None:
        while not self._stop.is_set():
            try:
                worked = await self.run_once()
            except Exception:  # noqa: BLE001 - e.g. database briefly unavailable
                log.exception("Worker loop error")
                worked = False
            if not worked:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.settings.worker_poll_interval_s)
                except TimeoutError:
                    pass

    async def _periodic_loop(self) -> None:
        last_run: dict[str, float] = {}
        while not self._stop.is_set():
            now = time.monotonic()
            for spec in PERIODIC.values():
                if now - last_run.get(spec.name, 0.0) < spec.every_s:
                    continue
                last_run[spec.name] = now
                try:
                    async with SessionFactory() as db:
                        await spec.fn(db)
                except Exception:  # noqa: BLE001
                    log.exception("Periodic task %s failed", spec.name)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=1.0)
            except TimeoutError:
                pass


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    if os.name == "nt":
        # asyncpg + Windows: the selector loop avoids Proactor shutdown noise.
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    worker = Worker()
    loop = asyncio.new_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except NotImplementedError:  # Windows
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(worker.stop))
    try:
        loop.run_until_complete(worker.run())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
