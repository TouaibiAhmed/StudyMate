"""Roadmap generation in two passes (doc 15.2).

1. The outliner proposes the topics in learning order with their prerequisites (short output).
2. The detailer writes descriptions and resource suggestions for a few topics at a time.

Small outputs keep each call fast on a local model and let the UI show progress. The graph is
validated by code afterwards (unknown or forward edges dropped, so it is always acyclic).
"""

from typing import ClassVar

from pydantic import BaseModel, Field

from app.ai.agents.base import Agent
from app.ai.llm.types import GenerationOptions, ModelTier


class OutlineTopic(BaseModel):
    id: int = Field(ge=1, le=60)
    title: str = Field(min_length=2, max_length=90)
    optional: bool = False
    prerequisites: list[int] = Field(default_factory=list, max_length=4, description="ids of earlier topics")


class RoadmapOutline(BaseModel):
    description: str = Field(min_length=10, max_length=300)
    topics: list[OutlineTopic] = Field(min_length=4, max_length=30)


class RoadmapOutliner(Agent[RoadmapOutline]):
    name = "roadmap_outliner"
    prompt = "roadmap_outliner"
    output_model: ClassVar[type[BaseModel]] = RoadmapOutline
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.3, max_tokens=900)


class TopicDetail(BaseModel):
    id: int
    description: str = Field(min_length=10, max_length=400)
    resources: list[str] = Field(default_factory=list, max_length=3)


class TopicDetails(BaseModel):
    topics: list[TopicDetail] = Field(min_length=1, max_length=10)


class RoadmapDetailer(Agent[TopicDetails]):
    name = "roadmap_detailer"
    prompt = "roadmap_detailer"
    output_model: ClassVar[type[BaseModel]] = TopicDetails
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.3, max_tokens=900)
