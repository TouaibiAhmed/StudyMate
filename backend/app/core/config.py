"""Application settings, read from environment variables (and `.env` in development)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- App -----------------------------------------------------------------
    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "StudyMate API"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    log_level: str = "INFO"

    # --- Database --------------------------------------------------------------
    database_url: str = "postgresql+asyncpg://studymate:studymate@localhost:5433/studymate"
    db_echo: bool = False

    # --- Auth ------------------------------------------------------------------
    secret_key: str = "change-me-in-.env"
    session_cookie_name: str = "studymate_session"
    session_ttl_hours: int = 24 * 14

    # --- Storage ---------------------------------------------------------------
    upload_dir: Path = BACKEND_DIR / "storage" / "uploads"
    max_upload_mb: int = 25

    # --- LLM (Ollama) ----------------------------------------------------------
    ollama_base_url: str = "http://localhost:11434"
    # Two tiers: "fast" serves interactive calls (chat, tutor, hints);
    # "quality" serves grading and background generation (exams, quizzes, roadmaps).
    llm_fast_model: str = "llama3.1:8b"
    llm_quality_model: str = "llama3.1:8b"
    llm_num_ctx: int = 4096
    llm_keep_alive: str = "10m"  # how long Ollama keeps the model in RAM after a call
    llm_timeout_s: float = 300.0
    llm_max_concurrency: int = 1
    llm_structured_retries: int = 1

    # --- Embeddings ------------------------------------------------------------
    embedding_provider: Literal["sentence_transformers", "ollama"] = "sentence_transformers"
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_dim: int = 384

    # --- RAG -------------------------------------------------------------------
    chunk_target_tokens: int = 350
    chunk_overlap_tokens: int = 60
    retrieval_top_k: int = 3
    retrieval_candidate_k: int = 12
    # multilingual-e5-small: on-topic questions score ~0.84-0.90, off-topic ones up to ~0.82.
    retrieval_min_score: float = 0.83

    # --- Limits ----------------------------------------------------------------
    session_max_model_calls: int = 20
    exam_max_questions: int = 30
    exam_max_minutes: int = 180
    roadmap_max_nodes: int = 30
    # A roadmap topic counts a concept of the student's courses when the concept's words appear in the
    # topic text and the embeddings are at least loosely similar, or when they are very similar.
    roadmap_concept_lexical_min_score: float = 0.80
    roadmap_concept_min_score: float = 0.90

    # --- Worker ----------------------------------------------------------------
    worker_poll_interval_s: float = 1.0
    job_max_attempts: int = 3

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
