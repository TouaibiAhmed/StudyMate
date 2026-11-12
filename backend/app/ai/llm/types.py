"""Provider-neutral types for LLM calls."""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


class ModelTier(StrEnum):
    """Which model serves a call. Mapped to concrete model names by settings."""

    FAST = "fast"  # interactive: chat, tutor replies, hints
    QUALITY = "quality"  # grading, exam/quiz/roadmap/summary generation (mostly background)


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass(frozen=True)
class GenerationOptions:
    temperature: float = 0.3
    max_tokens: int = 512
    num_ctx: int | None = None
    # Only for models that support a reasoning mode; None means "don't send the flag".
    think: bool | None = None
    stop: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class LLMResponse:
    content: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    duration_ms: int | None = None
    # "stop" when the model finished, "length" when it hit max_tokens (output is truncated).
    finish_reason: str | None = None


class LLMError(Exception):
    """Base error for model calls. Messages are for logs only, never shown to users."""

    retryable = True


class LLMUnavailableError(LLMError):
    """The model runtime cannot be reached."""


class LLMTimeoutError(LLMError):
    """The model did not answer in time."""


class LLMModelMissingError(LLMError):
    """The configured model is not installed in the runtime."""

    retryable = False


class LLMOutputError(LLMError):
    """The model answered, but the output failed schema validation after retries."""

    retryable = False
