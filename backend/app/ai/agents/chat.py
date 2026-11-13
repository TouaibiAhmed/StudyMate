"""Course chat: a streamed, free-text answer (not JSON), grounded in retrieved excerpts.

Citations: the model marks claims with excerpt labels like [E1]. `finalize_answer` keeps only
labels that exist in the evidence set, renumbers them [1], [2] in order of first use and returns
the matching source metadata. Unknown labels are removed; in general-knowledge mode all markers
are removed, so a hallucinated reference never reaches the student.
"""

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.ai.agents.base import LearnerContext
from app.ai.llm.client import CallMeta, LLMClient
from app.ai.llm.types import ChatMessage, GenerationOptions, ModelTier
from app.ai.prompts.registry import get_prompt
from app.core.schemas import SourceReference
from app.rag.evidence import EvidenceSet, KnowledgeMode, scrub_labels

PROMPT = "chat"
HISTORY_TURNS = 6
HISTORY_CHARS = 700
OPTIONS = GenerationOptions(temperature=0.3, max_tokens=400)

_MARKER = re.compile(r"\[\s*(E\d+(?:\s*[,;]\s*E\d+)*)\s*\]", re.IGNORECASE)


@dataclass(frozen=True)
class HistoryTurn:
    role: str  # user | assistant
    content: str


@dataclass(frozen=True)
class ChatTopic:
    course_title: str | None = None
    topic_title: str | None = None


def build_messages(
    learner: LearnerContext, evidence: EvidenceSet, topic: ChatTopic, history: list[HistoryTurn], question: str
) -> tuple[list[ChatMessage], str]:
    learner = learner.model_copy(update={"knowledge_mode": evidence.mode})
    prompt = get_prompt(PROMPT)
    system, user = prompt.render(learner=learner, evidence=evidence, topic=topic, question=question)
    turns = [
        ChatMessage(h.role, h.content if len(h.content) <= HISTORY_CHARS else h.content[:HISTORY_CHARS] + "…")
        for h in history[-HISTORY_TURNS:]
        if h.role in ("user", "assistant") and h.content.strip()
    ]
    return [system, *turns, user], prompt.id


async def stream_answer(
    llm: LLMClient, messages: list[ChatMessage], *, prompt_id: str, evidence: EvidenceSet,
    user_id: str, subject: str,
) -> AsyncIterator[str]:
    meta = CallMeta(role="chat", prompt_version=prompt_id, user_id=user_id, subject=subject,
                    source_chunk_ids=evidence.chunk_ids)
    async for delta in llm.stream_text(messages, meta=meta, tier=ModelTier.FAST, options=OPTIONS):
        yield delta


def finalize_answer(text: str, evidence: EvidenceSet) -> tuple[str, list[SourceReference]]:
    grounded = evidence.mode is KnowledgeMode.COURSE_GROUNDED
    known = evidence.by_label()
    order: list[str] = []

    def replace(match: re.Match) -> str:
        labels = [part.strip().upper() for part in re.split(r"[,;]", match.group(1))]
        numbers = []
        for label in labels:
            if not grounded or label not in known:
                continue
            if label not in order:
                order.append(label)
            numbers.append(str(order.index(label) + 1))
        return f"[{', '.join(dict.fromkeys(numbers))}]" if numbers else ""

    cleaned = scrub_labels(_MARKER.sub(replace, text))  # also "according to excerpt E2" in prose
    cleaned = re.sub(r"[ \t]+([.,;:!?])", r"\1", cleaned)  # "word [E9]." -> "word."
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned, evidence.citations(order)
