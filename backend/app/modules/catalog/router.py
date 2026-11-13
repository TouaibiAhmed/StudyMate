from fastapi import APIRouter, Response, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.catalog import service
from app.modules.catalog.schemas import CatalogCourseOut
from app.modules.courses.schemas import CourseOut

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/courses")
async def list_courses(user: CurrentUser, db: DB, query: str = "", domain: str = "") -> list[CatalogCourseOut]:
    return await service.list_catalog(db, user.id, query, domain)


@router.get("/courses/{catalog_id}")
async def get_course(catalog_id: str, user: CurrentUser, db: DB) -> CatalogCourseOut:
    return await service.get_catalog_course(db, user.id, catalog_id)


@router.post("/courses/{catalog_id}/enroll", status_code=status.HTTP_201_CREATED)
async def enroll(catalog_id: str, user: CurrentUser, db: DB, response: Response) -> CourseOut:
    """Adds the course to the student's library with its concepts listed (200 if already enrolled)."""
    course, created = await service.enroll(db, user.id, catalog_id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return course
