"""Page-aware PDF text extraction with PyMuPDF (doc 10.2, steps 2-4).

Produces, per page, paragraphs in reading order plus heading candidates (lines set in a larger
font than the body text). Also returns the PDF's bookmarks when present. Both feed concept
extraction, which reads the outline instead of the whole document (much cheaper on a local model).
"""

import re
import statistics
from collections import Counter

import pymupdf

from app.rag.interfaces import ExtractedPage, OutlineEntry, PdfExtraction

LOW_TEXT_CHARS = 40
MAX_PAGES = 600
_HEADING_SCALE = 1.18
_MAX_HEADING_CHARS = 90


class PdfError(Exception):
    """The file cannot be processed; the message is safe to show to the student."""


_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_SPACES = re.compile(r"[ \t ]+")
_NEWLINES = re.compile(r"\s*\n\s*")


def normalize(text: str) -> str:
    text = text.replace("\x00", "")
    text = _HYPHEN_BREAK.sub(r"\1\2", text)  # "infor-\nmation" -> "information"
    text = _NEWLINES.sub(" ", text)  # line wraps inside a block are not paragraph breaks
    return _SPACES.sub(" ", text).strip()


class PyMuPdfExtractor:
    def extract(self, path: str) -> PdfExtraction:
        try:
            doc = pymupdf.open(path)
        except Exception as exc:  # noqa: BLE001 - corrupted / not a PDF
            raise PdfError("This file could not be read as a PDF.") from exc
        with doc:
            if doc.needs_pass:
                raise PdfError("This PDF is password-protected. Remove the password and upload it again.")
            if doc.page_count == 0:
                raise PdfError("This PDF has no pages.")
            if doc.page_count > MAX_PAGES:
                raise PdfError(f"This PDF has {doc.page_count} pages; the limit is {MAX_PAGES}.")

            raw_pages = [page.get_text("dict", sort=True) for page in doc]
            body_size = self._body_font_size(raw_pages)
            pages = [self._page(i + 1, raw, body_size) for i, raw in enumerate(raw_pages)]
            outline = [
                OutlineEntry(title=normalize(title)[:200], page=max(1, page), level=level)
                for level, title, page, *_ in doc.get_toc(simple=True)
                if normalize(title)
            ]

        low = [p.number for p in pages if p.low_text]
        warnings: list[str] = []
        if len(low) == len(pages):
            raise PdfError(
                "No text could be extracted. This PDF looks scanned (images of pages); "
                "text recognition (OCR) is not supported yet."
            )
        if low:
            warnings.append(
                f"{len(low)} page(s) have little or no extractable text and may be scanned images: "
                f"{_page_list(low)}."
            )
        if not outline:
            outline = [OutlineEntry(title=h, page=p.number, level=2) for p in pages for h in p.headings]
        return PdfExtraction(pages=pages, outline=outline, warnings=warnings)

    @staticmethod
    def _body_font_size(raw_pages: list[dict]) -> float:
        """Most common font size weighted by characters = body text size."""
        sizes: Counter[float] = Counter()
        for raw in raw_pages:
            for block in raw.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        sizes[round(span.get("size", 0), 1)] += len(span.get("text", ""))
        return sizes.most_common(1)[0][0] if sizes else 10.0

    @staticmethod
    def _page(number: int, raw: dict, body_size: float) -> ExtractedPage:
        paragraphs: list[str] = []
        headings: list[str] = []
        for block in raw.get("blocks", []):
            if block.get("type") != 0:  # 0 = text, 1 = image
                continue
            lines = []
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(s.get("text", "") for s in spans)
                if not text.strip():
                    continue
                lines.append(text)
                size = statistics.fmean(s.get("size", 0) for s in spans) if spans else 0
                clean = normalize(text)
                if (size >= body_size * _HEADING_SCALE and 3 <= len(clean) <= _MAX_HEADING_CHARS
                        and not clean.isdigit()):
                    headings.append(clean)
            paragraph = normalize("\n".join(lines))
            if paragraph:
                paragraphs.append(paragraph)
        total = sum(len(p) for p in paragraphs)
        return ExtractedPage(number=number, paragraphs=paragraphs, headings=_dedupe(headings),
                             low_text=total < LOW_TEXT_CHARS)


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def _page_list(pages: list[int], limit: int = 12) -> str:
    shown = ", ".join(str(p) for p in pages[:limit])
    return shown + (f" and {len(pages) - limit} more" if len(pages) > limit else "")
