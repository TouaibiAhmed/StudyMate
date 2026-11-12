"""`CurrentUser` dependency: every protected route declares it, and every repository query
filters by `user.id`."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.service import user_for_token

DB = Annotated[AsyncSession, Depends(get_db)]


async def _current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    user = await user_for_token(db, token)
    request.state.user_id = user.id
    return user


CurrentUser = Annotated[User, Depends(_current_user)]
