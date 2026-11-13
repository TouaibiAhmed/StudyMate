from fastapi import APIRouter, Response, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.roadmaps import service
from app.modules.roadmaps.schemas import (
    GenerateIn,
    NodeOut,
    NodeSessionOut,
    NodeStatusIn,
    RoadmapOut,
    RoadmapSummaryOut,
)

router = APIRouter(prefix="/api/roadmaps", tags=["roadmaps"])


@router.get("")
async def list_roadmaps(user: CurrentUser, db: DB) -> list[RoadmapSummaryOut]:
    """Curated roadmaps plus the student's own generated (private) ones, with their progress."""
    return await service.list_roadmaps(db, user.id)


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate(data: GenerateIn, user: CurrentUser, db: DB) -> RoadmapOut:
    """Queues generation; poll GET /api/roadmaps/{id} until status is 'ready' (or 'failed')."""
    return await service.request_generation(db, user, data)


@router.get("/{roadmap_id}")
async def get_roadmap(roadmap_id: str, user: CurrentUser, db: DB) -> RoadmapOut:
    return await service.get_roadmap(db, user.id, roadmap_id)


@router.post("/{roadmap_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry(roadmap_id: str, user: CurrentUser, db: DB) -> RoadmapOut:
    return await service.retry_generation(db, user.id, roadmap_id)


@router.delete("/{roadmap_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(roadmap_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_roadmap(db, user.id, roadmap_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{roadmap_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow(roadmap_id: str, user: CurrentUser, db: DB) -> Response:
    await service.follow(db, user.id, roadmap_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{roadmap_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow(roadmap_id: str, user: CurrentUser, db: DB) -> Response:
    await service.unfollow(db, user.id, roadmap_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{roadmap_id}/nodes/{node_id}")
async def set_node_status(roadmap_id: str, node_id: str, data: NodeStatusIn, user: CurrentUser, db: DB) -> NodeOut:
    """Manual status ('known', 'completed', ...). status=null goes back to the evidence-based status."""
    return await service.set_node_status(db, user.id, roadmap_id, node_id, data)


@router.post("/{roadmap_id}/nodes/{node_id}/sessions", status_code=status.HTTP_201_CREATED)
async def start_node_session(roadmap_id: str, node_id: str, user: CurrentUser, db: DB) -> NodeSessionOut:
    return await service.start_node_session(db, user, roadmap_id, node_id)
