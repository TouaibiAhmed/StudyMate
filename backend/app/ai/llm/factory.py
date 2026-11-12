"""Builds the process-wide LLM client from settings."""

from functools import lru_cache

from app.ai.llm.client import LLMClient
from app.ai.llm.ollama import OllamaProvider
from app.ai.llm.tracing import DbTracer
from app.ai.llm.types import ModelTier
from app.core.config import get_settings


@lru_cache
def get_llm() -> LLMClient:
    s = get_settings()
    provider = OllamaProvider(
        s.ollama_base_url, timeout_s=s.llm_timeout_s, keep_alive=s.llm_keep_alive, default_num_ctx=s.llm_num_ctx
    )
    return LLMClient(
        provider,
        models={ModelTier.FAST: s.llm_fast_model, ModelTier.QUALITY: s.llm_quality_model},
        max_concurrency=s.llm_max_concurrency,
        structured_retries=s.llm_structured_retries,
        tracer=DbTracer(),
    )
