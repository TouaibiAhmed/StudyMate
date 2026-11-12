"""Assessment role: evaluates one answer against the activity's rubric (doc 8.3-8.5, Appendix A.2).

It returns an evaluation only; the orchestrator validates it, stores it and updates learning state.
"""

from typing import ClassVar, Literal

from pydantic import BaseModel, Field

from app.ai.agents.base import Agent, GroundedOutput
from app.ai.llm.types import GenerationOptions, ModelTier


class AnswerEvaluation(GroundedOutput):
    verdict: Literal["correct", "partially_correct", "incorrect", "insufficient_evidence"]
    covered_ideas: list[str] = Field(default_factory=list, max_length=4,
                                     description="Required ideas the answer clearly contains")
    strengths: list[str] = Field(default_factory=list, max_length=3)
    gaps: list[str] = Field(default_factory=list, max_length=3, description="Required ideas missing or wrong")
    misconception: str | None = Field(default=None, max_length=300,
                                      description="Only if the answer clearly states a wrong idea")
    confidence: Literal["high", "medium", "low"]


class Assessor(Agent[AnswerEvaluation]):
    name = "assessment"
    prompt = "assessment"
    output_model: ClassVar[type[BaseModel]] = AnswerEvaluation
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.0, max_tokens=400)
