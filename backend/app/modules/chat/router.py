"""Chat endpoints.

POST /api/chat/conversations/{id}/messages/stream answers with Server-Sent Events:

    event: user   data: <MessageOut>                    the stored student message
    event: meta   data: {"knowledgeMode": "..."}        before the first token
    event: delta  data: {"text": "..."}                 streamed answer text (raw)
    event: done   data: <MessageOut>                    final answer with cleaned citations
    event: error  data: {"code": "...", "message": "..."}
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete

from app.ai.agents.chat import stream_answer
from app.ai.llm.factory import get_llm
from app.ai.llm.types import LLMError
from app.core.errors import ServiceUnavailableError
from app.db.session import SessionFactory
from app.modules.auth.deps import DB, CurrentUser
from app.modules.chat import service
from app.modules.chat.models import Message
from app.modules.chat.schemas import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationPatch,
    MessageIn,
    SendOut,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

MODEL_UNAVAILABLE = "The AI model is not available right now. Try again in a moment."


@router.get("/conversations")
async def list_conversations(user: CurrentUser, db: DB) -> list[ConversationOut]:
    return await service.list_conversations(db, user.id)


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(data: ConversationCreate, user: CurrentUser, db: DB) -> ConversationOut:
    return await service.create_conversation(db, user.id, data)


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: CurrentUser, db: DB) -> ConversationDetail:
    return await service.get_conversation(db, user.id, conversation_id)


@router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, data: ConversationPatch, user: CurrentUser,
                              db: DB) -> ConversationOut:
    return await service.update_conversation(db, user.id, conversation_id, data)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str, user: CurrentUser, db: DB) -> Response:
    await service.delete_conversation(db, user.id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _forget_user_message(plan: service.TurnPlan) -> None:
    """No answer was produced: drop the stored question so a retry does not duplicate it."""
    async with SessionFactory() as db:
        await db.execute(delete(Message).where(Message.id == plan.user_message.id))
        await db.commit()


@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, data: MessageIn, user: CurrentUser, db: DB) -> SendOut:
    """Non-streaming variant: waits for the whole answer."""
    plan = await service.prepare_turn(db, user, conversation_id, data.content)
    try:
        parts = [d async for d in stream_answer(get_llm(), plan.messages, prompt_id=plan.prompt_id,
                                                evidence=plan.evidence, user_id=user.id,
                                                subject=f"conversation:{conversation_id}")]
        answer = await service.complete_turn(SessionFactory, plan, "".join(parts))
    except LLMError as exc:
        await _forget_user_message(plan)
        raise ServiceUnavailableError(MODEL_UNAVAILABLE) from exc
    finally:
        service.release_turn(plan)
    if answer is None:
        await _forget_user_message(plan)
        raise ServiceUnavailableError("The AI model returned an empty answer. Try again.")
    return SendOut(user_message=plan.user_message, assistant_message=answer)


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(conversation_id: str, data: MessageIn, user: CurrentUser, db: DB) -> StreamingResponse:
    # Validation, rate limits and retrieval happen before the stream opens, so their errors are
    # ordinary JSON error responses.
    plan = await service.prepare_turn(db, user, conversation_id, data.content)

    async def events():
        parts: list[str] = []
        try:
            yield _sse("user", plan.user_message.model_dump(mode="json", by_alias=True))
            yield _sse("meta", {"knowledgeMode": plan.evidence.mode.value})
            async for delta in stream_answer(get_llm(), plan.messages, prompt_id=plan.prompt_id,
                                             evidence=plan.evidence, user_id=plan.user_id,
                                             subject=f"conversation:{conversation_id}"):
                parts.append(delta)
                yield _sse("delta", {"text": delta})
            answer = await service.complete_turn(SessionFactory, plan, "".join(parts))
            if answer is None:
                await _forget_user_message(plan)
                yield _sse("error", {"code": "service_unavailable",
                                     "message": "The AI model returned an empty answer. Try again."})
            else:
                yield _sse("done", answer.model_dump(mode="json", by_alias=True))
        except LLMError:
            log.warning("Chat generation failed", exc_info=True)
            if parts:
                await service.complete_turn(SessionFactory, plan, "".join(parts), interrupted=True)
            else:
                await _forget_user_message(plan)
            yield _sse("error", {"code": "service_unavailable", "message": MODEL_UNAVAILABLE})
        except asyncio.CancelledError:
            # The student left or stopped the answer: keep what was written so far.
            if parts:
                await asyncio.shield(service.complete_turn(SessionFactory, plan, "".join(parts), interrupted=True))
            raise
        finally:
            service.release_turn(plan)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
