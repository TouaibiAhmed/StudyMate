"""Shared fixtures. Tests run against the separate `studymate_test` database."""

import asyncio
import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://studymate:studymate@localhost:5433/studymate_test")
os.environ.setdefault("APP_ENV", "test")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionFactory, engine  # noqa: E402
from app.modules import load_modules  # noqa: E402

load_modules()


@pytest.fixture
async def db_ready():
    """Fresh schema per test; skips when the test database is not running."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, ConnectionError) as exc:
        pytest.skip(f"test database unavailable: {exc}")
    yield SessionFactory
    await engine.dispose()


@pytest.fixture
async def api(db_ready):
    """HTTP client against the real app (cookies persist between requests, like a browser)."""
    import httpx

    from app.main import app
    from app.modules.auth.security import login_limiter

    login_limiter._events.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


SIGNUP = {
    "name": "Ada Student",
    "email": "Ada@Example.com",
    "password": "correct-horse-1",
    "domain": "Computer Science & IT",
    "specialization": "Data Science",
    "fieldOfStudy": "Data Science",
    "level": "Master's",
    "preferredLanguage": "English",
    "timeZone": "Africa/Tunis",
    "targetRole": "ML Engineer",
}
