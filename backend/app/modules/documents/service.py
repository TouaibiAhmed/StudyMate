"""Upload, status, retry and delete of course documents. Processing happens in the worker
(`documents/jobs.py`)."""

import asyncio
import hashlib
import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError, PayloadTooLargeError
from app.db.base import new_id
from app.jobs.queue import enqueue
from app.modules.courses.service import get_owned_course
from app.modules.documents.models import Document
from app.modules.documents.schemas import DocumentOut, DocumentStatusOut

log = logging.getLogger(__name__)

INGEST_JOB = "documents.ingest"
UPLOAD_ROOT = Path(get_settings().upload_dir).resolve()
_READ_CHUNK = 1024 * 1024


class InvalidUploadError(AppError):
    status_code, code = 400, "bad_request"


def document_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id, course_id=doc.course_id, file_name=doc.filename, mime_type=doc.mime_type,
        size_bytes=doc.size_bytes, origin=doc.origin, status=doc.status, progress=doc.progress,
        stage=doc.stage, page_count=doc.page_count, chunk_count=doc.chunk_count,
        warnings=doc.warnings or [], error=doc.error, created_at=doc.created_at, updated_at=doc.updated_at,
    )


def status_out(doc: Document) -> DocumentStatusOut:
    return DocumentStatusOut(
        document_id=doc.id, course_id=doc.course_id, status=doc.status, progress=doc.progress, stage=doc.stage,
        page_count=doc.page_count, warnings=doc.warnings or [], error=doc.error, updated_at=doc.updated_at,
    )


async def get_owned_document(db: AsyncSession, user_id: str, document_id: str) -> Document:
    doc = (await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == user_id)
    )).scalar_one_or_none()
    if doc is None:
        raise NotFoundError("Document not found.")
    return doc


async def list_documents(db: AsyncSession, user_id: str, course_id: str) -> list[DocumentOut]:
    await get_owned_course(db, user_id, course_id)
    docs = (await db.execute(
        select(Document).where(Document.course_id == course_id).order_by(Document.created_at.desc())
    )).scalars().all()
    return [document_out(d) for d in docs]


async def _save_upload(upload: UploadFile, dest: Path, max_bytes: int) -> tuple[int, str]:
    """Stream to disk with a size cap; verify the PDF signature. Returns (size, sha256)."""
    await asyncio.to_thread(dest.parent.mkdir, parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0
    out = await asyncio.to_thread(dest.open, "wb")
    try:
        first = True
        while chunk := await upload.read(_READ_CHUNK):
            if first:
                if chunk.lstrip()[:5] != b"%PDF-":
                    raise InvalidUploadError("This file is not a valid PDF.")
                first = False
            size += len(chunk)
            if size > max_bytes:
                raise PayloadTooLargeError(f"The file is larger than {max_bytes // (1024 * 1024)} MB.")
            digest.update(chunk)
            await asyncio.to_thread(out.write, chunk)
        if size == 0:
            raise InvalidUploadError("The file is empty.")
    except Exception:
        out.close()
        await _remove(dest)
        raise
    out.close()
    return size, digest.hexdigest()


async def _remove(path: Path) -> None:
    try:
        await asyncio.to_thread(path.unlink, missing_ok=True)
    except OSError:
        log.warning("Could not delete an uploaded file")


async def upload_document(db: AsyncSession, user_id: str, course_id: str, upload: UploadFile) -> DocumentOut:
    course = await get_owned_course(db, user_id, course_id)
    settings = get_settings()
    filename = Path(upload.filename or "document.pdf").name[:255]
    if not filename.lower().endswith(".pdf") and upload.content_type != "application/pdf":
        raise InvalidUploadError("Only PDF files are supported for now.")

    doc_id = new_id()
    dest = UPLOAD_ROOT / user_id / course.id / f"{doc_id}.pdf"
    size, sha = await _save_upload(upload, dest, settings.max_upload_mb * 1024 * 1024)

    duplicate = (await db.execute(
        select(Document.id).where(Document.course_id == course.id, Document.sha256 == sha)
    )).first()
    if duplicate:
        await _remove(dest)
        raise ConflictError(f'"{filename}" is already in this course.')

    doc = Document(id=doc_id, course_id=course.id, user_id=user_id, filename=filename, size_bytes=size, sha256=sha,
                   storage_path=str(dest), status="queued", progress=0.0, stage="Waiting to be processed",
                   warnings=[], outline=[])
    db.add(doc)
    await enqueue(db, INGEST_JOB, {"document_id": doc_id}, user_id=user_id, subject=f"document:{doc_id}", priority=5)
    await db.commit()
    await db.refresh(doc)
    return document_out(doc)


async def get_status(db: AsyncSession, user_id: str, document_id: str) -> DocumentStatusOut:
    return status_out(await get_owned_document(db, user_id, document_id))


async def retry_document(db: AsyncSession, user_id: str, document_id: str) -> DocumentOut:
    doc = await get_owned_document(db, user_id, document_id)
    if doc.status != "failed":
        raise ConflictError("Only a failed document can be retried.")
    doc.status, doc.progress, doc.stage, doc.error = "queued", 0.0, "Waiting to be processed", None
    await enqueue(db, INGEST_JOB, {"document_id": doc.id}, user_id=user_id, subject=f"document:{doc.id}", priority=5)
    await db.commit()
    await db.refresh(doc)
    return document_out(doc)


async def delete_document(db: AsyncSession, user_id: str, document_id: str) -> None:
    doc = await get_owned_document(db, user_id, document_id)
    path = doc.storage_path
    await db.delete(doc)  # chunks cascade
    await db.commit()
    await _remove(Path(path))
