from fastapi import APIRouter

from app.modules.auth.deps import DB, CurrentUser
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardOut

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(user: CurrentUser, db: DB) -> DashboardOut:
    """Home page: next step, continue learning, courses, concepts to practise, this week, streak."""
    return await service.dashboard(db, user)
