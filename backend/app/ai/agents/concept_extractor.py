"""Concept extractor: proposes the study concepts of a document from its outline (doc 11.1).

Reading the outline (bookmarks or detected headings) instead of the full text keeps this to a
single short model call, which matters on CPU-bound local inference.
"""

from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

from app.ai.agents.base import Agent
from app.ai.llm.types import GenerationOptions, ModelTier


class ExtractedConcept(BaseModel):
    name: str = Field(min_length=2, max_length=80, description="Short concept name, at most 6 words")
    description: str = Field(min_length=5, max_length=300, description="One sentence explaining the concept")
    prerequisites: list[str] = Field(default_factory=list, max_length=4,
                                     description="Names of other concepts needed first")

    @field_validator("name", "description")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip().strip(".").strip() if v else v


class ConceptList(BaseModel):
    concepts: list[ExtractedConcept] = Field(min_length=1, max_length=12)


class ConceptExtractor(Agent[ConceptList]):
    name = "concept_extractor"
    prompt = "concept_extractor"
    output_model: ClassVar[type[BaseModel]] = ConceptList
    tier = ModelTier.QUALITY
    options = GenerationOptions(temperature=0.1, max_tokens=900)
