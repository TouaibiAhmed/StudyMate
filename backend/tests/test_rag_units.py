import pymupdf
import pytest

from app.modules.courses.jobs import build_outline
from app.rag.chunking import ParagraphChunker, estimate_tokens
from app.rag.interfaces import ExtractedPage
from app.rag.pdf import PdfError, PyMuPdfExtractor, normalize
from tests.pdfs import course_pdf


def test_normalize_joins_hyphenated_line_breaks():
    assert normalize("infor-\nmation  is\n kept\x00") == "information is kept"


def test_extractor_pages_headings_and_low_text_warning(tmp_path):
    extraction = PyMuPdfExtractor().extract(course_pdf(tmp_path / "c.pdf", blank_pages=1))
    assert extraction.page_count == 4
    assert extraction.pages[0].headings == ["Backpropagation"]
    assert "chain rule" in extraction.pages[0].text
    assert extraction.pages[3].low_text
    assert "1 page(s) have little or no extractable text" in extraction.warnings[0]
    # No bookmarks -> outline comes from detected headings.
    assert [o.title for o in extraction.outline] == ["Backpropagation", "Photosynthesis", "Supply and demand"]


def test_extractor_prefers_pdf_bookmarks(tmp_path):
    extraction = PyMuPdfExtractor().extract(course_pdf(tmp_path / "c.pdf", toc=True))
    assert [(o.title, o.page, o.level) for o in extraction.outline][1] == ("Photosynthesis", 2, 1)


def test_extractor_rejects_scanned_and_broken_files(tmp_path):
    scanned = tmp_path / "scan.pdf"
    doc = pymupdf.open()
    doc.new_page()
    doc.save(str(scanned))
    with pytest.raises(PdfError, match="looks scanned"):
        PyMuPdfExtractor().extract(str(scanned))
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.4 garbage")
    with pytest.raises(PdfError):
        PyMuPdfExtractor().extract(str(broken))


def page(n, *paragraphs, headings=()):
    return ExtractedPage(number=n, paragraphs=list(paragraphs), headings=list(headings))


def test_chunker_keeps_page_ranges_sections_and_overlap():
    para = "word " * 60  # ~75 tokens
    pages = [page(1, "Intro", para, para, headings=["Intro"]), page(2, para, para), page(3, "Next topic", para,
                                                                                         headings=["Next topic"])]
    chunks = ParagraphChunker(target_tokens=180, overlap_tokens=80).split(pages)
    assert chunks[0].page_start == 1 and chunks[0].section_title == "Intro"
    assert any(c.page_start == 1 and c.page_end == 2 for c in chunks)
    # Overlap: the last paragraph of a chunk starts the next one (same section).
    assert chunks[1].text.startswith(para.strip())
    # The new section starts its own chunk without dragging the previous section along.
    last = chunks[-1]
    assert last.section_title == "Next topic" and last.text.startswith("Next topic")
    assert all(c.token_estimate <= 180 + 20 for c in chunks)


def test_chunker_splits_long_paragraphs_at_sentences():
    sentence = "This sentence explains one idea clearly. "
    long_para = sentence * 120  # ~1200 tokens
    chunks = ParagraphChunker(target_tokens=300, overlap_tokens=0).split([page(1, long_para)])
    assert len(chunks) >= 4
    assert all(estimate_tokens(c.text) <= 310 for c in chunks)
    assert all(c.text.rstrip().endswith(".") for c in chunks[:-1])


def test_build_outline_skips_generic_entries_and_falls_back_to_openings():
    outline = [{"title": "Introduction", "page": 1, "level": 1}, {"title": "Chain rule", "page": 2, "level": 1},
               {"title": "Gradients", "page": 3, "level": 2}, {"title": "Optimizers", "page": 4, "level": 1}]
    text = build_outline(outline, [])
    assert "Introduction" not in text and "  - Gradients (p. 3)" in text
    fallback = build_outline([{"title": "Only one", "page": 1}], [(5, "Opening of a passage")])
    assert fallback == "- p. 5: Opening of a passage"


def test_phrase_query_pairs_adjacent_words_safely():
    from app.rag.retriever import phrase_query

    expected = "how <-> do | do <-> pick | pick <-> learning | learning <-> rate"
    assert phrase_query("How do I pick a learning-rate?") == expected
    assert phrase_query("'; DROP TABLE chunks; --") == "drop <-> table | table <-> chunks"  # only letters reach SQL
    assert phrase_query("x") == "xxnomatchxx"


def test_scrub_labels_removes_internal_excerpt_ids():
    from app.rag.evidence import scrub_labels

    assert scrub_labels("Correct, as stated in excerpt E1.") == "Correct, as stated in the course material."
    assert scrub_labels("Mentioned in the course excerpt.") == "Mentioned in the course material."
    text = "L1 adds the sum (E2). Uses the chain rule [E1, E3]."
    assert scrub_labels(text) == "L1 adds the sum. Uses the chain rule."
    assert scrub_labels("Plain text stays [1].") == "Plain text stays [1]."
