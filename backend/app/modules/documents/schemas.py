from datetime import datetime

from app.core.schemas import CamelModel


class DocumentOut(CamelModel):
    id: str
    course_id: str
    file_name: str
    mime_type: str
    size_bytes: int
    origin: str
    status: str
    progress: float
    stage: str | None
    page_count: int | None
    chunk_count: int | None
    warnings: list[str]
    error: str | None
    created_at: datetime
    updated_at: datetime


class DocumentStatusOut(CamelModel):
    document_id: str
    course_id: str
    status: str
    progress: float
    stage: str | None
    page_count: int | None
    warnings: list[str]
    error: str | None
    updated_at: datetime
