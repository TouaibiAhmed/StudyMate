# StudyMate backend

FastAPI API + background worker + local AI (Ollama). Architecture: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Prerequisites

* Docker Desktop (runs Postgres 17 + pgvector)
* [Ollama](https://ollama.com) on the host, with the configured models pulled (`ollama pull llama3.1:8b`)
* [uv](https://docs.astral.sh/uv/) (`python -m pip install --user uv`)

## First-time setup (PowerShell, from `StudyMate/`)

```powershell
docker compose up -d db
cd backend
python -m uv sync --extra embeddings     # creates .venv with Python 3.12
Copy-Item .env.example .env              # then set SECRET_KEY
.venv\Scripts\alembic upgrade head
```

## Run

Three terminals:

```powershell
cd backend; .venv\Scripts\uvicorn app.main:app --reload --port 8000   # API  (docs: http://localhost:8000/api/docs)
cd backend; .venv\Scripts\python -m app.jobs.worker                    # background worker
cd frontend; npm run dev                                                # UI   (http://localhost:5173)
```

Check: `http://localhost:8000/api/health/ready` should report database, vector extension and LLM as ok.

## Tests

```powershell
cd backend
.venv\Scripts\python -m pytest            # unit tests; DB tests skip if Postgres is down
.venv\Scripts\python -m ruff check app tests
```

DB tests use the separate `studymate_test` database (created by `docker/init-test-db.sql`).

## Model benchmark

```powershell
.venv\Scripts\python scripts\benchmark_models.py llama3.1:8b llama3.2:3b
```

Measures speed, JSON validity and grading agreement on StudyMate-shaped tasks; pick
`LLM_FAST_MODEL` / `LLM_QUALITY_MODEL` in `.env` from the results.
