"""Summaries and quizzes: requests, listing, attempts and grading.

Generation runs in the worker (`jobs.py`). Multiple-choice and true/false answers are graded by
exact comparison; all short answers of an attempt are graded together in one model call.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents.base import LearnerContext
from app.ai.agents.study_tools import QuizGrader
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError
from app.core.errors import ConflictError, NotFoundError, ServiceUnavailableError
from app.core.schemas import SourceReference
from app.db.base import utcnow
from app.jobs.queue import enqueue
from app.modules.auth.models import User
from app.modules.courses.models import Course
from app.modules.courses.service import get_owned_course
from app.modules.profile.models import StudentProfile
from app.modules.study import learning
from app.modules.study.models import LearningEvidence
from app.modules.study_tools.material import ready_document_ids, validated_topics
from app.modules.study_tools.models import Quiz, QuizAnswer, QuizAttempt, QuizQuestion, Summary
from app.modules.study_tools.schemas import (
    ArtifactOut,
    AttemptOut,
    GradedAnswerOut,
    QuizCreate,
    QuizOut,
    QuizQuestionOut,
    QuizResultOut,
    SectionOut,
    SubmitIn,
    SummaryCreate,
    SummaryOut,
)

SUMMARY_JOB = "study_tools.generate_summary"
QUIZ_JOB = "study_tools.generate_quiz"
CHOICE_TYPES = {"Multiple Choice", "True/False"}
_DIFFICULTY = {"Easy": "introductory", "Medium": "intermediate", "Hard": "advanced", "Mixed": "intermediate"}


def _common(obj) -> dict:
    return dict(id=obj.id, course_id=obj.course_id, title=obj.title, status=obj.status, progress=obj.progress,
                stage=obj.stage, error=obj.error, language=obj.language, topic_ids=obj.topic_ids or [],
                source_document_ids=obj.source_document_ids or [],
                sources=[SourceReference.model_validate(s) for s in obj.sources or []],
                knowledge_mode=obj.knowledge_mode, created_at=obj.created_at, updated_at=obj.updated_at)


def summary_out(s: Summary) -> SummaryOut:
    return SummaryOut(**_common(s), length=s.length, structure=s.structure,
                      sections=[SectionOut.model_validate(x) for x in s.sections or []])


async def quiz_out(db: AsyncSession, q: Quiz) -> QuizOut:
    questions = (await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == q.id).order_by(QuizQuestion.position)
    )).scalars().all() if q.status == "ready" else []
    return QuizOut(**_common(q), question_count=len(questions) or q.question_count, difficulty=q.difficulty,
                   question_types=q.question_types or [],
                   questions=[QuizQuestionOut(id=x.id, quiz_id=q.id, prompt=x.prompt, type=x.type, options=x.options,
                                              topic_id=x.concept_id) for x in questions])


async def _owned(db: AsyncSession, model, user_id: str, obj_id: str, label: str):
    obj = (await db.execute(select(model).where(model.id == obj_id, model.user_id == user_id))).scalar_one_or_none()
    if obj is None:
        raise NotFoundError(f"{label} not found.")
    return obj


def _title(kind: str, course: Course, topics) -> str:
    if topics:
        names = ", ".join(t.name for t in topics[:2]) + (f" +{len(topics) - 2}" if len(topics) > 2 else "")
        return f"{kind}: {names}"[:160]
    return f"{kind}: {course.title}"[:160]


# --- summaries -------------------------------------------------------------------------------------

async def create_summary(db: AsyncSession, user: User, course_id: str, data: SummaryCreate) -> SummaryOut:
    course = await get_owned_course(db, user.id, course_id)
    docs = await ready_document_ids(db, course.id, data.source_document_ids)
    topics = await validated_topics(db, course.id, data.topic_ids)
    s = Summary(user_id=user.id, course_id=course.id, title=_title(f"{data.structure} summary", course, topics),
                status="queued", progress=0.0, stage="Waiting to start", language=data.language,
                topic_ids=[t.id for t in topics], source_document_ids=docs, sources=[], length=data.length,
                structure=data.structure, sections=[])
    db.add(s)
    await db.flush()
    await enqueue(db, SUMMARY_JOB, {"summary_id": s.id}, user_id=user.id, subject=f"summary:{s.id}", priority=10)
    await db.commit()
    await db.refresh(s)
    return summary_out(s)


async def list_summaries(db: AsyncSession, user_id: str, course_id: str) -> list[SummaryOut]:
    await get_owned_course(db, user_id, course_id)
    rows = (await db.execute(
        select(Summary).where(Summary.course_id == course_id, Summary.user_id == user_id)
        .order_by(Summary.created_at.desc())
    )).scalars().all()
    return [summary_out(s) for s in rows]


async def get_summary(db: AsyncSession, user_id: str, summary_id: str) -> SummaryOut:
    return summary_out(await _owned(db, Summary, user_id, summary_id, "Summary"))


async def rename_summary(db: AsyncSession, user_id: str, summary_id: str, title: str) -> SummaryOut:
    s = await _owned(db, Summary, user_id, summary_id, "Summary")
    s.title = title.strip()
    await db.commit()
    await db.refresh(s)
    return summary_out(s)


async def delete_summary(db: AsyncSession, user_id: str, summary_id: str) -> None:
    await db.delete(await _owned(db, Summary, user_id, summary_id, "Summary"))
    await db.commit()


# --- quizzes ---------------------------------------------------------------------------------------

async def create_quiz(db: AsyncSession, user: User, course_id: str, data: QuizCreate) -> QuizOut:
    course = await get_owned_course(db, user.id, course_id)
    docs = await ready_document_ids(db, course.id, data.source_document_ids)
    topics = await validated_topics(db, course.id, data.topic_ids)
    q = Quiz(user_id=user.id, course_id=course.id, title=_title("Quiz", course, topics), status="queued",
             progress=0.0, stage="Waiting to start", language=data.language, topic_ids=[t.id for t in topics],
             source_document_ids=docs, sources=[], question_count=data.question_count, difficulty=data.difficulty,
             question_types=list(data.question_types))
    db.add(q)
    await db.flush()
    await enqueue(db, QUIZ_JOB, {"quiz_id": q.id}, user_id=user.id, subject=f"quiz:{q.id}", priority=10)
    await db.commit()
    await db.refresh(q)
    return await quiz_out(db, q)


async def list_quizzes(db: AsyncSession, user_id: str, course_id: str) -> list[QuizOut]:
    await get_owned_course(db, user_id, course_id)
    rows = (await db.execute(
        select(Quiz).where(Quiz.course_id == course_id, Quiz.user_id == user_id).order_by(Quiz.created_at.desc())
    )).scalars().all()
    return [await quiz_out(db, q) for q in rows]


async def get_quiz(db: AsyncSession, user_id: str, quiz_id: str) -> QuizOut:
    return await quiz_out(db, await _owned(db, Quiz, user_id, quiz_id, "Quiz"))


async def rename_quiz(db: AsyncSession, user_id: str, quiz_id: str, title: str) -> QuizOut:
    q = await _owned(db, Quiz, user_id, quiz_id, "Quiz")
    q.title = title.strip()
    await db.commit()
    await db.refresh(q)
    return await quiz_out(db, q)


async def delete_quiz(db: AsyncSession, user_id: str, quiz_id: str) -> None:
    await db.delete(await _owned(db, Quiz, user_id, quiz_id, "Quiz"))
    await db.commit()


async def list_artifacts(db: AsyncSession, user_id: str, course_id: str) -> list[ArtifactOut]:
    summaries = await list_summaries(db, user_id, course_id)
    quizzes = await list_quizzes(db, user_id, course_id)
    items = [ArtifactOut(id=s.id, course_id=s.course_id, kind="summary", title=s.title, status=s.status,
                         created_at=s.created_at, source_document_ids=s.source_document_ids,
                         description=f"{s.length} · {s.language} · {s.structure}") for s in summaries]
    items += [ArtifactOut(id=q.id, course_id=q.course_id, kind="quiz", title=q.title, status=q.status,
                          created_at=q.created_at, source_document_ids=q.source_document_ids,
                          description=f"{q.question_count} questions · {q.difficulty} · {q.language}") for q in quizzes]
    return sorted(items, key=lambda a: a.created_at, reverse=True)


# --- attempts --------------------------------------------------------------------------------------

async def start_attempt(db: AsyncSession, user_id: str, quiz_id: str) -> AttemptOut:
    q = await _owned(db, Quiz, user_id, quiz_id, "Quiz")
    if q.status != "ready":
        raise ConflictError("This quiz is not ready yet.")
    a = QuizAttempt(quiz_id=q.id, user_id=user_id, status="in_progress", started_at=utcnow())
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return AttemptOut(id=a.id, quiz_id=q.id, status=a.status, started_at=a.started_at, submitted_at=None)


def _norm(answer: str) -> str:
    return " ".join(answer.strip().lower().split()).rstrip(".")


async def submit_attempt(db: AsyncSession, user: User, attempt_id: str, data: SubmitIn) -> QuizResultOut:
    attempt = await _owned(db, QuizAttempt, user.id, attempt_id, "Quiz attempt")
    if attempt.status == "submitted":
        raise ConflictError("This quiz attempt was already submitted.")
    quiz = await db.get(Quiz, attempt.quiz_id)
    questions = (await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.position)
    )).scalars().all()
    given = {a.question_id: a.answer.strip() for a in data.answers}

    graded: dict[str, tuple[bool, str, str | None]] = {}  # question id -> (correct, method, feedback)
    short_items = []
    for q in questions:
        answer = given.get(q.id, "")
        if not answer:
            graded[q.id] = (False, "empty", None)
        elif q.type in CHOICE_TYPES:
            graded[q.id] = (_norm(answer) == _norm(q.answer), "exact", None)
        else:
            short_items.append(q)

    if short_items:
        course = await db.get(Course, quiz.course_id)
        profile = await db.get(StudentProfile, user.id)
        learner = LearnerContext(domain=course.subject, domain_type=course.domain_type,
                                 level=profile.level if profile and profile.level else course.level,
                                 language=quiz.language)
        try:
            run = await QuizGrader(get_llm()).run(
                learner, user_id=user.id, subject=f"quiz:{quiz.id}",
                items=[{"question": q.prompt, "required_ideas": q.required_ideas or [q.answer],
                        "model_answer": q.answer, "answer": given[q.id]} for q in short_items],
            )
        except LLMError as exc:
            raise ServiceUnavailableError("Your written answers could not be graded right now (the AI model is "
                                          "unavailable). Nothing was saved; try submitting again.") from exc
        by_number = {r.number: r for r in run.output.results}
        for i, q in enumerate(short_items, start=1):
            r = by_number.get(i)
            graded[q.id] = (r.correct, "model", r.feedback or None) if r else (False, "model", "Could not be graded.")

    correct = sum(1 for ok, _, _ in graded.values() if ok)
    unanswered = sum(1 for _, method, _ in graded.values() if method == "empty")
    attempt.status, attempt.submitted_at = "submitted", utcnow()
    attempt.correct_count, attempt.unanswered_count = correct, unanswered
    attempt.incorrect_count = len(questions) - correct - unanswered
    attempt.score = round(100 * correct / len(questions), 1) if questions else 0.0

    touched: set[str] = set()
    for q in questions:
        ok, method, feedback = graded[q.id]
        db.add(QuizAnswer(attempt_id=attempt.id, question_id=q.id, answer=given.get(q.id, ""), is_correct=ok,
                          method=method, feedback=feedback))
        if q.concept_id and method != "empty":
            # Quiz answers are weaker evidence than study-session answers (see learning.policy).
            db.add(LearningEvidence(
                user_id=user.id, concept_id=q.concept_id, course_id=quiz.course_id, evaluation_id=None,
                verdict="correct" if ok else "incorrect", confidence="high" if method == "exact" else "medium",
                difficulty=_DIFFICULTY.get(quiz.difficulty, "intermediate"), hints_used=0,
                conditions="quiz_choice" if q.type in CHOICE_TYPES else "quiz_short",
                knowledge_mode=quiz.knowledge_mode))
            touched.add(q.concept_id)
    await db.flush()
    for concept_id in touched:
        await learning.recompute(db, user.id, concept_id)
    await db.commit()

    return QuizResultOut(
        attempt_id=attempt.id, quiz_id=quiz.id, score=attempt.score, correct_count=correct,
        incorrect_count=attempt.incorrect_count, unanswered_count=unanswered, created_at=attempt.submitted_at,
        answers=[GradedAnswerOut(question_id=q.id, answer=given.get(q.id, ""), correct_answer=q.answer,
                                 explanation=q.explanation or None, feedback=graded[q.id][2],
                                 is_correct=graded[q.id][0]) for q in questions],
    )
