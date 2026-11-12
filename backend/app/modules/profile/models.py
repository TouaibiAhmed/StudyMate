from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class StudentProfile(TimestampMixin, Base):
    """Field of study, level and study preferences (doc 12.1 + settings page)."""

    __tablename__ = "student_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    field_of_study: Mapped[str] = mapped_column(String(160), default="")
    domain: Mapped[str | None] = mapped_column(String(120))
    specialization: Mapped[str | None] = mapped_column(String(120))
    # quantitative | code-based | conceptual | argumentative | language
    domain_type: Mapped[str] = mapped_column(String(24), default="conceptual")
    level: Mapped[str] = mapped_column(String(80), default="")
    preferred_language: Mapped[str] = mapped_column(String(40), default="English")
    time_zone: Mapped[str] = mapped_column(String(64), default="UTC")
    target_role: Mapped[str | None] = mapped_column(String(120))

    # Study preferences
    show_streaks: Mapped[bool] = mapped_column(Boolean, default=True)
    session_length_minutes: Mapped[int] = mapped_column(Integer, default=30)
    weekly_goal: Mapped[int] = mapped_column(Integer, default=4)
    reminder_time: Mapped[str] = mapped_column(String(5), default="18:00")  # HH:MM, student's time zone
