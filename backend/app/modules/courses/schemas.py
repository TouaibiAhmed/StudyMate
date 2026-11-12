from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.core.schemas import CamelModel


def _strip(v: str) -> str:
    return v.strip()


class CourseCreate(CamelModel):
    title: str = Field(min_length=1, max_length=160)
    subject: str = Field(min_length=1, max_length=120)
    level: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=2000)
    domain: str | None = Field(default=None, max_length=120)

    _s = field_validator("title", "subject", "level", "description")(_strip)

    @field_validator("title", "subject", "level")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("Required")
        return v


class CourseOut(CamelModel):
    id: str
    title: str
    subject: str
    level: str
    description: str
    domain: str | None
    domain_type: str
    status: str
    concepts_status: str
    material_count: int = 0
    completed_materials: int = 0
    progress: int = 0  # filled from learning evidence in step 4
    last_studied: str | None = None
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SourceRef(CamelModel):
    document_id: str
    page_start: int
    page_end: int


class ConceptOut(CamelModel):
    id: str
    course_id: str
    name: str
    title: str
    description: str
    aliases: list[str]
    prerequisites: list[str]
    source_refs: list[SourceRef]
    origin: str
    # Learning state arrives with the study loop (step 4).
    status: str = "not_enough_evidence"
    progress: int = 0


class SearchIn(CamelModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=3, ge=1, le=8)
    document_ids: list[str] | None = None


class SearchHit(CamelModel):
    label: str
    chunk_id: str
    document_id: str
    title: str
    page_start: int
    page_end: int
    score: float
    text: str


class SearchOut(CamelModel):
    knowledge_mode: str
    items: list[SearchHit]
