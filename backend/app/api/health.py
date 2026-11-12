"""Liveness and readiness endpoints."""

import asyncio

from fastapi import APIRouter, Response
from sqlalchemy import text

from app.ai.llm.factory import get_llm
from app.core.config import get_settings
from app.core.schemas import CamelModel
from app.db.session import SessionFactory

router = APIRouter(prefix="/api/health", tags=["health"])


class Check(CamelModel):
    ok: bool
    detail: str | None = None


class Readiness(CamelModel):
    status: str
    database: Check
    vector_extension: Check
    llm: Check


@router.get("")
async def live() -> dict:
    return {"status": "ok"}


async def _db_checks() -> tuple[Check, Check]:
    try:
        async with SessionFactory() as db:
            await db.execute(text("SELECT 1"))
            has_vector = (
                await db.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
            ).scalar_one_or_none()
        return Check(ok=True), Check(ok=bool(has_vector), detail=None if has_vector else "run migrations")
    except Exception:  # noqa: BLE001
        return Check(ok=False, detail="database unreachable"), Check(ok=False, detail="database unreachable")


async def _llm_check() -> Check:
    s = get_settings()
    try:
        installed = set(await asyncio.wait_for(get_llm().provider.list_models(), timeout=5))
    except Exception:  # noqa: BLE001
        return Check(ok=False, detail="Ollama unreachable")
    missing = sorted({s.llm_fast_model, s.llm_quality_model} - installed)
    if missing:
        return Check(ok=False, detail=f"missing models: {', '.join(missing)}")
    return Check(ok=True)


@router.get("/ready", response_model=Readiness)
async def ready(response: Response) -> Readiness:
    (db, vector), llm = await asyncio.gather(_db_checks(), _llm_check())
    ok = db.ok and vector.ok and llm.ok
    response.status_code = 200 if ok else 503
    return Readiness(status="ready" if ok else "degraded", database=db, vector_extension=vector, llm=llm)
