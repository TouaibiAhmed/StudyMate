"""Base Pydantic models for the API.

All API schemas serialize to camelCase (what the frontend uses) while Python code and the
database stay snake_case. Requests accept both spellings.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        serialize_by_alias=True,
    )


class Page(CamelModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    has_next: bool


class SourceReference(CamelModel):
    """A citation that always maps to real stored metadata (never produced by the model)."""

    document_id: str | None = None
    title: str
    page: int | None = None
    page_end: int | None = None
    excerpt: str | None = None
    locator: str | None = None
