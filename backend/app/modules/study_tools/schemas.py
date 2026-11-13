from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel, SourceReference

SummaryLength = Literal["Short", "Medium", "Detailed"]
SummaryStructure = Literal["Key Concepts", "Definitions", "Important Points", "Chapter-by-Chapter"]
QuizDifficulty = Literal["Easy", "Medium", "Hard", "Mixed"]
QuestionType = Literal["Multiple Choice", "True/False", "Short Answer"]


class _GenerateBase(CamelModel):
    source_document_ids: list[str] = Field(default_factory=list, max_length=20)
    topic_ids: list[str] = Field(default_factory=list, max_length=12)
    language: str = Field(default="English", min_length=2, max_length=40)


class SummaryCreate(_GenerateBase):
    length: SummaryLength = "Medium"
    structure: SummaryStructure = "Key Concepts"


class QuizCreate(_GenerateBase):
    question_count: int = Field(default=5, ge=3, le=20)
    difficulty: QuizDifficulty = "Mixed"
    question_types: list[QuestionType] = Field(default_factory=lambda: ["Multiple Choice", "True/False"],
                                               min_length=1, max_length=3)

    @field_validator("question_types")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class TitlePatch(CamelModel):
    title: str = Field(min_length=1, max_length=160)


class SectionOut(CamelModel):
    heading: str
    points: list[str]


class _GeneratedOut(CamelModel):
    id: str
    course_id: str
    title: str
    status: str
    progress: float
    stage: str | None
    error: str | None
    language: str
    topic_ids: list[str]
    source_document_ids: list[str]
    sources: list[SourceReference]
    knowledge_mode: str
    created_at: datetime
    updated_at: datetime


class SummaryOut(_GeneratedOut):
    length: str
    structure: str
    sections: list[SectionOut]


class QuizQuestionOut(CamelModel):
    """No answer key here: answers are revealed only in the graded result."""

    id: str
    quiz_id: str
    prompt: str
    type: str
    options: list[str] | None
    topic_id: str | None


class QuizOut(_GeneratedOut):
    question_count: int
    difficulty: str
    question_types: list[str]
    questions: list[QuizQuestionOut]


class AttemptOut(CamelModel):
    id: str
    quiz_id: str
    status: str
    started_at: datetime
    submitted_at: datetime | None


class SubmittedAnswer(CamelModel):
    question_id: str
    answer: str = Field(default="", max_length=3000)


class SubmitIn(CamelModel):
    answers: list[SubmittedAnswer] = Field(default_factory=list, max_length=50)


class GradedAnswerOut(CamelModel):
    question_id: str
    answer: str
    correct_answer: str
    explanation: str | None
    feedback: str | None
    is_correct: bool


class QuizResultOut(CamelModel):
    attempt_id: str
    quiz_id: str
    score: float
    correct_count: int
    incorrect_count: int
    unanswered_count: int
    answers: list[GradedAnswerOut]
    created_at: datetime


class ArtifactOut(CamelModel):
    id: str
    course_id: str
    kind: str
    title: str
    status: str
    created_at: datetime
    source_document_ids: list[str]
    description: str
