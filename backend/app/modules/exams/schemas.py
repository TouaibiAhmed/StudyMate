from datetime import datetime

from pydantic import Field

from app.core.schemas import CamelModel


class ExamCreate(CamelModel):
    course_id: str
    topic_ids: list[str] = Field(min_length=1, max_length=12)
    question_count: int = Field(ge=2, le=30)
    time_limit_seconds: int = Field(ge=60, le=180 * 60)


class TopicOut(CamelModel):
    id: str
    title: str


class CourseOptionOut(CamelModel):
    id: str
    title: str
    concepts: list[TopicOut]


class ExamQuestionOut(CamelModel):
    """No answer or rubric here: those stay on the server until the analysis."""

    id: str
    exam_id: str
    concept_id: str | None
    concept: str | None = None  # concept name, for display
    prompt: str
    type: str  # multiple_choice | short_answer
    options: list[str] | None


class ExamOut(CamelModel):
    id: str
    course_id: str
    title: str
    question_count: int
    time_limit_seconds: int
    topic_ids: list[str]
    questions: list[ExamQuestionOut]
    status: str
    progress: float
    stage: str | None
    error: str | None
    created_at: datetime


class AttemptOut(CamelModel):
    id: str
    exam_id: str
    user_id: str
    status: str
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime | None
    auto_submitted: bool
    grading_status: str


class AttemptSummaryExam(CamelModel):
    title: str
    course: str
    course_id: str
    question_count: int


class AttemptSummaryOut(AttemptOut):
    exam: AttemptSummaryExam
    time_used_seconds: int | None
    score: float | None
    score_label: str | None


class AnswerIn(CamelModel):
    answer: str = Field(default="", max_length=5000)
    flagged: bool = False


class Counts(CamelModel):
    correct: int = 0
    partially_correct: int = 0
    incorrect: int = 0
    insufficient_evidence: int = 0


class QuestionResultOut(CamelModel):
    question_id: str
    prompt: str
    type: str
    concept: str | None
    options: list[str] | None
    answer: str
    verdict: str
    expected_ideas: list[str]
    strengths: list[str]
    gaps: list[str]
    confidence: str


class ConceptResultOut(CamelModel):
    concept: str
    correct: int
    total: int
    summary: str
    next_action: str


class AnalysisOut(CamelModel):
    status: str  # grading | graded | failed
    progress: float
    attempt_id: str
    exam_id: str
    title: str
    course: str
    course_id: str
    completed_questions: int
    total_questions: int
    time_used_seconds: int
    auto_submitted: bool
    score: float | None
    score_label: str | None
    counts: Counts
    question_results: list[QuestionResultOut]
    concepts: list[ConceptResultOut]
