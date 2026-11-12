from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, RateLimitedError, UnauthorizedError
from app.db.base import utcnow
from app.modules.auth.models import AuthSession, User
from app.modules.auth.schemas import AuthOut, LoginIn, RegisterIn
from app.modules.auth.security import hash_password, hash_token, login_limiter, new_session_token, verify_password
from app.modules.profile.models import StudentProfile
from app.modules.profile.schemas import UserOut
from app.modules.profile.service import apply_profile_fields, to_profile_out

# Refresh the stored expiry at most this often (sliding sessions without a write per request).
_SLIDE_EVERY = timedelta(hours=1)


async def _start_session(db: AsyncSession, user: User, user_agent: str | None) -> str:
    token = new_session_token()
    now = utcnow()
    db.add(AuthSession(
        token_hash=hash_token(token),
        user_id=user.id,
        expires_at=now + timedelta(hours=get_settings().session_ttl_hours),
        last_seen_at=now,
        user_agent=(user_agent or "")[:255] or None,
    ))
    return token


async def register(db: AsyncSession, data: RegisterIn, user_agent: str | None) -> tuple[AuthOut, str]:
    if (await db.execute(select(User.id).where(User.email == data.email))).first():
        raise ConflictError("An account with this email already exists.")
    user = User(email=data.email, password_hash=hash_password(data.password), display_name=data.name)
    db.add(user)
    await db.flush()
    profile = StudentProfile(user_id=user.id)
    apply_profile_fields(profile, data, partial=False)
    db.add(profile)
    token = await _start_session(db, user, user_agent)
    try:
        await db.commit()
    except IntegrityError as exc:  # concurrent signup with the same email
        await db.rollback()
        raise ConflictError("An account with this email already exists.") from exc
    await db.refresh(profile)
    return AuthOut(user=UserOut.model_validate(user), profile=to_profile_out(profile, user)), token


async def login(db: AsyncSession, data: LoginIn, user_agent: str | None, client_ip: str) -> tuple[AuthOut, str]:
    key = f"{data.email}|{client_ip}"
    if not login_limiter.hit(key):
        raise RateLimitedError("Too many sign-in attempts. Wait a few minutes and try again.")
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not verify_password(user.password_hash if user else None, data.password) or user is None:
        raise UnauthorizedError("Email or password is incorrect.")
    login_limiter.reset(key)
    token = await _start_session(db, user, user_agent)
    # Housekeeping: drop this user's expired sessions.
    await db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < utcnow()))
    await db.commit()
    profile = await db.get(StudentProfile, user.id)
    if profile is None:  # defensive: every signup creates one, but never block a login on it
        profile = StudentProfile(user_id=user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return AuthOut(user=UserOut.model_validate(user), profile=to_profile_out(profile, user)), token


async def logout(db: AsyncSession, token: str | None) -> None:
    if token:
        await db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        await db.commit()


async def user_for_token(db: AsyncSession, token: str | None) -> User:
    if not token:
        raise UnauthorizedError()
    session = await db.get(AuthSession, hash_token(token))
    now = utcnow()
    if session is None or session.expires_at <= now:
        raise UnauthorizedError("Your session has expired. Please sign in again.")
    if now - session.last_seen_at > _SLIDE_EVERY:
        session.last_seen_at = now
        session.expires_at = now + timedelta(hours=get_settings().session_ttl_hours)
        await db.commit()
    user = await db.get(User, session.user_id)
    if user is None:
        raise UnauthorizedError()
    return user
