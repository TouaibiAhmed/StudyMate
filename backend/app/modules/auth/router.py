from fastapi import APIRouter, Request, Response, status

from app.core.config import get_settings
from app.modules.auth import service
from app.modules.auth.deps import DB
from app.modules.auth.schemas import AuthOut, LoginIn, RegisterIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=s.session_ttl_hours * 3600,
        httponly=True,  # not readable from JavaScript
        secure=s.is_production,  # HTTPS only in production
        samesite="lax",  # not sent on cross-site POSTs (CSRF protection)
        path="/",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, request: Request, response: Response, db: DB) -> AuthOut:
    out, token = await service.register(db, data, request.headers.get("user-agent"))
    _set_cookie(response, token)
    return out


@router.post("/login")
async def login(data: LoginIn, request: Request, response: Response, db: DB) -> AuthOut:
    ip = request.client.host if request.client else "unknown"
    out, token = await service.login(db, data, request.headers.get("user-agent"), ip)
    _set_cookie(response, token)
    return out


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: DB) -> Response:
    s = get_settings()
    await service.logout(db, request.cookies.get(s.session_cookie_name))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(s.session_cookie_name, path="/")
    return response
