from pydantic import EmailStr, Field, field_validator

from app.core.schemas import CamelModel
from app.modules.profile.schemas import ProfileFields, ProfileOut, UserOut


def _normalize_email(v: str) -> str:
    return v.strip().lower()


class RegisterIn(ProfileFields):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)

    _email = field_validator("email", mode="before")(_normalize_email)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name is required")
        return v.strip()


class LoginIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    _email = field_validator("email", mode="before")(_normalize_email)


class AuthOut(CamelModel):
    user: UserOut
    profile: ProfileOut
