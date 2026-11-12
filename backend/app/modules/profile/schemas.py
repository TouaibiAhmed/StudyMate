import re
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.modules.profile.domains import DOMAIN_TYPES

SessionLength = Literal["15 minutes", "30 minutes", "45 minutes", "60 minutes"]


def _valid_time_zone(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Unknown time zone") from exc
    return value


def _valid_domain_type(value: str | None) -> str | None:
    if value is not None and value not in DOMAIN_TYPES:
        return None  # unknown values are ignored and recomputed by the server
    return value


class ProfileFields(CamelModel):
    """Editable profile fields, shared by signup and PATCH /api/profile."""

    field_of_study: str | None = Field(default=None, max_length=160)
    domain: str | None = Field(default=None, max_length=120)
    specialization: str | None = Field(default=None, max_length=120)
    domain_type: str | None = None
    level: str | None = Field(default=None, max_length=80)
    preferred_language: str | None = Field(default=None, max_length=40)
    time_zone: str | None = Field(default=None, max_length=64)
    target_role: str | None = Field(default=None, max_length=120)
    show_streaks: bool | None = None

    _tz = field_validator("time_zone")(_valid_time_zone)
    _dt = field_validator("domain_type")(_valid_domain_type)


class UserOut(CamelModel):
    id: str
    email: str
    display_name: str


class ProfileOut(CamelModel):
    user_id: str
    field_of_study: str
    domain: str | None
    specialization: str | None
    domain_type: str
    level: str
    preferred_language: str
    time_zone: str
    target_role: str | None
    show_streaks: bool
    created_at: datetime
    updated_at: datetime
    # Included so GET /api/profile can restore the signed-in user after a page refresh.
    user: UserOut | None = None
    email: str | None = None
    display_name: str | None = None


class PreferencesIn(CamelModel):
    hide_streaks: bool
    session_length: SessionLength
    weekly_goal: int = Field(ge=1, le=7)
    reminder_time: str

    @field_validator("reminder_time")
    @classmethod
    def _hhmm(cls, v: str) -> str:
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("Use HH:MM (24-hour)")
        return v


class PreferencesOut(PreferencesIn):
    pass
