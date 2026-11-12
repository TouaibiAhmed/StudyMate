"""RAG pipeline contracts. Implementations arrive in build step 2 (ingestion + retrieval).

Ingestion (worker job "ingest_document"):
    PdfExtractor  -> pages with text + low-text warnings          (PyMuPDF)
    Chunker       -> paragraph-aware chunks keeping page ranges    (~350 tokens, 60 overlap)
    EmbeddingProvider (app.ai.embeddings) -> vectors
    ChunkStore    -> rows in `chunks` with a pgvector column

Retrieval (request time):
    Retriever.retrieve(query, scope) -> EvidenceSet
        1. embed query                     (e5 "query:" prefix)
        2. vector search, candidate_k      (cosine, HNSW index, filtered by owner + course)
        3. keyword boost                   (Postgres full-text rank, hybrid score)
        4. dedupe neighbours, keep top_k   (small: the local model's prompt budget is tight)
        5. label E1..En -> EvidenceSet     (empty set => general-knowledge mode)
"""

from dataclasses import dataclass, field
from typing import Protocol

from app.rag.evidence import EvidenceSet


@dataclass(frozen=True)
class ExtractedPage:
    number: int  # 1-based
    paragraphs: list[str]  # reading order, whitespace-normalized
    headings: list[str] = field(default_factory=list)  # lines set in a larger font than body text
    low_text: bool = False

    @property
    def text(self) -> str:
        return "\n\n".join(self.paragraphs)


@dataclass(frozen=True)
class OutlineEntry:
    title: str
    page: int
    level: int = 1


@dataclass
class PdfExtraction:
    pages: list[ExtractedPage]
    outline: list[OutlineEntry]
    warnings: list[str] = field(default_factory=list)

    @property
    def page_count(self) -> int:
        return len(self.pages)


@dataclass(frozen=True)
class TextChunk:
    index: int
    text: str
    page_start: int
    page_end: int
    section_title: str | None = None
    token_estimate: int = 0


@dataclass(frozen=True)
class RetrievalScope:
    """Retrieval is always scoped to the owner; there is no unscoped search."""

    user_id: str
    course_id: str
    document_ids: list[str] | None = None
    concept_hint: str | None = None


@dataclass(frozen=True)
class RetrievalParams:
    top_k: int = 3
    candidate_k: int = 12
    # multilingual-e5 cosine similarities are compressed (unrelated text still scores ~0.7-0.8),
    # so the relevance floor is high. See Settings.retrieval_min_score and
    # tests/test_courses_documents.py for the calibration.
    min_score: float = 0.83
    keyword_weight: float = 0.3
    exclude_chunk_ids: list[str] = field(default_factory=list)


class PdfExtractor(Protocol):
    def extract(self, path: str) -> PdfExtraction: ...


class Chunker(Protocol):
    def split(self, pages: list[ExtractedPage]) -> list[TextChunk]: ...


class Retriever(Protocol):
    async def retrieve(
        self, query: str, scope: RetrievalScope, params: RetrievalParams | None = None
    ) -> EvidenceSet: ...
