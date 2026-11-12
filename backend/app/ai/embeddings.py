"""Embedding providers.

Default: sentence-transformers with `intfloat/multilingual-e5-small` (384 dims, CPU-friendly,
multilingual so a later language switch does not require re-indexing). E5 models expect
"query: " / "passage: " prefixes; the provider adds them so callers never have to.
"""

import asyncio
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings


class EmbeddingProvider(Protocol):
    model: str
    dim: int

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class SentenceTransformerEmbeddings:
    def __init__(self, model: str, dim: int, *, batch_size: int = 32):
        self.model = model
        self.dim = dim
        self.batch_size = batch_size
        self._st = None
        self._lock = asyncio.Lock()
        self._prefixed = "e5" in model.lower()

    async def _load(self):
        async with self._lock:
            if self._st is None:
                from huggingface_hub import try_to_load_from_cache
                from sentence_transformers import SentenceTransformer  # heavy import; load lazily

                # Use the local cache without contacting Hugging Face (works offline, no telemetry);
                # only the very first run on a machine downloads the model.
                cached = isinstance(try_to_load_from_cache(self.model, "config.json"), str)
                self._st = await asyncio.to_thread(
                    SentenceTransformer, self.model, device="cpu", local_files_only=cached
                )
        return self._st

    async def _encode(self, texts: list[str]) -> list[list[float]]:
        st = await self._load()
        vectors = await asyncio.to_thread(
            st.encode, texts, batch_size=self.batch_size, normalize_embeddings=True, show_progress_bar=False
        )
        return [v.tolist() for v in vectors]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if self._prefixed:
            texts = [f"passage: {t}" for t in texts]
        return await self._encode(texts)

    async def embed_query(self, text: str) -> list[float]:
        return (await self._encode([f"query: {text}" if self._prefixed else text]))[0]


class OllamaEmbeddings:
    """Alternative that avoids PyTorch entirely (e.g. `nomic-embed-text`, `bge-m3`)."""

    def __init__(self, base_url: str, model: str, dim: int):
        self.model = model
        self.dim = dim
        self._client = httpx.AsyncClient(base_url=base_url, timeout=120.0)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.post("/api/embed", json={"model": self.model, "input": texts})
        resp.raise_for_status()
        return resp.json()["embeddings"]

    async def embed_query(self, text: str) -> list[float]:
        return (await self.embed_documents([text]))[0]


@lru_cache
def get_embedder() -> EmbeddingProvider:
    s = get_settings()
    if s.embedding_provider == "ollama":
        return OllamaEmbeddings(s.ollama_base_url, s.embedding_model, s.embedding_dim)
    return SentenceTransformerEmbeddings(s.embedding_model, s.embedding_dim)
