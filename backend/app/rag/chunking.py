"""Paragraph-aware chunking (doc 10.2 step 5, 10.4).

* Chunks are built from whole paragraphs; only paragraphs longer than the target are split,
  at sentence boundaries.
* Every chunk keeps its page range and the section heading it falls under.
* A new section always starts a new chunk (unless the current one is a tiny scrap), so a
  definition is not glued to an unrelated topic.
* Consecutive chunks overlap by trailing paragraphs (up to `overlap_tokens`).

Token counts are estimated (~4 characters per token for English text); precision is not needed,
the goal is to keep prompts inside the local model's small context window.
"""

import re
from dataclasses import dataclass

from app.rag.interfaces import ExtractedPage, TextChunk

_SENTENCE_END = re.compile(r"(?<=[.!?;:])\s+(?=[A-Z0-9(\"'])")


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4))


@dataclass(frozen=True)
class _Unit:
    text: str
    page: int
    section: str | None
    tokens: int


class ParagraphChunker:
    def __init__(self, target_tokens: int = 350, overlap_tokens: int = 60, min_tokens: int = 20):
        self.target = target_tokens
        self.overlap = overlap_tokens
        self.min_tokens = min_tokens

    def split(self, pages: list[ExtractedPage]) -> list[TextChunk]:
        units = list(self._units(pages))
        chunks: list[TextChunk] = []
        current: list[_Unit] = []

        def emit() -> None:
            text = "\n\n".join(u.text for u in current).strip()
            if estimate_tokens(text) < self.min_tokens and chunks:
                return  # a tiny tail is already covered by the previous chunk's overlap
            chunks.append(TextChunk(
                index=len(chunks),
                text=text,
                page_start=current[0].page,
                page_end=current[-1].page,
                section_title=next((u.section for u in reversed(current) if u.section), None),
                token_estimate=estimate_tokens(text),
            ))

        for unit in units:
            size = sum(u.tokens for u in current)
            section_changed = bool(current) and unit.section != current[-1].section
            # A new section starts a new chunk unless the current one is only a heading-sized scrap.
            if current and (size + unit.tokens > self.target or (section_changed and size >= self.min_tokens * 2)):
                emit()
                current = [] if section_changed else self._overlap_tail(current)
            current.append(unit)
        if current:
            emit()
        return chunks

    def _overlap_tail(self, units: list[_Unit]) -> list[_Unit]:
        tail: list[_Unit] = []
        total = 0
        for unit in reversed(units):
            if total + unit.tokens > self.overlap:
                break
            tail.insert(0, unit)
            total += unit.tokens
        return tail

    def _units(self, pages: list[ExtractedPage]):
        section: str | None = None
        for page in pages:
            headings = {h.lower() for h in page.headings}
            for paragraph in page.paragraphs:
                if paragraph.lower() in headings:
                    section = paragraph
                for piece in self._split_long(paragraph):
                    yield _Unit(piece, page.number, section, estimate_tokens(piece))

    def _split_long(self, paragraph: str) -> list[str]:
        if estimate_tokens(paragraph) <= self.target:
            return [paragraph]
        pieces: list[str] = []
        buf = ""
        for sentence in _SENTENCE_END.split(paragraph):
            for part in self._hard_split(sentence):
                candidate = f"{buf} {part}".strip()
                if buf and estimate_tokens(candidate) > self.target:
                    pieces.append(buf)
                    buf = part
                else:
                    buf = candidate
        if buf:
            pieces.append(buf)
        return pieces

    def _hard_split(self, sentence: str) -> list[str]:
        """A single 'sentence' longer than the target (tables, code) is cut at word boundaries."""
        if estimate_tokens(sentence) <= self.target:
            return [sentence]
        words, parts, buf = sentence.split(), [], []
        for word in words:
            buf.append(word)
            if estimate_tokens(" ".join(buf)) >= self.target:
                parts.append(" ".join(buf))
                buf = []
        if buf:
            parts.append(" ".join(buf))
        return parts
