"""Conversations, messages and the preparation/completion of an answer turn.

A turn is split in two so the HTTP layer can stream:
  prepare_turn()  - validate, rate-limit, store the student's message, retrieve evidence, build the prompt
  complete_turn() - store the assistant's answer (with cleaned citations) once generation ends
"""

import re
import time
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai.agents.base import LearnerContext
from app.ai.agents.chat import ChatTopic, HistoryTurn, build_messages, finalize_answer
from app.ai.embeddings import get_embedder
from app.ai.llm.types import ChatMessage
from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError, RateLimitedError
from app.db.base import utcnow
from app.modules.auth.models import User
from app.modules.auth.security import SlidingWindowLimiter
from app.modules.chat.models import Conversation, Message
from app.modules.chat.schemas import (
    ContextIn,
    ContextOut,
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationPatch,
    MessageOut,
)
from app.modules.courses.models import Concept, Course
from app.modules.courses.service import get_owned_course
from app.modules.profile.models import StudentProfile
from app.rag.evidence import EvidenceSet
from app.rag.interfaces import RetrievalParams, RetrievalScope
from app.rag.retriever import PgVectorRetriever

DEFAULT_TITLE = "New conversation"
_message_limiter = SlidingWindowLimiter(max_events=20, window_s=600)
# user id -> start time of an answer in progress (one at a time per student). Entries older than
# _GENERATION_TTL_S are ignored, so a lost stream can never block a student for long.
_generating: dict[str, float] = {}
_GENERATION_TTL_S = 600


class InvalidContextError(AppError):
    status_code, code = 422, "validation_error"


# --- conversations -------------------------------------------------------------------------------

async def _owned_conversation(db: AsyncSession, user_id: str, conversation_id: str) -> Conversation:
    conv = (await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )).scalar_one_or_none()
    if conv is None:
        raise NotFoundError("Conversation not found.")
    return conv


async def _validated_context(db: AsyncSession, user_id: str, ctx: ContextIn) -> tuple[str, str | None, str | None]:
    if ctx.type == "general":
        return "general", None, None
    course_id = ctx.course_id or None
    topic_id = ctx.topic_id or None
    if course_id:
        await get_owned_course(db, user_id, course_id)
    if topic_id:
        if not course_id:
            raise InvalidContextError("Choose a course before choosing a topic.")
        concept = await db.get(Concept, topic_id)
        if concept is None or concept.course_id != course_id:
            raise InvalidContextError("This topic does not belong to the selected course.")
    # A course/topic context may be saved before the student picks the course (UI flow);
    # until then answers use general knowledge.
    return ctx.type, course_id, topic_id if ctx.type == "topic" else None


async def _context_out(db: AsyncSession, conv: Conversation) -> ContextOut:
    course = await db.get(Course, conv.course_id) if conv.course_id else None
    topic = await db.get(Concept, conv.topic_id) if conv.topic_id else None
    return ContextOut(type=conv.context_type, course_id=conv.course_id, topic_id=conv.topic_id,  # type: ignore[arg-type]
                      course_title=course.title if course else None, topic_title=topic.name if topic else None)


def message_out(m: Message) -> MessageOut:
    return MessageOut(id=m.id, conversation_id=m.conversation_id, role=m.role, content=m.content,
                      sources=m.sources or [], knowledge_mode=m.knowledge_mode, status=m.status,
                      created_at=m.created_at)


async def _conversation_out(db: AsyncSession, conv: Conversation, count: int | None = None) -> ConversationOut:
    if count is None:
        count = (await db.execute(
            select(func.count(Message.id)).where(Message.conversation_id == conv.id)
        )).scalar_one()
    return ConversationOut(id=conv.id, user_id=conv.user_id, title=conv.title, context=await _context_out(db, conv),
                           message_count=count, created_at=conv.created_at, updated_at=conv.updated_at)


async def list_conversations(db: AsyncSession, user_id: str) -> list[ConversationOut]:
    rows = (await db.execute(
        select(Conversation, func.count(Message.id))
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
    )).all()
    return [await _conversation_out(db, conv, count) for conv, count in rows]


async def get_conversation(db: AsyncSession, user_id: str, conversation_id: str) -> ConversationDetail:
    conv = await _owned_conversation(db, user_id, conversation_id)
    messages = (await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
    )).scalars().all()
    base = await _conversation_out(db, conv, len(messages))
    return ConversationDetail(**base.model_dump(), messages=[message_out(m) for m in messages])


async def create_conversation(db: AsyncSession, user_id: str, data: ConversationCreate) -> ConversationOut:
    ctx_type, course_id, topic_id = await _validated_context(db, user_id, data.context)
    conv = Conversation(user_id=user_id, title=(data.title or "").strip() or DEFAULT_TITLE,
                        context_type=ctx_type, course_id=course_id, topic_id=topic_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return await _conversation_out(db, conv, 0)


async def update_conversation(db: AsyncSession, user_id: str, conversation_id: str,
                              data: ConversationPatch) -> ConversationOut:
    conv = await _owned_conversation(db, user_id, conversation_id)
    if data.title is not None:
        conv.title = data.title.strip() or DEFAULT_TITLE
    if data.context is not None:
        conv.context_type, conv.course_id, conv.topic_id = await _validated_context(db, user_id, data.context)
    await db.commit()
    await db.refresh(conv)
    return await _conversation_out(db, conv)


async def delete_conversation(db: AsyncSession, user_id: str, conversation_id: str) -> None:
    conv = await _owned_conversation(db, user_id, conversation_id)
    await db.delete(conv)
    await db.commit()


# --- answer turns ----------------------------------------------------------------------------------

@dataclass
class TurnPlan:
    user_id: str
    conversation_id: str
    user_message: MessageOut
    messages: list[ChatMessage]
    prompt_id: str
    evidence: EvidenceSet


_FOLLOW_UP_WORDS = {"it", "this", "that", "these", "those", "they", "them", "why", "how", "example", "examples",
                    "more", "again", "explain", "elaborate", "simpler", "simply", "else", "detail", "details"}


def looks_like_follow_up(content: str) -> bool:
    """'why?', 'give an example', 'explain that more simply' depend on the previous question;
    'Who painted the Mona Lisa?' does not."""
    words = re.findall(r"[a-z']+", content.lower())
    return 0 < len(words) <= 8 and any(w in _FOLLOW_UP_WORDS for w in words)


def retrieval_queries(content: str, history: list[HistoryTurn]) -> list[str]:
    """Queries to try in order: the message alone, then (for follow-ups) with the previous question."""
    queries = [content]
    previous = next((h.content for h in reversed(history) if h.role == "user"), None)
    if previous and looks_like_follow_up(content):
        queries.append(f"{previous} {content}")
    return queries


async def prepare_turn(db: AsyncSession, user: User, conversation_id: str, content: str) -> TurnPlan:
    conv = await _owned_conversation(db, user.id, conversation_id)
    from app.modules.exams.service import ensure_no_active_exam  # local: exams depend on courses/study

    await ensure_no_active_exam(db, user.id, conv.course_id)
    started = _generating.get(user.id)
    if started is not None and time.monotonic() - started < _GENERATION_TTL_S:
        raise ConflictError("StudyMate is still answering your previous message.")
    if not _message_limiter.hit(user.id):
        raise RateLimitedError("Too many messages. Please wait 60 seconds before sending again.")

    history_rows = (await db.execute(
        select(Message.role, Message.content).where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc()).limit(12)
    )).all()
    history = [HistoryTurn(role, text) for role, text in reversed(history_rows)]

    course = await db.get(Course, conv.course_id) if conv.course_id else None
    topic = await db.get(Concept, conv.topic_id) if conv.topic_id else None
    profile = await db.get(StudentProfile, user.id)

    evidence = EvidenceSet()
    if course is not None:
        s = get_settings()
        retriever = PgVectorRetriever(db, get_embedder())
        scope = RetrievalScope(user_id=user.id, course_id=course.id, concept_hint=topic.name if topic else None)
        params = RetrievalParams(top_k=s.retrieval_top_k, candidate_k=s.retrieval_candidate_k,
                                 min_score=s.retrieval_min_score)
        for query in retrieval_queries(content, history):
            evidence = await retriever.retrieve(query, scope, params)
            if evidence.items:
                break
    learner = LearnerContext(
        domain=course.subject if course else (profile.field_of_study if profile else "General studies"),
        domain_type=course.domain_type if course else (profile.domain_type if profile else "conceptual"),
        level=profile.level if profile and profile.level else (course.level if course else "Undergraduate"),
        language=profile.preferred_language if profile else "English",
    )
    messages, prompt_id = build_messages(
        learner, evidence, ChatTopic(course.title if course else None, topic.name if topic else None),
        history, content,
    )

    msg = Message(conversation_id=conv.id, role="user", content=content, sources=[], status="complete")
    db.add(msg)
    if conv.title == DEFAULT_TITLE:
        conv.title = content if len(content) <= 60 else content[:57].rstrip() + "…"
    conv.updated_at = utcnow()
    await db.commit()
    await db.refresh(msg)
    _generating[user.id] = time.monotonic()
    return TurnPlan(user.id, conv.id, message_out(msg), messages, prompt_id, evidence)


def release_turn(plan: TurnPlan) -> None:
    _generating.pop(plan.user_id, None)


async def complete_turn(sessions: async_sessionmaker[AsyncSession], plan: TurnPlan, raw_text: str,
                        *, interrupted: bool = False) -> MessageOut | None:
    text, sources = finalize_answer(raw_text, plan.evidence)
    if not text:
        return None
    async with sessions() as db:
        if await db.get(Conversation, plan.conversation_id) is None:
            return None  # deleted while the answer was generating
        msg = Message(conversation_id=plan.conversation_id, role="assistant", content=text,
                      knowledge_mode=plan.evidence.mode.value,
                      sources=[s.model_dump(by_alias=True) for s in sources],
                      status="interrupted" if interrupted else "complete")
        db.add(msg)
        conv = await db.get(Conversation, plan.conversation_id)
        conv.updated_at = utcnow()
        await db.commit()
        await db.refresh(msg)
        return message_out(msg)
