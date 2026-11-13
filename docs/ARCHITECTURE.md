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

## 7. Study loop and learning policy (step 4)

**Flow.** `POST /api/sessions` picks a concept (the student's choice, or needs-practice first, then
concepts without evidence) and returns at once with status `preparing`; the worker writes the first
activity (tutor role: question, 2-3 graduated hints, explanation, hidden rubric, excerpt citations).
`POST /api/activities/{id}/attempts` grades the answer (assessment role, synchronous, ~1-2 min on
CPU), stores attempt + evaluation + evidence, recomputes the concept state and queues the next
activity, which is generated while the student reads the feedback. `POST /api/sessions/{id}/next`
serves it (`ready`), or says it is still `preparing`.

**Policy (`app/learning/policy.py`, no LLM):**
* Evidence weight = difficulty x confidence x hint penalty (-20% per hint, min 40%) x exam bonus (1.5)
  x general-knowledge penalty (0.8) x recency (14-day half-life).
* Status: `needs_practice` (weighted mean < 0.45), `good_evidence` (>= 0.8 and at least 2 correct
  answers without hints), `developing`, `not_enough_evidence` (no or only one answer). The UI bar
  shows a level per status (0/25/55/90), never a percentage of knowledge.
* Next activity: incorrect -> explain & check (easier); partial -> targeted practice on the gap;
  correct with hints -> review; correct without hints -> transfer (harder); unclear -> diagnostic.
  Routing uses the latest answer given without reading the full explanation.
* A retry after reading the explanation is stored but not counted as evidence.

**Grading safeguards (`study/service.py::_consistent`):** answers under 3 words are graded by rule
(no model call); "correct" with missing ideas becomes "partially correct"; every required idea
covered and no misconception means "correct"; rubric label echoes and acceptable alternatives are
removed from gaps; covered ideas become strengths when the model lists none; general-knowledge
grades are capped at medium confidence. These rules came from llama3.1:8b behaviour seen in testing.

**Measured on the dev laptop (CPU only):** first activity ~2.5-3 min, grading ~1.5 min, next activity
mostly ready by the time the student has read the feedback.

## 7b. Summaries and quizzes (step 5)

* Both are background jobs with visible progress ("Writing section 2 of 5", "Writing questions 4-6
  of 10"). Material is cut into small groups (one per selected concept, or N contiguous parts of the
  selected documents with up to 3 chunks each), so every model call reads ~1,000 tokens.
* Summary: one call per section (Short 3, Medium 5, Detailed 8); a malformed section is skipped,
  not fatal. Quiz: batches of 3 questions; every answer key is verified by code (a multiple-choice
  answer must match exactly one of 4 distinct options, true/false must be True/False) and invalid
  questions are replaced by extra batches. Answer keys never leave the server before submission.
* Grading: multiple choice / true-false by exact comparison; all written answers of an attempt in
  one model call. Quiz answers feed the learning profile at lower weight (written 0.7, choice 0.3)
  and never count as independent successes towards "good evidence".
* Internal excerpt ids ("E1") are scrubbed from every student-facing text (`scrub_labels`).
* Measured on the dev laptop (CPU only): 5-question quiz ~4 min, short summary ~2.5 min,
  grading a quiz with one written answer ~30 s.

## 7c. Timed practice exams (step 6)

* `POST /api/exams` returns at once (`preparing`); the worker writes the questions (multiple choice +
  written answers with rubrics, mix by domain type). The attempt and its timer start only with
  `POST /api/exams/{id}/start`, so model latency never consumes exam time (doc 14.2).
* The deadline is stored on the attempt and is authoritative. Answers are autosaved with `PUT` until
  the deadline (+5 s network grace) and refused after it; expired attempts are auto-submitted on
  access and by the worker's `exams.sweep_expired` task (every 30 s). Starting again during a running
  attempt resumes it with the same deadline (refresh / second tab).
* Integrity in code: while an attempt runs, chat messages and study sessions for that course are
  refused with 409 (`ensure_no_active_exam`).
* Grading runs after submission in the worker: multiple choice by exact match, written answers by the
  assessment role with the shared consistency rules; unanswered questions are "insufficient evidence"
  and create no learning evidence. Answered questions create `exam` evidence (weight 1.5).
* Analysis: per question (answer, expected ideas, strengths, gaps, confidence), per concept (correct /
  total, missed ideas, next action from the learning policy), verdict counts and a "practice signal"
  score that is never presented as a prediction.
* Grading rule added from real runs: gaps that share no key word with the rubric are dropped, and a
  partially-correct verdict with only off-rubric gaps becomes correct.
* Measured on the dev laptop (CPU only): 5 questions written in ~3.5 min, graded in ~2.5 min.

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
