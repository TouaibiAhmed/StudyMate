"""Practice exams: creation, timed attempts, autosave, submission and analysis (doc 14).

Exam rules live here, in code, never in prompts (doc 9.2, 14.2):
  * the server's deadline is authoritative; the client timer is only a display;
  * answers can be saved until the deadline (plus a small network grace), never after;
  * an expired attempt is submitted automatically (on access and by a periodic sweeper);
  * while an attempt is in progress, tutor/chat/study activity for that course is refused.
"""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.db.base import utcnow
from app.jobs.queue import enqueue
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import get_owned_course
from app.modules.exams.models import ExamAnswer, ExamAttempt, ExamQuestion, PracticeExam
from app.modules.exams.schemas import (
    AnalysisOut,
    AnswerIn,
    AttemptOut,
    AttemptSummaryExam,
    AttemptSummaryOut,
    ConceptResultOut,
    Counts,
    CourseOptionOut,
    ExamCreate,
    ExamOut,
    ExamQuestionOut,
    QuestionResultOut,
    TopicOut,
)
from app.modules.study import learning
from app.modules.study_tools.material import ready_document_ids, validated_topics

GENERATE_JOB = "exams.generate"
GRADE_JOB = "exams.grade"
SAVE_GRACE = timedelta(seconds=5)  # network latency at the very end of the exam


class ExamInProgressError(ConflictError):
    message = "Finish or submit your practice exam for this course first: hints, tutor and chat are off during an exam."


class TimeUpError(ConflictError):
    message = "Time is up: this exam has been submitted."


# --- integrity guard (used by chat and study sessions) ----------------------------------------------

async def ensure_no_active_exam(db: AsyncSession, user_id: str, course_id: str | None) -> None:
    if not course_id:
        return
    active = (await db.execute(
        select(ExamAttempt).where(ExamAttempt.user_id == user_id, ExamAttempt.course_id == course_id,
                                  ExamAttempt.status == "in_progress")
    )).scalars().all()
    for attempt in active:
        if not await expire_if_due(db, attempt):
            raise ExamInProgressError()


# --- exams -------------------------------------------------------------------------------------------

async def _owned_exam(db: AsyncSession, user_id: str, exam_id: str) -> PracticeExam:
    exam = (await db.execute(
        select(PracticeExam).where(PracticeExam.id == exam_id, PracticeExam.user_id == user_id)
    )).scalar_one_or_none()
    if exam is None:
        raise NotFoundError("Practice exam not found.")
    return exam


async def exam_out(db: AsyncSession, exam: PracticeExam) -> ExamOut:
    questions = (await db.execute(
        select(ExamQuestion).where(ExamQuestion.exam_id == exam.id).order_by(ExamQuestion.position)
    )).scalars().all() if exam.status == "ready" else []
    names = dict((await db.execute(
        select(Concept.id, Concept.name).where(Concept.id.in_([q.concept_id for q in questions if q.concept_id]))
    )).all()) if questions else {}
    return ExamOut(id=exam.id, course_id=exam.course_id, title=exam.title,
                   question_count=len(questions) or exam.question_count, time_limit_seconds=exam.time_limit_s,
                   topic_ids=exam.topic_ids or [], status=exam.status, progress=exam.progress, stage=exam.stage,
                   error=exam.error, created_at=exam.created_at,
                   questions=[ExamQuestionOut(id=q.id, exam_id=exam.id, concept_id=q.concept_id,
                                              concept=names.get(q.concept_id), prompt=q.prompt, type=q.type,
                                              options=q.options) for q in questions])


async def course_options(db: AsyncSession, user_id: str) -> list[CourseOptionOut]:
    rows = (await db.execute(
        select(Course, Concept).join(Concept, Concept.course_id == Course.id)
        .where(Course.user_id == user_id).order_by(Course.title, Concept.position)
    )).all()
    grouped: dict[str, CourseOptionOut] = {}
    for course, concept in rows:
        grouped.setdefault(course.id, CourseOptionOut(id=course.id, title=course.title, concepts=[]))
        grouped[course.id].concepts.append(TopicOut(id=concept.id, title=concept.name))
    return list(grouped.values())


async def create_exam(db: AsyncSession, user_id: str, data: ExamCreate) -> ExamOut:
    s = get_settings()
    if data.question_count > s.exam_max_questions:
        raise ConflictError(f"A practice exam can have at most {s.exam_max_questions} questions.")
    if data.time_limit_seconds > s.exam_max_minutes * 60:
        raise ConflictError(f"A practice exam can last at most {s.exam_max_minutes} minutes.")
    course = await get_owned_course(db, user_id, data.course_id)
    await ready_document_ids(db, course.id, [])  # needs indexed material
    topics = await validated_topics(db, course.id, data.topic_ids)
    names = ", ".join(t.name for t in topics[:2]) + (f" +{len(topics) - 2}" if len(topics) > 2 else "")
    exam = PracticeExam(user_id=user_id, course_id=course.id, title=f"Practice exam: {names}"[:160],
                        topic_ids=[t.id for t in topics], question_count=data.question_count,
                        time_limit_s=data.time_limit_seconds, status="preparing", progress=0.0,
                        stage="Waiting to start")
    db.add(exam)
    await db.flush()
    # Priority 5: the student is waiting at the setup screen.
    await enqueue(db, GENERATE_JOB, {"exam_id": exam.id}, user_id=user_id, subject=f"exam:{exam.id}", priority=5)
    await db.commit()
    await db.refresh(exam)
    return await exam_out(db, exam)


async def get_exam(db: AsyncSession, user_id: str, exam_id: str) -> ExamOut:
    return await exam_out(db, await _owned_exam(db, user_id, exam_id))


# --- attempts ----------------------------------------------------------------------------------------

def attempt_out(a: ExamAttempt) -> AttemptOut:
    return AttemptOut(id=a.id, exam_id=a.exam_id, user_id=a.user_id, status=a.status, started_at=a.started_at,
                      deadline_at=a.deadline_at, submitted_at=a.submitted_at, auto_submitted=a.auto_submitted,
                      grading_status=a.grading_status)


async def _owned_attempt(db: AsyncSession, user_id: str, attempt_id: str) -> ExamAttempt:
    a = (await db.execute(
        select(ExamAttempt).where(ExamAttempt.id == attempt_id, ExamAttempt.user_id == user_id)
    )).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Exam attempt not found.")
    return a


async def _submit(db: AsyncSession, a: ExamAttempt, *, auto: bool) -> None:
    now = utcnow()
    a.status = "submitted"
    a.auto_submitted = auto
    a.submitted_at = min(now, a.deadline_at) if auto else now
    a.grading_status = "pending"
    await enqueue(db, GRADE_JOB, {"attempt_id": a.id}, user_id=a.user_id, subject=f"exam_attempt:{a.id}",
                  priority=5)


async def expire_if_due(db: AsyncSession, a: ExamAttempt) -> bool:
    """Auto-submit an attempt whose deadline has passed. Returns True if it is (now) submitted."""
    if a.status != "in_progress":
        return True
    if utcnow() > a.deadline_at + SAVE_GRACE:
        await _submit(db, a, auto=True)
        await db.commit()
        return True
    return False


async def start_attempt(db: AsyncSession, user_id: str, exam_id: str) -> AttemptOut:
    exam = await _owned_exam(db, user_id, exam_id)
    if exam.status != "ready":
        raise ConflictError("This exam is still being prepared." if exam.status == "preparing"
                            else "This exam could not be prepared.")
    running = (await db.execute(
        select(ExamAttempt).where(ExamAttempt.exam_id == exam.id, ExamAttempt.status == "in_progress")
    )).scalars().first()
    if running is not None and not await expire_if_due(db, running):
        return attempt_out(running)  # resume (refresh, second tab): same deadline
    now = utcnow()
    a = ExamAttempt(exam_id=exam.id, user_id=user_id, course_id=exam.course_id, status="in_progress",
                    started_at=now, deadline_at=now + timedelta(seconds=exam.time_limit_s))
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return attempt_out(a)


async def get_attempt(db: AsyncSession, user_id: str, attempt_id: str) -> AttemptOut:
    a = await _owned_attempt(db, user_id, attempt_id)
    await expire_if_due(db, a)
    return attempt_out(a)


async def save_answer(db: AsyncSession, user_id: str, attempt_id: str, question_id: str, data: AnswerIn) -> None:
    a = await _owned_attempt(db, user_id, attempt_id)
    if await expire_if_due(db, a):
        raise TimeUpError() if a.auto_submitted else ConflictError("This exam was already submitted.")
    question = await db.get(ExamQuestion, question_id)
    if question is None or question.exam_id != a.exam_id:
        raise NotFoundError("Question not found in this exam.")
    row = (await db.execute(
        select(ExamAnswer).where(ExamAnswer.attempt_id == a.id, ExamAnswer.question_id == question_id)
    )).scalar_one_or_none()
    if row is None:
        db.add(ExamAnswer(attempt_id=a.id, question_id=question_id, answer=data.answer, flagged=data.flagged))
    else:
        row.answer, row.flagged = data.answer, data.flagged
    await db.commit()


async def submit(db: AsyncSession, user_id: str, attempt_id: str) -> AttemptOut:
    a = await _owned_attempt(db, user_id, attempt_id)
    if await expire_if_due(db, a):
        raise ConflictError("This exam was already submitted.")
    await _submit(db, a, auto=False)
    await db.commit()
    await db.refresh(a)
    return attempt_out(a)


async def sweep_expired(db: AsyncSession) -> int:
    rows = (await db.execute(
        select(ExamAttempt).where(ExamAttempt.status == "in_progress",
                                  ExamAttempt.deadline_at < utcnow() - SAVE_GRACE)
    )).scalars().all()
    for a in rows:
        await _submit(db, a, auto=True)
    if rows:
        await db.commit()
    return len(rows)


# --- history and analysis ----------------------------------------------------------------------------

def score_label(score: float | None) -> str | None:
    # A rubric aid, never a prediction of a real exam result (doc 14.3).
    return None if score is None else f"Practice signal: {round(score)}%"


async def list_attempts(db: AsyncSession, user_id: str) -> list[AttemptSummaryOut]:
    rows = (await db.execute(
        select(ExamAttempt, PracticeExam, Course.title)
        .join(PracticeExam, PracticeExam.id == ExamAttempt.exam_id)
        .join(Course, Course.id == PracticeExam.course_id)
        .where(ExamAttempt.user_id == user_id).order_by(ExamAttempt.started_at.desc())
    )).all()
    out = []
    for a, exam, course_title in rows:
        await expire_if_due(db, a)
        count = (await db.execute(
            select(func.count(ExamQuestion.id)).where(ExamQuestion.exam_id == exam.id)
        )).scalar_one()
        used = int((a.submitted_at - a.started_at).total_seconds()) if a.submitted_at else None
        out.append(AttemptSummaryOut(
            **attempt_out(a).model_dump(), time_used_seconds=used, score=a.score, score_label=score_label(a.score),
            exam=AttemptSummaryExam(title=exam.title, course=course_title, course_id=exam.course_id,
                                    question_count=count),
        ))
    return out


async def analysis(db: AsyncSession, user_id: str, attempt_id: str) -> AnalysisOut:
    a = await _owned_attempt(db, user_id, attempt_id)
    await expire_if_due(db, a)
    exam = await db.get(PracticeExam, a.exam_id)
    course = await db.get(Course, exam.course_id)
    questions = (await db.execute(
        select(ExamQuestion).where(ExamQuestion.exam_id == exam.id).order_by(ExamQuestion.position)
    )).scalars().all()
    answers = {r.question_id: r for r in (await db.execute(
        select(ExamAnswer).where(ExamAnswer.attempt_id == a.id)
    )).scalars().all()}
    used = int(((a.submitted_at or utcnow()) - a.started_at).total_seconds())
    status = {"graded": "graded", "failed": "failed"}.get(a.grading_status, "grading")
    if a.status == "in_progress":
        raise ConflictError("Submit the exam to see its analysis.")
    base = dict(status=status, progress=a.grading_progress, attempt_id=a.id, exam_id=exam.id, title=exam.title,
                course=course.title, course_id=course.id, total_questions=len(questions), time_used_seconds=used,
                auto_submitted=a.auto_submitted, score=a.score, score_label=score_label(a.score),
                completed_questions=sum(1 for q in questions if (answers.get(q.id) and answers[q.id].answer.strip())))
    if status != "graded":
        return AnalysisOut(**base, counts=Counts(), question_results=[], concepts=[])

    concepts = {c.id: c for c in (await db.execute(
        select(Concept).where(Concept.id.in_([q.concept_id for q in questions if q.concept_id]))
    )).scalars().all()}
    counts = Counts()
    results, per_concept = [], defaultdict(list)
    for q in questions:
        ans = answers.get(q.id)
        verdict = (ans.verdict if ans and ans.verdict else "insufficient_evidence")
        setattr(counts, verdict, getattr(counts, verdict) + 1)
        expected = [q.answer] if q.type == "multiple_choice" else (q.rubric or {}).get("required_ideas") or [q.answer]
        concept = concepts.get(q.concept_id)
        results.append(QuestionResultOut(
            question_id=q.id, prompt=q.prompt, type=q.type, concept=concept.name if concept else None,
            options=q.options, answer=ans.answer if ans else "", verdict=verdict, expected_ideas=expected,
            strengths=ans.strengths if ans else [], gaps=(ans.gaps if ans else []) or [],
            confidence=(ans.confidence if ans and ans.confidence else "low")))
        per_concept[concept.id if concept else "_other"].append((verdict, ans.gaps if ans else []))

    concept_results = []
    for cid, items in per_concept.items():
        concept = concepts.get(cid)
        correct = sum(1 for v, _ in items if v == "correct")
        missed = [g for v, gaps in items if v != "correct" for g in gaps][:2]
        summary = f"{correct} of {len(items)} correct." + (f" Missed: {'; '.join(missed)}." if missed else "")
        action = ((await learning.current_state(db, user_id, cid)).recommended_action if concept
                  else "Review the questions you missed.")
        concept_results.append(ConceptResultOut(concept=concept.name if concept else "Other questions",
                                                correct=correct, total=len(items), summary=summary,
                                                next_action=action))
    return AnalysisOut(**base, counts=counts, question_results=results, concepts=concept_results)
