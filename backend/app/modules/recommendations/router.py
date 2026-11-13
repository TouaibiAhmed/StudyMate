from fastapi import APIRouter, Query, Response, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.recommendations import service
from app.modules.recommendations.schemas import FeedbackIn, Kind, RecommendationOut

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("")
async def recommendations(user: CurrentUser, db: DB, type: Kind = "course",  # noqa: A002 - API name
                          limit: int = Query(default=4, ge=1, le=10)) -> list[RecommendationOut]:
    """Catalog courses or curated roadmaps for this student, each with the reason it was suggested."""
    return await service.recommend(db, user.id, type, limit)


@router.post("/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback(data: FeedbackIn, user: CurrentUser, db: DB) -> Response:
    """'dismiss': never suggest this item to the student again."""
    await service.feedback(db, user.id, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def reset_feedback(user: CurrentUser, db: DB) -> Response:
    """Show dismissed suggestions again."""
    await service.clear_feedback(db, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
