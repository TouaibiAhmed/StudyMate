from datetime import datetime

from app.core.schemas import CamelModel, SourceReference


class EvidenceOut(CamelModel):
    id: str
    concept_id: str
    session_id: str | None
    question: str
    answer: str
    verdict: str
    confidence: str
    strengths: list[str]
    gaps: list[str]
    missing_ideas: list[str]
    sources: list[SourceReference]
    conditions: str
    created_at: datetime


class ConceptProgressOut(CamelModel):
    id: str
    concept_id: str
    course_id: str
    name: str
    title: str
    status: str  # not_enough_evidence | needs_practice | developing | good_evidence
    progress: int  # a level for the bar (0/25/55/90), not a percentage of knowledge
    evidence_count: int
    evidence_summary: str
    reason: str
    recommended_action: str
    attempts: list[EvidenceOut]


class CourseProgressSummary(CamelModel):
    total_concepts: int
    mastered: int
    needs_practice: int


class CourseProgressOut(CamelModel):
    course_id: str
    concepts: list[ConceptProgressOut]
    summary: CourseProgressSummary


class HistoryItemOut(CamelModel):
    id: str
    session_id: str
    course_id: str | None
    course: str | None
    title: str
    duration_seconds: int
    outcome: str
    verdict: str | None
    completed: bool
    completed_at: datetime | None
    date: str


class WeeklyActivityOut(CamelModel):
    day: str
    date: str
    sessions: int
    questions: int
    minutes: int


class ProgressOut(CamelModel):
    study_minutes: int
    sessions_completed: int
    questions_answered: int
    concepts: list[ConceptProgressOut]
    recent_sessions: list[HistoryItemOut]
    weekly_activity: list[WeeklyActivityOut]
