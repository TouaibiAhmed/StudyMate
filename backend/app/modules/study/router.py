from fastapi import APIRouter, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.study import service
from app.modules.study.schemas import AttemptIn, EvaluationOut, NextActivityOut, SessionCreate, SessionOut

router = APIRouter(prefix="/api", tags=["study"])


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def start_session(data: SessionCreate, user: CurrentUser, db: DB) -> SessionOut:
    """Creates the session and queues its first activity (status 'preparing' until it is written)."""
    return await service.start_session(db, user, data)


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: CurrentUser, db: DB) -> SessionOut:
    return await service.get_session(db, user.id, session_id)


@router.post("/sessions/{session_id}/next")
async def next_activity(session_id: str, user: CurrentUser, db: DB) -> NextActivityOut:
    return await service.next_activity(db, user.id, session_id)


@router.post("/sessions/{session_id}/complete")
async def complete_session(session_id: str, user: CurrentUser, db: DB) -> SessionOut:
    return await service.complete_session(db, user.id, session_id)


@router.post("/activities/{activity_id}/attempts")
async def submit_attempt(activity_id: str, data: AttemptIn, user: CurrentUser, db: DB) -> EvaluationOut:
    """Evaluates the answer (synchronously: can take a minute on a CPU-only local model)."""
    return await service.submit_attempt(db, user, activity_id, data)
