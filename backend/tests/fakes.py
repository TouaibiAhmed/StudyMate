"""Test doubles."""

from collections.abc import AsyncIterator
from typing import Any

from app.ai.llm.types import ChatMessage, GenerationOptions, LLMResponse


class ScriptedProvider:
    """Returns pre-scripted responses in order and records every request."""

    name = "scripted"

    def __init__(self, responses: list[str | Exception], *, finish_reasons: list[str] | None = None):
        self.responses = list(responses)
        self.finish_reasons = list(finish_reasons or [])
        self.requests: list[dict[str, Any]] = []

    async def chat(self, messages: list[ChatMessage], *, model: str, options: GenerationOptions,
                   json_schema: dict[str, Any] | None = None) -> LLMResponse:
        self.requests.append({"messages": messages, "model": model, "schema": json_schema, "options": options})
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        reason = self.finish_reasons.pop(0) if self.finish_reasons else "stop"
        return LLMResponse(content=item, model=model, prompt_tokens=10, completion_tokens=5, finish_reason=reason)

    async def stream(self, messages, *, model, options) -> AsyncIterator[str]:
        self.requests.append({"messages": messages, "model": model, "stream": True})
        for piece in self.responses.pop(0).split(" "):
            yield piece + " "

    async def list_models(self) -> list[str]:
        return ["fast-model", "quality-model"]

    async def aclose(self) -> None:
        return None
