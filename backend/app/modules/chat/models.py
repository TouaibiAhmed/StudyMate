from typing import Any

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class Conversation(IdMixin, TimestampMixin, Base):
    __tablename__ = "chat_conversations"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="New conversation")
    # general | course | topic
    context_type: Mapped[str] = mapped_column(String(16), default="general")
    # Deleting a course deletes its conversations (FR-10: derived data goes with the course).
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("concepts.id", ondelete="SET NULL"))


class Message(IdMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_conversation_created", "conversation_id", "created_at"),)

    conversation_id: Mapped[str] = mapped_column(ForeignKey("chat_conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    # Assistant only: course_grounded | general_knowledge
    knowledge_mode: Mapped[str | None] = mapped_column(String(24))
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # complete | interrupted (client left mid-stream)
    status: Mapped[str] = mapped_column(String(16), default="complete")
