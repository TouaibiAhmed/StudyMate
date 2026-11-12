"""Evidence sets and citation resolution.

The model never writes citations. It sees excerpts labelled with short ids ("E1", "E2", ...),
returns the labels it relied on, and this module maps labels back to stored chunk metadata.
Unknown labels are dropped, so a hallucinated reference can never reach the student, and
general-knowledge mode can never show one.
"""

from dataclasses import dataclass, field
from enum import StrEnum

from app.core.schemas import SourceReference


class KnowledgeMode(StrEnum):
    COURSE_GROUNDED = "course_grounded"
    GENERAL_KNOWLEDGE = "general_knowledge"


@dataclass(frozen=True)
class EvidenceItem:
    label: str
    chunk_id: str
    document_id: str
    document_title: str
    page_start: int
    page_end: int
    text: str
    score: float = 0.0


@dataclass
class EvidenceSet:
    items: list[EvidenceItem] = field(default_factory=list)

    @property
    def mode(self) -> KnowledgeMode:
        return KnowledgeMode.COURSE_GROUNDED if self.items else KnowledgeMode.GENERAL_KNOWLEDGE

    @property
    def chunk_ids(self) -> list[str]:
        return [i.chunk_id for i in self.items]

    def by_label(self) -> dict[str, EvidenceItem]:
        return {i.label: i for i in self.items}

    def citations(self, labels: list[str] | None, *, excerpt_chars: int = 220) -> list[SourceReference]:
        """Resolve model-supplied labels to real source references (unknown labels are ignored)."""
        if not labels or self.mode is KnowledgeMode.GENERAL_KNOWLEDGE:
            return []
        known = self.by_label()
        seen: set[str] = set()
        refs: list[SourceReference] = []
        for raw in labels:
            label = raw.strip().upper()
            item = known.get(label)
            if item is None or label in seen:
                continue
            seen.add(label)
            excerpt = item.text if len(item.text) <= excerpt_chars else item.text[:excerpt_chars].rstrip() + "…"
            refs.append(
                SourceReference(
                    document_id=item.document_id,
                    title=item.document_title,
                    page=item.page_start,
                    page_end=item.page_end,
                    excerpt=excerpt,
                    locator=f"chunk:{item.chunk_id}",
                )
            )
        return refs


def label_for(index: int) -> str:
    return f"E{index + 1}"
