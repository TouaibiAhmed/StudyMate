"""Exam generation, grading and the expiry sweeper."""

import logging
import math

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents.assessment import Assessor
from app.ai.agents.base import LearnerContext
from app.ai.agents.study_tools import QuizWriter
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError, LLMOutputError, LLMUnavailableError
from app.db.base import utcnow
from app.jobs.registry import JobContext, RetryableJobError, job_handler, periodic
from app.modules.courses.models import Course
from app.modules.exams.models import ExamAnswer, ExamAttempt, ExamQuestion, PracticeExam
from app.modules.exams.service import GENERATE_JOB, GRADE_JOB, sweep_expired
from app.modules.profile.models import StudentProfile
from app.modules.study import learning
from app.modules.study.models import LearningEvidence
from app.modules.study.service import _consistent
from app.modules.study_tools.jobs import normalize_question
from app.modules.study_tools.material import material_groups, ready_document_ids, validated_topics
from app.rag.evidence import scrub_labels
from app.rag.retriever import load_evidence

log = logging.getLogger(__name__)
BATCH = 3
_TYPE = {"Multiple Choice": "multiple_choice", "Short Answer": "short_answer"}


def _retry_or_fail(ctx: JobContext, exc: LLMError) -> None:
    if exc.retryable and ctx.job.attempts < ctx.job.max_attempts:
        delay = 30 * ctx.job.attempts ** 2 if isinstance(exc, LLMUnavailableError) else None
        raise RetryableJobError(str(exc), delay_s=delay) from exc


async def _learner(db: AsyncSession, course: Course, user_id: str) -> LearnerContext:
    profile = await db.get(StudentProfile, user_id)
    return LearnerContext(domain=course.subject, domain_type=course.domain_type,
                          level=profile.level if profile and profile.level else course.level,
                          language=profile.preferred_language if profile else "English")


def _types_for(domain_type: str, count: int, start: int) -> list[str]:
    """Mix question types by domain: more written answers where reasoning matters (doc 12.2)."""
    pattern = (["Short Answer", "Multiple Choice", "Short Answer"] if domain_type in ("argumentative", "conceptual")
               else ["Multiple Choice", "Short Answer", "Multiple Choice"])
    return [pattern[(start + i) % len(pattern)] for i in range(count)]


@job_handler(GENERATE_JOB)
async def generate_exam(ctx: JobContext) -> dict:
    exam_id = ctx.payload["exam_id"]
    async with ctx.sessions() as db:
        exam = await db.get(PracticeExam, exam_id)
        if exam is None:
            return {"skipped": "deleted"}
        course = await db.get(Course, exam.course_id)
        docs = await ready_document_ids(db, course.id, [])
        topics = await validated_topics(db, course.id, exam.topic_ids or [])
        groups = await material_groups(db, docs, topics, math.ceil(exam.question_count / BATCH))
        learner = await _learner(db, course, exam.user_id)
        wanted, user_id, domain_type = exam.question_count, exam.user_id, course.domain_type
        await db.execute(delete(ExamQuestion).where(ExamQuestion.exam_id == exam_id))
        await db.commit()

    accepted, prompt_id, batch = [], None, 0
    max_batches = math.ceil(wanted / BATCH) + len(groups) + 2
    while len(accepted) < wanted and batch < max_batches:
        group = groups[batch % len(groups)]
        count = min(BATCH, wanted - len(accepted))
        async with ctx.sessions() as db:
            await db.execute(update(PracticeExam).where(PracticeExam.id == exam_id).values(
                stage=f"Writing questions {len(accepted) + 1}-{len(accepted) + count} of {wanted}",
                progress=len(accepted) / wanted, updated_at=utcnow()))
            await db.commit()
        try:
            run = await QuizWriter(get_llm()).run(
                learner, evidence=group.evidence, user_id=user_id, subject=f"exam:{exam_id}", count=count,
                types=_types_for(domain_type, count, len(accepted)), difficulty="Mixed", focus=group.focus,
                avoid=[a[0].prompt for a in accepted][-8:],
            )
        except LLMOutputError:
            batch += 1
            continue
        except LLMError as exc:
            _retry_or_fail(ctx, exc)
            async with ctx.sessions() as db:
                await db.execute(update(PracticeExam).where(PracticeExam.id == exam_id).values(
                    status="failed", stage=None, error="The AI model was unavailable. Create the exam again."))
                await db.commit()
            return {"failed": type(exc).__name__}
        prompt_id = run.prompt_id
        seen = {a[0].prompt.lower() for a in accepted}
        for draft in run.output.questions:
            clean = normalize_question(draft, set(_TYPE))  # exams: multiple choice + written answers
            if clean and clean.prompt.lower() not in seen and len(accepted) < wanted:
                accepted.append((clean, group, group.evidence.citations(clean.source_labels)))
                seen.add(clean.prompt.lower())
        batch += 1

    async with ctx.sessions() as db:
        exam = await db.get(PracticeExam, exam_id)
        if exam is None:
            return {"skipped": "deleted while generating"}
        if len(accepted) < max(2, wanted // 2):
            exam.status, exam.stage = "failed", None
            exam.error = "Not enough valid questions could be written from this material. Try other concepts."
            await db.commit()
            return {"failed": "too few questions", "accepted": len(accepted)}
        for position, (q, group, cited) in enumerate(accepted):
            rubric = {"required_ideas": q.required_ideas or [q.answer], "acceptable_alternatives": [],
                      "common_gaps": []} if q.type == "Short Answer" else {}
            db.add(ExamQuestion(exam_id=exam_id, position=position, concept_id=group.concept_id,
                                type=_TYPE[q.type], prompt=q.prompt.strip(), options=q.options or None,
                                answer=q.answer.strip(), rubric=rubric, explanation=q.explanation,
                                sources=[c.model_dump(by_alias=True) for c in cited],
                                source_chunk_ids=group.evidence.chunk_ids))
        exam.status, exam.progress, exam.stage, exam.prompt_version = "ready", 1.0, None, prompt_id
        exam.question_count = len(accepted)
        await db.commit()
    return {"questions": len(accepted), "requested": wanted}


def _norm(text: str) -> str:
    return " ".join(text.lower().split()).strip(" .!?;:")


@job_handler(GRADE_JOB)
async def grade_attempt(ctx: JobContext) -> dict:
    attempt_id = ctx.payload["attempt_id"]
    async with ctx.sessions() as db:
        a = await db.get(ExamAttempt, attempt_id)
        if a is None or a.status != "submitted":
            return {"skipped": "not submitted"}
        exam = await db.get(PracticeExam, a.exam_id)
        course = await db.get(Course, exam.course_id)
        learner = await _learner(db, course, a.user_id)
        questions = (await db.execute(
            select(ExamQuestion).where(ExamQuestion.exam_id == exam.id).order_by(ExamQuestion.position)
        )).scalars().all()
        a.grading_status, a.grading_progress = "grading", 0.0
        await db.commit()

    results: dict[str, dict] = {}
    for i, q in enumerate(questions):
        async with ctx.sessions() as db:
            row = (await db.execute(select(ExamAnswer).where(ExamAnswer.attempt_id == attempt_id,
                                                             ExamAnswer.question_id == q.id))).scalar_one_or_none()
            answer = row.answer.strip() if row else ""
            evidence = await load_evidence(db, q.source_chunk_ids or []) if q.type == "short_answer" else None
        if not answer:
            # Unanswered says nothing about understanding (it may be time): no learning evidence.
            results[q.id] = dict(verdict="insufficient_evidence", confidence="high", strengths=[],
                                 gaps=["Not answered"], misconception=None, method="empty")
        elif q.type == "multiple_choice":
            ok = _norm(answer) == _norm(q.answer)
            results[q.id] = dict(verdict="correct" if ok else "incorrect", confidence="high",
                                 strengths=["Chose the correct option"] if ok else [],
                                 gaps=[] if ok else [f"The correct option was: {q.answer}"], misconception=None,
                                 method="exact")
        else:
            try:
                run = await Assessor(get_llm()).run(
                    learner, evidence=evidence, user_id=a.user_id, subject=f"exam_attempt:{attempt_id}",
                    question=q.prompt, context=None, rubric=q.rubric, answer=answer,
                )
            except LLMError as exc:
                _retry_or_fail(ctx, exc)
                async with ctx.sessions() as db:
                    await db.execute(update(ExamAttempt).where(ExamAttempt.id == attempt_id)
                                     .values(grading_status="failed"))
                    await db.commit()
                return {"failed": type(exc).__name__}
            ev = _consistent(run.output, run.knowledge_mode.value == "general_knowledge", q.rubric)
            results[q.id] = dict(verdict=ev.verdict, confidence=ev.confidence, strengths=ev.strengths,
                                 gaps=ev.gaps, misconception=ev.misconception, method="model")
        async with ctx.sessions() as db:
            await db.execute(update(ExamAttempt).where(ExamAttempt.id == attempt_id)
                             .values(grading_progress=(i + 1) / len(questions)))
            await db.commit()

    async with ctx.sessions() as db:
        a = await db.get(ExamAttempt, attempt_id)
        existing = {r.question_id: r for r in (await db.execute(
            select(ExamAnswer).where(ExamAnswer.attempt_id == attempt_id))).scalars().all()}
        touched = set()
        for q in questions:
            r = results[q.id]
            row = existing.get(q.id) or ExamAnswer(attempt_id=attempt_id, question_id=q.id, answer="")
            row.verdict, row.confidence, row.method = r["verdict"], r["confidence"], r["method"]
            row.strengths = [scrub_labels(s) for s in r["strengths"]]
            row.gaps = [scrub_labels(g) for g in r["gaps"]]
            row.misconception = r["misconception"]
            db.add(row)
            if q.concept_id and r["method"] != "empty":
                db.add(LearningEvidence(
                    user_id=a.user_id, concept_id=q.concept_id, course_id=exam.course_id, evaluation_id=None,
                    verdict=r["verdict"], confidence=r["confidence"], difficulty="intermediate", hints_used=0,
                    conditions="exam", knowledge_mode="course_grounded"))
                touched.add(q.concept_id)
        await db.flush()
        for concept_id in touched:
            await learning.recompute(db, a.user_id, concept_id)
        value = {"correct": 1.0, "partially_correct": 0.5}
        a.score = round(100 * sum(value.get(results[q.id]["verdict"], 0.0) for q in questions) / len(questions), 1)
        a.grading_status, a.grading_progress = "graded", 1.0
        await db.commit()
    return {"graded": len(questions), "score": a.score}


@periodic("exams.sweep_expired", every_s=30)
async def sweep(db: AsyncSession) -> None:
    """Auto-submit attempts whose deadline passed while nobody was looking (doc 24.3)."""
    count = await sweep_expired(db)
    if count:
        log.info("Auto-submitted %d expired exam attempt(s)", count)
