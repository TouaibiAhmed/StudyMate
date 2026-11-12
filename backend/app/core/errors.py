"""Consistent error objects for every API response.

Shape (matches frontend `services/contracts/api/common.ts`):

    {"error": {"code": "not_found", "message": "...", "requestId": "...", "details": [...]}}
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 400
    code = "bad_request"
    message = "The request could not be completed."

    def __init__(self, message: str | None = None, *, details: list[dict[str, Any]] | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details


class NotFoundError(AppError):
    status_code, code, message = 404, "not_found", "The requested resource was not found."


class UnauthorizedError(AppError):
    status_code, code, message = 401, "unauthorized", "Authentication is required."


class ForbiddenError(AppError):
    status_code, code, message = 403, "forbidden", "You do not have permission to perform this action."


class ConflictError(AppError):
    status_code, code, message = 409, "conflict", "This action conflicts with the current resource state."


class PayloadTooLargeError(AppError):
    status_code, code, message = 413, "payload_too_large", "The uploaded payload is too large."


class RateLimitedError(AppError):
    status_code, code, message = 429, "rate_limited", "Too many requests. Try again shortly."


class ServiceUnavailableError(AppError):
    status_code, code, message = 503, "service_unavailable", "The service is temporarily unavailable."


_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "bad_request",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "rate_limited",
    503: "service_unavailable",
}


def _humanize(field: str) -> str:
    """timeZone / time_zone -> 'Time zone'."""
    import re

    words = re.sub(r"(?<!^)(?=[A-Z])", " ", field).replace("_", " ").lower()
    return words[:1].upper() + words[1:]


def _body(request: Request, code: str, message: str, details: list[dict[str, Any]] | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "requestId": getattr(request.state, "request_id", None),
            "details": details,
        }
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        return JSONResponse(_body(request, exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")),
                "message": err.get("msg", "Invalid value"),
                "code": err.get("type"),
            }
            for err in exc.errors()
        ]
        # A single invalid field gets a specific message the UI can show as-is.
        message = "Some request fields are invalid."
        if len(details) == 1:
            field = details[0]["field"].rsplit(".", 1)[-1]
            text = details[0]["message"]
            for prefix in ("Value error, ", "value is not a valid email address: "):
                text = text.removeprefix(prefix)
            message = f"{_humanize(field)}: {text}" if field else text
        return JSONResponse(_body(request, "validation_error", message, details), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code = _STATUS_CODES.get(exc.status_code, "server_error")
        message = exc.detail if isinstance(exc.detail, str) else "The request failed."
        return JSONResponse(_body(request, code, message), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        # Never leak internals (stack traces, model names, SQL) to the client.
        log.exception("Unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return JSONResponse(
            _body(request, "server_error", "The server could not complete the request."), status_code=500
        )
