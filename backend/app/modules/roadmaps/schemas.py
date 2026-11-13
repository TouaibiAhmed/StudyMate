from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

NodeStatus = Literal["not_started", "in_progress", "completed", "known"]


class GenerateIn(CamelModel):
    role: str = Field(min_length=3, max_length=120)
    category: str = Field(default="engineering", max_length=40)
    goal: str = Field(default="", max_length=600)


class NodeStatusIn(CamelModel):
    """status=None removes the manual status: the node follows the evidence again."""

    status: NodeStatus | None


class Position(CamelModel):
    x: float
    y: float


class NodeOut(CamelModel):
    id: str
    key: str
    title: str
    description: str
    order: int
    type: str  # core | optional
    status: NodeStatus
    progress: int  # 0-100
    prerequisites: list[str]  # node ids
    resources: list[str]
    position: Position
    concept_id: str | None
    concept_name: str | None
    course_id: str | None
    evidence_summary: str | None
    manual_override: bool


class RoadmapSummaryOut(CamelModel):
    id: str
    slug: str | None  # curated roadmaps only
    role: str
    category: str
    description: str
    source: str  # curated | generated
    status: str  # generating | ready | failed
    progress: int  # the student's progress, 0-100 over core topics
    topic_count: int
    core_topics: list[str]
    optional_topics: list[str]
    following: bool
    created_at: datetime


class RoadmapOut(RoadmapSummaryOut):
    note: str
    goal: str | None
    version: int
    generation_progress: float
    stage: str | None
    error: str | None
    nodes: list[NodeOut]


class NodeSessionOut(CamelModel):
    session_id: str
    course_id: str | None
    topic: str
    goal: str
    knowledge_mode: str
