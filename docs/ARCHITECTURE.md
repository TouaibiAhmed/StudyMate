# StudyMate backend architecture

Companion to *Study Partner AI — Project Documentation v1.1*. This file records the decisions
taken for the implementation and where each part lives in `backend/`.

## 1. Runtime picture

```
React (Vite, :5173) ──/api──► FastAPI "api" process (:8000)
                                │  feature routers → services → repositories
                                │  httpOnly cookie session, ownership checks
                                │  SSE for streamed AI text (chat, tutor)
                                │
                                ├── AI layer (app/ai)
                                │     LLMClient ─► OllamaProvider ─► Ollama on the host (GPU: GTX 1650 4 GB)
                                │     agents (typed roles) · versioned prompts · structured outputs · tracing
                                ├── RAG (app/rag)         retrieval over pgvector, citations by code
                                ├── Orchestration         explicit state machines + call budgets
                                ├── Learning policy       deterministic mastery + routing (no LLM)
                                └── Recommendations       content-based, embeddings + rules
                                │
                                ▼ enqueue
                          Postgres 17 + pgvector (Docker, :5433)
                                ▲ claim (FOR UPDATE SKIP LOCKED)
                                │
                     "worker" process (python -m app.jobs.worker)
                       ingestion · concept extraction · summaries · quizzes · exams · roadmaps
                       · recommendation refresh · periodic: exam sweeper, stale-job recovery
```

Two processes, one codebase, one database. No Redis/Celery: on one machine with one local model
a Postgres-backed queue is simpler and transactional (a domain row and its job are created in
the same commit).

## 2. Code layout

```
backend/app/
  core/           config, errors (one error shape), camelCase schemas, logging + request ids
  db/             declarative base, async session
  jobs/           Job table, queue (enqueue/claim/retry), registry (@job_handler, @periodic), worker
  ai/
    llm/          types, provider protocol, Ollama provider, LLMClient gateway, tracing, factory
    embeddings.py sentence-transformers (multilingual-e5-small) or Ollama embeddings
    prompts/      registry + templates/<role>/v<N>.{system,user}.j2, shared partials
    agents/       Agent base + one module per role
    models.py     ai_calls audit table
  rag/            evidence sets + citations, pipeline interfaces, (step 2) extractor/chunker/retriever
  orchestration/  state machine, call budget, (step 4) study-session orchestrator
  learning/       (step 4) evidence weighting, mastery estimate, next-activity policy
  recommendations/(step 9) interest profile, candidate scoring, explanations
  modules/        feature slices: models, schemas, repository, service, router, jobs
  api/            cross-cutting routes (health)
```

Rules that keep the layers honest:
* Routers are thin. Services own transactions and business rules. Repositories always filter by owner.
* Agents never touch the database and never change learning state.
* Deterministic rules (mastery, routing, exam timer, streaks, MCQ grading) never call the LLM.
* Nothing returned to the client contains model names, prompts or stack traces.

## 3. LLM layer

| Concern | Decision |
|---|---|
| Runtime | Ollama on the host (uses the GPU). Provider protocol so an OpenAI-compatible provider can be added later. |
| Model tiers | `fast` (chat, tutor, hints) and `quality` (grading, generation). Both map to settings; chosen by benchmark (`scripts/benchmark_models.py`). |
| Structured output | Ollama `format=<JSON schema>` (grammar-constrained) **and** Pydantic validation. One repair retry with the validation errors; truncated output is retried clean. |
| Concurrency | Per-process semaphore (default 1). Ollama queues across processes. |
| Prompt budget | `num_ctx` 4096, top-3 excerpts of ~350 tokens, capped `max_tokens` per role. Prompt reading is the slow part on this hardware. |
| Traceability | Every call writes `ai_calls`: role, prompt version, model, tier, status, latency, tokens, source chunk ids. No prompt text or student answers. |
| Failures | Typed errors (`unavailable`, `timeout`, `model_missing`, `invalid_output`). Background jobs retry transient ones with backoff (minutes when the runtime is unreachable, so an Ollama restart is survived); API calls return a safe 503. |

## 4. Agents (AI roles)

Each role = versioned prompt + Pydantic output schema + tier + limits. Every role receives the
learner context `{domain, domain_type, level, language, knowledge_mode}` (doc Appendix A).

| Role | Tier | Input | Output | Step |
|---|---|---|---|---|
| concept_extractor | quality | chunk batch | concepts (name, description, aliases, prerequisites) | 2 |
| chat | fast, streamed | conversation + excerpts | answer text + excerpt labels | 3 |
| tutor | fast | concept, activity state, excerpts | explanation / question / hint ladder | 4 |
| assessment | quality | question, rubric, answer, excerpts | verdict, strengths, gaps, misconception, confidence | 4 |
| coach | fast | evidence summary, allowed activities | suggested next activity + reason | 4 |
| summarizer | quality | chunk groups (map) → partial summaries (reduce) | sections with points + labels | 5 |
| quiz_generator | quality | excerpts per concept | questions + answer keys + rubrics | 5 |
| exam_generator | quality | concepts, domain type, excerpts | questions + rubrics + expected time | 6 |
| roadmap_outliner / roadmap_detailer | quality | role/goal | outline (titles, order, prerequisites) → node details | 7 |

The coach only *suggests*; the learning policy decides. Grading of MCQ/true-false and numeric
answers is done in code.

## 5. RAG

**Ingestion (worker job):** validate → PyMuPDF page text (flag low-text pages) → normalize →
paragraph-aware chunks (~350 tokens, 60 overlap, page ranges kept) → embeddings (e5 `passage:`)
→ `chunks` table with `vector(384)` + HNSW index + `tsvector` → concept extraction job.

**Retrieval:** embed query (e5 `query:`) → cosine search on candidate_k=12 filtered by
`user_id` + `course_id` (+ optional documents) → hybrid score with full-text rank → drop near
duplicates → top_k=3 → label `E1..En`.

**Concepts from the outline:** concept extraction reads the document's bookmarks or detected
headings (or, without structure, the opening of ~15 passages spread over the document), not the
full text. One short model call per document instead of one per chunk batch: about 2 minutes on
CPU instead of ~10. New concepts are deduplicated by normalized name, embedded, and linked to the
3 chunks that cover them best (their pages become the concept's source references).

**Calibration:** `multilingual-e5-small` similarities are compressed (off-topic text still scores
~0.7–0.82), so `RETRIEVAL_MIN_SCORE` is 0.83; on-topic questions score ~0.84–0.90. Re-check this
on real course material when the embedding model changes.

**Grounding rules:**
* Excerpts are wrapped as untrusted reference text (prompt-injection defence).
* The model returns excerpt labels; `EvidenceSet.citations()` maps them to real document/page
  metadata and drops unknown labels. Citations are never generated text.
* Empty evidence ⇒ `general_knowledge` mode: labelled in the UI, no citations possible.
  The mode is stored on every activity, evaluation, message and generated artifact.

### Course chat (step 3)

* `POST /api/chat/conversations/{id}/messages/stream` answers with Server-Sent Events:
  `user` -> `meta` (knowledge mode) -> `delta`... -> `done` (final message) or `error`.
  Validation, rate limits and retrieval run before the stream opens, so they fail as normal JSON errors.
* Retrieval uses the message alone; only messages that look like follow-ups ("why?", "give an example")
  are retried together with the previous question when the first search finds nothing.
* The model cites with `[E1]`; `finalize_answer` keeps only labels present in the evidence, renumbers
  them `[1]`, `[2]` and attaches stored document/page metadata. General-knowledge answers carry no
  citations and are labelled in the UI ("not from your course material").
* One answer at a time per student (lock with a 10-minute safety expiry), 20 messages / 10 minutes.
* Stopping an answer keeps the partial text as `interrupted`; a model failure before any text removes
  the stored question so a retry does not duplicate it.
* Measured on the dev laptop (CPU only): first token ~60 s from a cold model, ~3.3 tokens/s after.

## 6. Orchestration

Plain Python state machines (`orchestration/state_machine.py`) with explicit transition tables,
persisted in Postgres:

* **Study session:** `created → diagnosing → awaiting_answer → evaluating → feedback → (next | summary) → completed`.
  Hints are counted server-side. A call budget caps model calls per session.
* **Exam attempt:** `ready → in_progress → (submitted | expired) → grading → graded`.
  The deadline is stored; the client timer is display only. Hint/tutor actions are rejected by a
  state guard, not by a prompt. The worker's sweeper auto-submits expired attempts.
* **Generation jobs:** `queued → running → (succeeded | failed)` with progress for the UI.

Latency strategy: SSE streaming for interactive text, background jobs + polling for heavy
generation, and pre-generating the likely next activity while the student reads feedback.

## 7. Learning policy (step 4)

Evidence records are immutable (answer, verdict, rubric score, hints used, difficulty, mode,
exam flag, timestamp). The concept status (`not_enough_evidence | needs_practice | developing |
good_evidence`) is recomputed from evidence with transparent weights: exam-condition evidence >
unhinted practice > hinted practice; recency decay; at least two independent successes before
`good_evidence`. Routing table from doc 11.4. Roadmap node status is derived from the linked
concept's status, with manual overrides recorded separately.

## 8. Recommendations (step 9)

Recommends **platform catalog items** (catalog courses and curated roadmaps). Never other
students' content; generated roadmaps stay private.

* **Item vectors:** embed each catalog item (title, description, concepts/nodes) once.
* **Interest vector:** weighted, recency-decayed mean of embeddings of what the student engages
  with: profile field + target role (cold start), followed roadmaps and completed nodes, own
  courses and their concepts, study activity. Saved/dismissed feedback adjusts it.
* **Score:** cosine similarity + rule boosts: level fit, "natural next step" (prerequisite
  roadmaps mostly done), coverage (share of an item's concepts/nodes the student already studies),
  minus exclusions (already followed/enrolled, dismissed). MMR re-ranking for variety.
* **Explanations:** templated reasons ("Because you follow Data Analyst", "Covers 7 topics from
  your Deep Learning course"). No LLM call.
* **Freshness:** worker job `recommendations.refresh` runs on relevant events and writes
  `user_recommendations`; the API reads precomputed rows. Impressions/clicks/dismissals are
  logged for evaluation.
* **API:** `GET /api/recommendations?type=course|roadmap`, `POST /api/recommendations/{id}/feedback`,
  `GET /api/catalog/courses`, `POST /api/catalog/courses/{id}/enroll`.

## 9. API conventions

* JSON is camelCase out, camelCase or snake_case in.
* Errors: `{"error": {"code", "message", "requestId", "details"}}`, codes as in the frontend contract.
* Long work returns a resource with `status` (`queued|processing|ready|failed`) and `progress`.
* Every id in a path is checked for ownership; a foreign id answers 404, not 403.

## 10. Build order

| # | Step | Exit check |
|---|---|---|
| 0 | Foundation: settings, errors, DB + pgvector, jobs + worker, LLM/embedding layer, prompts, agent base, state machine, health, benchmark | `/api/health/ready` green, unit tests pass |
| 1 | Auth (cookie session), profile, study preferences | signup/login/refresh/profile/settings on the real API |
| 2 | Courses, documents, ingestion, retrieval, concept extraction | upload → `ready` → concepts listed |
| 3 | Course chat with SSE + citations | answers cite real pages |
| 4 | Study session: tutor, assessment, coach, learning policy, progress | full session updates concept status |
| 5 | Summaries and quizzes | generate, play, graded |
| 6 | Practice exams | refresh-safe, auto-submit, analysis |
| 7 | Roadmaps: curated seeds + 2-pass generation, node sessions, progress sync | node status follows evidence |
| 8 | Dashboard, daily activity, streaks | numbers match stored data |
| 9 | Catalog + recommendations | relevant, explained suggestions |
| 10 | Hardening: isolation tests, E2E, docs, demo script | clean install runs the demo |
