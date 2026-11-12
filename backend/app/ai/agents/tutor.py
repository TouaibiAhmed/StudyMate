"""Tutor role: writes one study activity (question, hint ladder, explanation, rubric).

The rubric is stored with the activity and reused by the assessment role, so grading is
reproducible and the student is judged against the same expectations the question was written for.
"""

from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base import Agent, GroundedOutput
from app.ai.llm.types import GenerationOptions, ModelTier


class Rubric(BaseModel):
    required_ideas: list[str] = Field(min_length=1, max_length=4, description="Ideas a good answer must contain")
    acceptable_alternatives: list[str] = Field(default_factory=list, max_length=3)
    common_gaps: list[str] = Field(default_factory=list, max_length=3, description="Typical mistakes or omissions")


class ActivitySpec(GroundedOutput):
    question: str = Field(min_length=10, max_length=600, description="One clear question, no answer inside")
    context: str | None = Field(default=None, max_length=500, description="Optional short scenario or data")
    hints: list[str] = Field(min_length=2, max_length=3,
                             description="Graduated: conceptual hint, targeted hint, worked first step")
    explanation: str = Field(min_length=20, max_length=900, description="Full explanation, shown only on request")
    rubric: Rubric

    @field_validator("question", "explanation")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class Tutor(Agent[ActivitySpec]):
    name = "tutor"
    prompt = "tutor"
    output_model: ClassVar[type[BaseModel]] = ActivitySpec
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.4, max_tokens=700)
