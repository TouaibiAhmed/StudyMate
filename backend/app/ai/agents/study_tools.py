"""Roles for study tools: summarizer, quiz writer and quiz short-answer grader.

Each call works on one small slice of the material (a section group or a few chunks), so a long
document becomes several short calls with visible progress instead of one huge prompt.
"""

from typing import ClassVar, Literal

from pydantic import BaseModel, Field

from app.ai.agents.base import Agent, GroundedOutput
from app.ai.llm.types import GenerationOptions, ModelTier

QuestionType = Literal["Multiple Choice", "True/False", "Short Answer"]


class SummarySection(GroundedOutput):
    heading: str = Field(min_length=2, max_length=100)
    points: list[str] = Field(min_length=1, max_length=6, description="Short, self-contained study points")


class Summarizer(Agent[SummarySection]):
    name = "summarizer"
    prompt = "summarizer"
    output_model: ClassVar[type[BaseModel]] = SummarySection
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.2, max_tokens=450)


class DraftQuestion(BaseModel):
    type: QuestionType
    prompt: str = Field(min_length=8, max_length=500)
    options: list[str] = Field(default_factory=list, max_length=4)
    answer: str = Field(min_length=1, max_length=400, description="Correct option text, True/False, or model answer")
    explanation: str = Field(default="", max_length=500)
    required_ideas: list[str] = Field(default_factory=list, max_length=3, description="Short Answer only")
    source_labels: list[str] = Field(default_factory=list)


class QuestionBatch(BaseModel):
    questions: list[DraftQuestion] = Field(min_length=1, max_length=5)


class QuizWriter(Agent[QuestionBatch]):
    name = "quiz_writer"
    prompt = "quiz_writer"
    output_model: ClassVar[type[BaseModel]] = QuestionBatch
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.4, max_tokens=900)


class GradedAnswer(BaseModel):
    number: int = Field(ge=1)
    correct: bool
    feedback: str = Field(default="", max_length=300)


class GradedBatch(BaseModel):
    results: list[GradedAnswer]


class QuizGrader(Agent[GradedBatch]):
    name = "quiz_grader"
    prompt = "quiz_grader"
    output_model: ClassVar[type[BaseModel]] = GradedBatch
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.0, max_tokens=500)
