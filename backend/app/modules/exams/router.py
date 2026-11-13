from fastapi import APIRouter, Response, status

from app.modules.auth.deps import DB, CurrentUser
from app.modules.exams import service
from app.modules.exams.schemas import (
    AnalysisOut,
    AnswerIn,
    AttemptOut,
    AttemptSummaryOut,
    CourseOptionOut,
    ExamCreate,
    ExamOut,
)

router = APIRouter(prefix="/api", tags=["exams"])


@router.get("/exams/options")
async def options(user: CurrentUser, db: DB) -> list[CourseOptionOut]:
    """Courses with concepts that a practice exam can be built from."""
    return await service.course_options(db, user.id)


@router.post("/exams", status_code=status.HTTP_202_ACCEPTED)
async def create_exam(data: ExamCreate, user: CurrentUser, db: DB) -> ExamOut:
    """Queues question generation; poll GET /api/exams/{id} until 'ready', then start the attempt."""
    return await service.create_exam(db, user.id, data)


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, user: CurrentUser, db: DB) -> ExamOut:
    return await service.get_exam(db, user.id, exam_id)


@router.post("/exams/{exam_id}/start")
async def start_attempt(exam_id: str, user: CurrentUser, db: DB) -> AttemptOut:
    """Starts the timer (or resumes the running attempt). The returned deadline is authoritative."""
    return await service.start_attempt(db, user.id, exam_id)


@router.get("/exam-attempts")
async def list_attempts(user: CurrentUser, db: DB) -> list[AttemptSummaryOut]:
    return await service.list_attempts(db, user.id)


@router.get("/exam-attempts/{attempt_id}")
async def get_attempt(attempt_id: str, user: CurrentUser, db: DB) -> AttemptOut:
    return await service.get_attempt(db, user.id, attempt_id)


@router.put("/exam-attempts/{attempt_id}/answers/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save_answer(attempt_id: str, question_id: str, data: AnswerIn, user: CurrentUser, db: DB) -> Response:
    await service.save_answer(db, user.id, attempt_id, question_id, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/exam-attempts/{attempt_id}/submit")
async def submit(attempt_id: str, user: CurrentUser, db: DB) -> AttemptOut:
    return await service.submit(db, user.id, attempt_id)


@router.get("/exam-attempts/{attempt_id}/analysis")
async def analysis(attempt_id: str, user: CurrentUser, db: DB) -> AnalysisOut:
    """status 'grading' until the worker has graded every answer; then the full analysis."""
    return await service.analysis(db, user.id, attempt_id)
