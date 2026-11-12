"""Feature modules (vertical slices).

Each feature lives in `app/modules/<name>/` with the same layout:

    models.py      SQLAlchemy tables owned by the feature
    schemas.py     API request/response models (camelCase)
    repository.py  data access, always scoped by owner
    service.py     business rules; the only layer that commits
    router.py      FastAPI routes (thin)
    jobs.py        background job handlers / periodic tasks (optional)

`load_modules()` imports every module so its tables, routes and job handlers are registered.
Add a feature by appending its package name to FEATURES.
"""

import importlib

# Built in order (see docs/ARCHITECTURE.md, "Build order").
FEATURES: list[str] = ["auth", "profile", "courses", "documents"]

_SUBMODULES = ("models", "jobs")


def load_modules() -> None:
    importlib.import_module("app.jobs.builtin")
    importlib.import_module("app.ai.models")
    for feature in FEATURES:
        for sub in _SUBMODULES:
            name = f"app.modules.{feature}.{sub}"
            try:
                importlib.import_module(name)
            except ModuleNotFoundError as exc:
                if exc.name != name:
                    raise


def feature_routers() -> list:
    routers = []
    for feature in FEATURES:
        try:
            mod = importlib.import_module(f"app.modules.{feature}.router")
        except ModuleNotFoundError as exc:
            if exc.name != f"app.modules.{feature}.router":
                raise
            continue
        routers.append(mod.router)
    return routers
