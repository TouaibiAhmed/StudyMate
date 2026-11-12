from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.core.schemas import CamelModel, SourceReference

ContextType = Literal["general", "course", "topic"]


class ContextIn(CamelModel):
    type: ContextType = "general"
    course_id: str | None = None
    topic_id: str | None = None


class ContextOut(ContextIn):
    course_title: str | None = None
    topic_title: str | None = None


class ConversationCreate(CamelModel):
    title: str | None = Field(default=None, max_length=120)
    context: ContextIn = Field(default_factory=ContextIn)


class ConversationPatch(CamelModel):
    title: str | None = Field(default=None, max_length=120)
    context: ContextIn | None = None


class MessageIn(CamelModel):
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Write a message first")
        return v.strip()


class MessageOut(CamelModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: list[SourceReference]
    knowledge_mode: str | None
    status: str
    created_at: datetime


class ConversationOut(CamelModel):
    id: str
    user_id: str
    title: str
    context: ContextOut
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class SendOut(CamelModel):
    user_message: MessageOut
    assistant_message: MessageOut
