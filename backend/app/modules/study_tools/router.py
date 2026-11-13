from fastapi import APIRouter, Response, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.study_tools import service
from app.modules.study_tools.schemas import (
    ArtifactOut,
    AttemptOut,
    QuizCreate,
    QuizOut,
    QuizResultOut,
    SubmitIn,
    SummaryCreate,
    SummaryOut,
    TitlePatch,
)

router = APIRouter(prefix="/api", tags=["study tools"])


@router.get("/courses/{course_id}/study-tools")
async def list_artifacts(course_id: str, user: CurrentUser, db: DB) -> list[ArtifactOut]:
    return await service.list_artifacts(db, user.id, course_id)


@router.get("/courses/{course_id}/summaries")
async def list_summaries(course_id: str, user: CurrentUser, db: DB) -> list[SummaryOut]:
    return await service.list_summaries(db, user.id, course_id)


@router.post("/courses/{course_id}/summaries", status_code=status.HTTP_202_ACCEPTED)
async def create_summary(course_id: str, data: SummaryCreate, user: CurrentUser, db: DB) -> SummaryOut:
    """Queues generation; poll GET /api/summaries/{id} until status is 'ready' or 'failed'."""
    return await service.create_summary(db, user, course_id, data)


@router.get("/summaries/{summary_id}")
async def get_summary(summary_id: str, user: CurrentUser, db: DB) -> SummaryOut:
    return await service.get_summary(db, user.id, summary_id)


@router.patch("/summaries/{summary_id}")
async def rename_summary(summary_id: str, data: TitlePatch, user: CurrentUser, db: DB) -> SummaryOut:
    return await service.rename_summary(db, user.id, summary_id, data.title)


@router.delete("/summaries/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_summary(summary_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_summary(db, user.id, summary_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/courses/{course_id}/quizzes")
async def list_quizzes(course_id: str, user: CurrentUser, db: DB) -> list[QuizOut]:
    return await service.list_quizzes(db, user.id, course_id)


@router.post("/courses/{course_id}/quizzes", status_code=status.HTTP_202_ACCEPTED)
async def create_quiz(course_id: str, data: QuizCreate, user: CurrentUser, db: DB) -> QuizOut:
    """Queues generation; poll GET /api/quizzes/{id} until status is 'ready' or 'failed'."""
    return await service.create_quiz(db, user, course_id, data)


@router.get("/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str, user: CurrentUser, db: DB) -> QuizOut:
    return await service.get_quiz(db, user.id, quiz_id)


@router.patch("/quizzes/{quiz_id}")
async def rename_quiz(quiz_id: str, data: TitlePatch, user: CurrentUser, db: DB) -> QuizOut:
    return await service.rename_quiz(db, user.id, quiz_id, data.title)


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(quiz_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_quiz(db, user.id, quiz_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/quizzes/{quiz_id}/attempts", status_code=status.HTTP_201_CREATED)
async def start_attempt(quiz_id: str, user: CurrentUser, db: DB) -> AttemptOut:
    return await service.start_attempt(db, user.id, quiz_id)


@router.post("/quiz-attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, data: SubmitIn, user: CurrentUser, db: DB) -> QuizResultOut:
    """Grades the attempt. Short answers are graded by the local model (can take a minute)."""
    return await service.submit_attempt(db, user, attempt_id, data)
