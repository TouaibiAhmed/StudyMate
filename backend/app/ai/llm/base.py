"""The provider interface. Everything above this layer is runtime-agnostic, so a hosted
OpenAI-compatible provider can be added later without touching agents or features."""

from collections.abc import AsyncIterator
from typing import Any, Protocol

from app.ai.llm.types import ChatMessage, GenerationOptions, LLMResponse


class LLMProvider(Protocol):
    name: str

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: str,
        options: GenerationOptions,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """Single completion. With `json_schema`, the runtime constrains output to that schema."""
        ...

    def stream(
        self, messages: list[ChatMessage], *, model: str, options: GenerationOptions
    ) -> AsyncIterator[str]:
        """Yield text deltas as they are generated."""
        ...

    async def list_models(self) -> list[str]: ...

    async def aclose(self) -> None: ...
