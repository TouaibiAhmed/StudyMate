"""Ingestion job (doc 10.2): extract -> chunk -> embed -> index, with progress for the UI."""

import asyncio
import logging
from dataclasses import asdict

from sqlalchemy import delete, update

from app.ai.embeddings import get_embedder
from app.core.config import get_settings
from app.db.base import utcnow
from app.jobs.queue import enqueue
from app.jobs.registry import JobContext, job_handler
from app.modules.courses.models import Course
from app.modules.documents.models import Chunk, Document
from app.modules.documents.service import INGEST_JOB
from app.rag.chunking import ParagraphChunker
from app.rag.pdf import PdfError, PyMuPdfExtractor

log = logging.getLogger(__name__)

EXTRACT_CONCEPTS_JOB = "courses.extract_concepts"
CONCEPT_JOB_ATTEMPTS = 5


async def enqueue_concept_extraction(db, course_id: str, document_id: str, user_id: str) -> None:
    await enqueue(db, EXTRACT_CONCEPTS_JOB, {"course_id": course_id, "document_id": document_id},
                  user_id=user_id, subject=f"course:{course_id}", priority=10, max_attempts=CONCEPT_JOB_ATTEMPTS)
_EMBED_BATCH = 32
_MAX_OUTLINE_ENTRIES = 200


async def _update(ctx: JobContext, document_id: str, **values) -> None:
    async with ctx.sessions() as db:
        await db.execute(update(Document).where(Document.id == document_id).values(updated_at=utcnow(), **values))
        await db.commit()


@job_handler(INGEST_JOB)
async def ingest_document(ctx: JobContext) -> dict:
    document_id = ctx.payload["document_id"]
    async with ctx.sessions() as db:
        doc = await db.get(Document, document_id)
        if doc is None:
            return {"skipped": "document deleted"}
        path, course_id, user_id = doc.storage_path, doc.course_id, doc.user_id

    await _update(ctx, document_id, status="processing", progress=0.05, stage="Extracting text", error=None)
    try:
        extraction = await asyncio.to_thread(PyMuPdfExtractor().extract, path)
    except PdfError as exc:
        await _update(ctx, document_id, status="failed", progress=0.0, stage=None, error=str(exc))
        return {"failed": str(exc)}

    try:
        s = get_settings()
        chunks = ParagraphChunker(s.chunk_target_tokens, s.chunk_overlap_tokens).split(extraction.pages)
        if not chunks:
            raise PdfError("No usable text was found in this PDF.")
        await _update(ctx, document_id, progress=0.25, stage=f"Indexing {len(chunks)} passages",
                      page_count=extraction.page_count)

        embedder = get_embedder()
        vectors: list[list[float]] = []
        for start in range(0, len(chunks), _EMBED_BATCH):
            batch = chunks[start:start + _EMBED_BATCH]
            texts = [f"{c.section_title}\n{c.text}" if c.section_title else c.text for c in batch]
            vectors.extend(await embedder.embed_documents(texts))
            await _update(ctx, document_id, progress=0.25 + 0.7 * len(vectors) / len(chunks))

        async with ctx.sessions() as db:
            # Idempotent: a retried job replaces whatever a previous attempt wrote.
            await db.execute(delete(Chunk).where(Chunk.document_id == document_id))
            db.add_all(
                Chunk(document_id=document_id, course_id=course_id, user_id=user_id, chunk_index=c.index,
                      page_start=c.page_start, page_end=c.page_end, section_title=(c.section_title or None),
                      text=c.text, token_count=c.token_estimate, embedding=v)
                for c, v in zip(chunks, vectors, strict=True)
            )
            if await db.get(Document, document_id) is None:  # deleted while we were working
                await db.rollback()
                return {"skipped": "document deleted"}
            await db.execute(update(Document).where(Document.id == document_id).values(
                status="ready", progress=1.0, stage=None, page_count=extraction.page_count, chunk_count=len(chunks),
                warnings=extraction.warnings,
                outline=[asdict(o) for o in extraction.outline[:_MAX_OUTLINE_ENTRIES]],
                updated_at=utcnow(),
            ))
            await db.execute(update(Course).where(Course.id == course_id).values(concepts_status="processing"))
            await enqueue_concept_extraction(db, course_id, document_id, user_id)
            await db.commit()
    except PdfError as exc:
        await _update(ctx, document_id, status="failed", progress=0.0, stage=None, error=str(exc))
        return {"failed": str(exc)}
    except Exception:
        await _update(ctx, document_id, status="failed", progress=0.0, stage=None,
                      error="Processing failed unexpectedly. Try again.")
        raise
    return {"pages": extraction.page_count, "chunks": len(chunks), "warnings": len(extraction.warnings)}
