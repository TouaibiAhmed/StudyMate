"""FastAPI application entry point.

Run (development):  uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai.llm.factory import get_llm
from app.api import health
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import RequestIdMiddleware, configure_logging
from app.db.session import engine
from app.modules import feature_routers, load_modules


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await get_llm().provider.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    load_modules()

    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/api/docs",
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # the session lives in an httpOnly cookie
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-request-id"],
    )
    install_error_handlers(app)

    app.include_router(health.router)
    for router in feature_routers():
        app.include_router(router)
    return app


app = create_app()
