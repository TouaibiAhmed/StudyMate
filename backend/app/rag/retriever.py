"""Hybrid retrieval over pgvector + Postgres full-text search (doc 10.3).

score = (1 - w) * cosine_similarity + w * (keyword_rank / best_keyword_rank)

Vector search finds paraphrases; the keyword part rescues exact terms (formula names, acronyms)
that small embedding models blur. Results are always filtered by owner and course, then
near-duplicate neighbours (overlapping chunks of the same pages) are collapsed.
"""

import re
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import EmbeddingProvider
from app.rag.evidence import EvidenceItem, EvidenceSet, label_for
from app.rag.interfaces import RetrievalParams, RetrievalScope

_SQL = text(
    """
    WITH vec AS (
        SELECT c.id, 1 - (c.embedding <=> CAST(:qvec AS vector)) AS vscore
        FROM chunks c
        WHERE c.user_id = :user_id AND c.course_id = :course_id
          AND (CAST(:doc_ids AS text[]) IS NULL OR c.document_id = ANY(CAST(:doc_ids AS text[])))
        ORDER BY c.embedding <=> CAST(:qvec AS vector)
        LIMIT :k
    ),
    kw AS (
        -- Loose term overlap, plus a strong bonus for adjacent word pairs of the question
        -- ("learning rate"), so a passage with the exact phrase beats one that just repeats "learning".
        -- Flag 32 saturates the overlap score (rank / (rank + 1)) so repeating a common word
        -- cannot outweigh containing the question's exact phrase.
        SELECT c.id, ts_rank_cd(c.tsv, q, 32)
                     + 0.5 * (c.tsv @@ to_tsquery('english', :qphrase))::int AS kscore
        -- OR of the question's stemmed, stop-word-free terms: natural questions rarely contain
        -- every word of a passage, so an AND query would almost never match.
        FROM chunks c, to_tsquery('english', COALESCE(NULLIF(array_to_string(
                 tsvector_to_array(to_tsvector('english', :qtext)), ' | '), ''), 'xxnomatchxx')) q
        WHERE c.user_id = :user_id AND c.course_id = :course_id
          AND (CAST(:doc_ids AS text[]) IS NULL OR c.document_id = ANY(CAST(:doc_ids AS text[])))
          AND c.tsv @@ q
        ORDER BY kscore DESC
        LIMIT :k
    )
    SELECT c.id, c.document_id, d.filename, c.chunk_index, c.page_start, c.page_end, c.text,
           COALESCE(vec.vscore, 0) AS vscore, COALESCE(kw.kscore, 0) AS kscore
    FROM (SELECT id FROM vec UNION SELECT id FROM kw) ids
    JOIN chunks c ON c.id = ids.id
    JOIN documents d ON d.id = c.document_id AND d.status = 'ready'
    LEFT JOIN vec ON vec.id = c.id
    LEFT JOIN kw ON kw.id = c.id
    """
)


_WORD = re.compile(r"[^\W_]+")


def phrase_query(query: str) -> str:
    """'how to pick a learning rate' -> 'how <-> to | to <-> pick | ... | learning <-> rate'.

    Postgres stems each word and drops stop words; only letters/digits reach to_tsquery.
    """
    words = [w for w in _WORD.findall(query.lower()) if len(w) > 1][:24]
    pairs = [f"{a} <-> {b}" for a, b in zip(words, words[1:], strict=False)]
    return " | ".join(pairs) or "xxnomatchxx"


@dataclass
class _Candidate:
    id: str
    document_id: str
    filename: str
    chunk_index: int
    page_start: int
    page_end: int
    text: str
    vscore: float
    kscore: float
    score: float = 0.0


class PgVectorRetriever:
    def __init__(self, db: AsyncSession, embedder: EmbeddingProvider):
        self.db = db
        self.embedder = embedder

    async def retrieve(
        self, query: str, scope: RetrievalScope, params: RetrievalParams | None = None
    ) -> EvidenceSet:
        params = params or RetrievalParams()
        query = query.strip()
        if not query:
            return EvidenceSet()
        qvec = await self.embedder.embed_query(f"{scope.concept_hint}: {query}" if scope.concept_hint else query)
        # Let HNSW keep scanning when the owner/course filter removes candidates (pgvector >= 0.8).
        await self.db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        rows = (await self.db.execute(_SQL, {
            "qvec": str(qvec),
            "qtext": query,
            "qphrase": phrase_query(query),
            "user_id": scope.user_id,
            "course_id": scope.course_id,
            "doc_ids": scope.document_ids,
            "k": params.candidate_k,
        })).mappings().all()
        candidates = [_Candidate(**dict(r)) for r in rows if r["id"] not in params.exclude_chunk_ids]
        return EvidenceSet(rank(candidates, params))


def rank(candidates: list[_Candidate], params: RetrievalParams) -> list[EvidenceItem]:
    if not candidates:
        return []
    best_k = max(c.kscore for c in candidates) or 1.0
    w = params.keyword_weight
    for c in candidates:
        c.score = (1 - w) * c.vscore + w * (c.kscore / best_k)
    # Relevant = semantically close enough, or a keyword hit that is also semantically plausible.
    floor = params.min_score
    relevant = [c for c in candidates if c.vscore >= floor or (c.kscore > 0 and c.vscore >= floor - 0.04)]
    relevant.sort(key=lambda c: c.score, reverse=True)

    chosen: list[_Candidate] = []
    for c in relevant:
        # Overlapping neighbours (same document, adjacent chunk) add little new information.
        if any(o.document_id == c.document_id and abs(o.chunk_index - c.chunk_index) <= 1 for o in chosen):
            continue
        chosen.append(c)
        if len(chosen) == params.top_k:
            break
    return [
        EvidenceItem(label=label_for(i), chunk_id=c.id, document_id=c.document_id, document_title=c.filename,
                     page_start=c.page_start, page_end=c.page_end, text=c.text, score=round(c.score, 4))
        for i, c in enumerate(chosen)
    ]


async def load_evidence(db: AsyncSession, chunk_ids: list[str]) -> EvidenceSet:
    """Rebuild the exact excerpts an activity was written from (same order, same labels), so the
    assessment role grades against the material the question was based on."""
    if not chunk_ids:
        return EvidenceSet()
    rows = (await db.execute(text(
        "SELECT c.id, c.document_id, d.filename, c.page_start, c.page_end, c.text "
        "FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.id = ANY(CAST(:ids AS text[]))"
    ), {"ids": chunk_ids})).mappings().all()
    by_id = {r["id"]: r for r in rows}
    found = [by_id[i] for i in chunk_ids if i in by_id]  # chunks of a deleted document are skipped
    return EvidenceSet([
        EvidenceItem(label=label_for(n), chunk_id=r["id"], document_id=r["document_id"], document_title=r["filename"],
                     page_start=r["page_start"], page_end=r["page_end"], text=r["text"])
        for n, r in enumerate(found)
    ])
