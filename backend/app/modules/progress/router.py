from typing import Literal

from fastapi import APIRouter, Query

from app.modules.auth.deps import DB, CurrentUser
from app.modules.progress import service
from app.modules.progress.schemas import CourseProgressOut, ProgressOut

router = APIRouter(prefix="/api", tags=["progress"])


@router.get("/progress")
async def progress(user: CurrentUser, db: DB, range: Literal["7d", "30d", "all"] = "7d",  # noqa: A002
                   course_id: str | None = Query(default=None, alias="courseId")) -> ProgressOut:
    return await service.progress_overview(db, user.id, range, course_id)


@router.get("/courses/{course_id}/progress")
async def course_progress(course_id: str, user: CurrentUser, db: DB) -> CourseProgressOut:
    return await service.course_progress(db, user.id, course_id)
