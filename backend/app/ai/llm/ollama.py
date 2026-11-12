"""Ollama provider (local inference). Uses /api/chat with JSON-schema structured outputs."""

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.ai.llm.types import (
    ChatMessage,
    GenerationOptions,
    LLMError,
    LLMModelMissingError,
    LLMResponse,
    LLMTimeoutError,
    LLMUnavailableError,
)


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, *, timeout_s: float, keep_alive: str, default_num_ctx: int):
        self._client = httpx.AsyncClient(
            base_url=base_url, timeout=httpx.Timeout(timeout_s, connect=5.0)
        )
        self._keep_alive = keep_alive
        self._default_num_ctx = default_num_ctx

    def _body(
        self,
        messages: list[ChatMessage],
        model: str,
        options: GenerationOptions,
        *,
        stream: bool,
        json_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": stream,
            "keep_alive": self._keep_alive,
            "options": {
                "temperature": options.temperature,
                "num_predict": options.max_tokens,
                "num_ctx": options.num_ctx or self._default_num_ctx,
                **({"stop": options.stop} if options.stop else {}),
            },
        }
        if json_schema is not None:
            body["format"] = json_schema
        if options.think is not None:
            body["think"] = options.think
        return body

    @staticmethod
    def _raise_for(resp: httpx.Response, model: str) -> None:
        if resp.status_code == 404:
            raise LLMModelMissingError(f"Model {model!r} is not installed in Ollama")
        if resp.status_code >= 400:
            raise LLMError(f"Ollama returned {resp.status_code}: {resp.text[:300]}")

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: str,
        options: GenerationOptions,
        json_schema: dict[str, Any] | None = None,
    ) -> LLMResponse:
        body = self._body(messages, model, options, stream=False, json_schema=json_schema)
        try:
            resp = await self._client.post("/api/chat", json=body)
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"Ollama timed out for {model}") from exc
        except httpx.TransportError as exc:
            raise LLMUnavailableError(f"Ollama unreachable: {exc}") from exc
        self._raise_for(resp, model)
        data = resp.json()
        return LLMResponse(
            content=data.get("message", {}).get("content", ""),
            model=data.get("model", model),
            prompt_tokens=data.get("prompt_eval_count"),
            completion_tokens=data.get("eval_count"),
            duration_ms=int(data["total_duration"] / 1e6) if data.get("total_duration") else None,
            finish_reason=data.get("done_reason"),
        )

    async def stream(
        self, messages: list[ChatMessage], *, model: str, options: GenerationOptions
    ) -> AsyncIterator[str]:
        body = self._body(messages, model, options, stream=True)
        try:
            async with self._client.stream("POST", "/api/chat", json=body) as resp:
                if resp.status_code >= 400:
                    await resp.aread()
                    self._raise_for(resp, model)
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    if chunk.get("error"):
                        raise LLMError(str(chunk["error"]))
                    delta = chunk.get("message", {}).get("content", "")
                    if delta:
                        yield delta
                    if chunk.get("done"):
                        break
        except httpx.TimeoutException as exc:
            raise LLMTimeoutError(f"Ollama timed out for {model}") from exc
        except httpx.TransportError as exc:
            raise LLMUnavailableError(f"Ollama unreachable: {exc}") from exc

    async def list_models(self) -> list[str]:
        try:
            resp = await self._client.get("/api/tags", timeout=5.0)
        except httpx.TransportError as exc:
            raise LLMUnavailableError(f"Ollama unreachable: {exc}") from exc
        resp.raise_for_status()
        return [m["name"] for m in resp.json().get("models", [])]

    async def aclose(self) -> None:
        await self._client.aclose()
