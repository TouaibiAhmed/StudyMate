from datetime import datetime

from app.core.schemas import CamelModel
from app.modules.progress.schemas import HistoryItemOut


class NextStepOut(CamelModel):
    """The single most useful thing to do now, chosen by rules (no model call)."""

    kind: str  # upload | wait_for_material | resume_session | study_concept | practice_exam | roadmap
    title: str
    detail: str
    course_id: str | None = None
    concept_id: str | None = None
    session_id: str | None = None
    href: str | None = None


class ContinueOut(CamelModel):
    session_id: str
    course_id: str | None
    course: str | None
    topic: str
    answered: int
    planned: int
    status: str  # preparing | active | completed
    last_activity_at: datetime


class DashboardCourseOut(CamelModel):
    course_id: str
    title: str
    subject: str
    progress: int  # average concept level, as on the courses page
    concept_count: int
    last_activity_at: datetime | None


class PracticeConceptOut(CamelModel):
    concept_id: str
    course_id: str
    course: str
    name: str
    status: str
    reason: str


class DayOut(CamelModel):
    day: str  # Mon, Tue, ...
    date: str
    minutes: int
    sessions: int
    questions: int
    active: bool
    is_today: bool
    is_future: bool


class StreakOut(CamelModel):
    current: int
    longest: int
    active_today: bool
    show: bool  # the student's preference (settings)


class WeekGoalOut(CamelModel):
    target: int  # study sessions per week (settings)
    done: int  # study sessions with at least one answer this calendar week


class RoadmapProgressOut(CamelModel):
    id: str
    title: str
    progress: int
    completed_topics: int
    total_topics: int
    next_topic: str | None


class ExamSuggestionOut(CamelModel):
    course_id: str
    title: str
    concept_count: int


class DashboardOut(CamelModel):
    greeting_name: str
    focus: str | None
    today: str  # ISO date in the student's time zone
    part_of_day: str  # morning | afternoon | evening
    time_zone: str
    is_first_time: bool
    next_step: NextStepOut
    continue_learning: ContinueOut | None
    courses: list[DashboardCourseOut]
    concepts_to_practice: list[PracticeConceptOut]
    recent_sessions: list[HistoryItemOut]
    week: list[DayOut]
    week_minutes: int
    streak: StreakOut
    week_goal: WeekGoalOut
    roadmap: RoadmapProgressOut | None
    exam_suggestion: ExamSuggestionOut | None
