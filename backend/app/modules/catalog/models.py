"""Platform catalog courses (step 9). Shared content: no owner, read by every student."""

from typing import Any

from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class CatalogCourse(IdMixin, TimestampMixin, Base):
    __tablename__ = "catalog_courses"

    slug: Mapped[str] = mapped_column(String(80), unique=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(40))
    domains: Mapped[list[str]] = mapped_column(JSONB, default=list)
    hours: Mapped[int] = mapped_column(Integer, default=10)
    description: Mapped[str] = mapped_column(Text, default="")
    concepts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)  # [{name, description}]
