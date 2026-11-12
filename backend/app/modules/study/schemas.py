from datetime import datetime

from pydantic import Field, field_validator

from app.core.schemas import CamelModel, SourceReference


class SessionCreate(CamelModel):
    course_id: str | None = None
    concept_id: str | None = None
    topic: str | None = Field(default=None, max_length=160)
    goal: str | None = Field(default=None, max_length=300)


class ActivityOut(CamelModel):
    id: str
    session_id: str
    sequence: int
    type: str
    difficulty: str
    topic: str
    prompt: str
    context: str | None
    hints: list[str]
    explanation: str
    sources: list[SourceReference]
    knowledge_mode: str
    reason: str


class SessionOut(CamelModel):
    id: str
    user_id: str
    course_id: str | None
    course_title: str | None
    concept_id: str | None
    topic: str
    goal: str
    knowledge_mode: str
    status: str
    activity_number: int
    activity_total: int
    activities: list[ActivityOut]
    preparing: bool
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class AttemptIn(CamelModel):
    answer: str = Field(min_length=1, max_length=5000)
    attempt_number: int | None = Field(default=None, ge=1, le=20)
    hints_used: int = Field(default=0, ge=0, le=5)
    explanation_viewed: bool = False

    @field_validator("answer")
    @classmethod
    def _strip(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Write an answer first")
        return v.strip()


class EvaluationOut(CamelModel):
    id: str
    activity_id: str
    concept_id: str | None
    domain_type: str
    verdict: str
    rubric_score: float | None
    strengths: list[str]
    gaps: list[str]
    missing_ideas: list[str]
    misconception: str | None
    confidence: str
    next_activity: str
    evidence: list[SourceReference]
    concept_status: str | None
    created_at: datetime


class NextActivityOut(CamelModel):
    status: str  # ready | preparing | complete | failed
    activity: ActivityOut | None = None
    recommended_reason: str | None = None
    is_last: bool = False
