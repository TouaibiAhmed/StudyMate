"""AI roles ("agents") as typed, bounded functions.

An agent is NOT an autonomous loop. It is one model call with:
  * a versioned prompt (app/ai/prompts/templates/<prompt>/)
  * a Pydantic output schema (enforced by the runtime + validated here)
  * a model tier and generation limits
  * the learner context every role receives (doc Appendix A)

Agents never write to the database and never decide learning state. The orchestrator calls
them, validates the result, applies deterministic rules and persists.

Roles (added in their build steps):
  tutor, assessment, coach            - study loop (step 4)
  chat                                - course chat (step 3)
  concept_extractor                   - ingestion (step 2)
  summarizer, quiz_generator          - study tools (step 5)
  exam_generator                      - exams (step 6), assessment reused for grading
  roadmap_outliner, roadmap_detailer  - roadmap generation (step 7)
"""

from dataclasses import dataclass
from typing import Any, ClassVar, Generic, TypeVar

from pydantic import BaseModel, Field

from app.ai.llm.client import CallMeta, LLMClient
from app.ai.llm.types import GenerationOptions, ModelTier
from app.ai.prompts.registry import get_prompt
from app.core.schemas import SourceReference
from app.rag.evidence import EvidenceSet, KnowledgeMode

Out = TypeVar("Out", bound=BaseModel)


class LearnerContext(BaseModel):
    """Supplied to every role: {domain, domain_type, level, language, knowledge_mode}."""

    domain: str = "General studies"
    domain_type: str = "conceptual"  # quantitative | code-based | conceptual | argumentative | language
    level: str = "Undergraduate"
    language: str = "English"
    knowledge_mode: KnowledgeMode = KnowledgeMode.GENERAL_KNOWLEDGE
    less_tested_domain: bool = False


class GroundedOutput(BaseModel):
    """Mixin for outputs that may rely on course excerpts."""

    source_labels: list[str] = Field(default_factory=list, description="Ids of excerpts used, e.g. ['E1']")


@dataclass
class AgentRun(Generic[Out]):
    output: Out
    prompt_id: str
    model: str
    knowledge_mode: KnowledgeMode
    citations: list[SourceReference]
    attempts: int


class Agent(Generic[Out]):
    name: ClassVar[str]
    prompt: ClassVar[str]
    output_model: ClassVar[type[BaseModel]]
    tier: ClassVar[ModelTier] = ModelTier.QUALITY
    prompt_version: ClassVar[int | None] = None  # None = latest
    options: ClassVar[GenerationOptions] = GenerationOptions(temperature=0.2, max_tokens=600)

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def run(
        self,
        learner: LearnerContext,
        *,
        evidence: EvidenceSet | None = None,
        user_id: str | None = None,
        subject: str | None = None,
        **variables: Any,
    ) -> AgentRun[Out]:
        evidence = evidence or EvidenceSet()
        # The knowledge mode follows the evidence actually retrieved, not what was requested.
        learner = learner.model_copy(update={"knowledge_mode": evidence.mode})
        prompt = get_prompt(self.prompt, self.prompt_version)
        messages = prompt.render(learner=learner, evidence=evidence, **variables)
        result = await self.llm.generate_structured(
            messages,
            self.output_model,
            tier=self.tier,
            options=self.options,
            meta=CallMeta(
                role=self.name,
                prompt_version=prompt.id,
                user_id=user_id,
                subject=subject,
                source_chunk_ids=evidence.chunk_ids,
            ),
        )
        output = result.value
        labels = output.source_labels if isinstance(output, GroundedOutput) else None
        return AgentRun(
            output=output,  # type: ignore[arg-type]
            prompt_id=prompt.id,
            model=result.response.model,
            knowledge_mode=evidence.mode,
            citations=evidence.citations(labels),
            attempts=result.attempts,
        )
