"""LLM gateway: the only way application code talks to a model.

Responsibilities:
  * map a ModelTier to a concrete model name (settings)
  * limit concurrent calls per process (the local runtime serves one request well at a time)
  * structured output: JSON-schema-constrained generation -> Pydantic validation -> one repair retry
  * trace every call (role, model, prompt version, latency, tokens, source chunk ids)
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.llm.base import LLMProvider
from app.ai.llm.tracing import CallTrace, NullTracer, Tracer
from app.ai.llm.types import (
    ChatMessage,
    GenerationOptions,
    LLMError,
    LLMOutputError,
    LLMResponse,
    LLMTimeoutError,
    LLMUnavailableError,
    ModelTier,
)

T = TypeVar("T", bound=BaseModel)


@dataclass
class CallMeta:
    """Who is calling and why; stored in the trace."""

    role: str
    prompt_version: str | None = None
    user_id: str | None = None
    subject: str | None = None
    source_chunk_ids: list[str] = field(default_factory=list)


@dataclass
class StructuredResult(Generic[T]):
    value: T
    response: LLMResponse
    attempts: int


def _status_for(exc: Exception) -> str:
    if isinstance(exc, LLMTimeoutError):
        return "timeout"
    if isinstance(exc, LLMUnavailableError):
        return "unavailable"
    if isinstance(exc, LLMOutputError):
        return "invalid_output"
    return "error"


def _summarize_validation_error(err: ValidationError, limit: int = 5) -> str:
    parts = []
    for e in err.errors()[:limit]:
        loc = ".".join(str(p) for p in e.get("loc", ())) or "(root)"
        parts.append(f"- {loc}: {e.get('msg')}")
    return "\n".join(parts)


class LLMClient:
    def __init__(
        self,
        provider: LLMProvider,
        *,
        models: dict[ModelTier, str],
        max_concurrency: int = 1,
        structured_retries: int = 1,
        tracer: Tracer | None = None,
    ):
        self.provider = provider
        self.models = models
        self.structured_retries = structured_retries
        self.tracer = tracer or NullTracer()
        self._gate = asyncio.Semaphore(max_concurrency)

    def model_for(self, tier: ModelTier) -> str:
        return self.models[tier]

    async def _chat(self, messages, *, model, options, json_schema=None) -> LLMResponse:
        async with self._gate:
            return await self.provider.chat(messages, model=model, options=options, json_schema=json_schema)

    async def generate_text(
        self,
        messages: list[ChatMessage],
        *,
        meta: CallMeta,
        tier: ModelTier = ModelTier.FAST,
        options: GenerationOptions | None = None,
    ) -> LLMResponse:
        options = options or GenerationOptions()
        model = self.model_for(tier)
        trace = self._new_trace(meta, model, tier)
        started = time.perf_counter()
        try:
            resp = await self._chat(messages, model=model, options=options)
            self._fill(trace, resp)
            return resp
        except LLMError as exc:
            trace.status, trace.error = _status_for(exc), str(exc)[:1000]
            raise
        finally:
            trace.latency_ms = int((time.perf_counter() - started) * 1000)
            await self.tracer.record(trace)

    async def generate_structured(
        self,
        messages: list[ChatMessage],
        output_model: type[T],
        *,
        meta: CallMeta,
        tier: ModelTier = ModelTier.QUALITY,
        options: GenerationOptions | None = None,
    ) -> StructuredResult[T]:
        """Generate JSON that validates against `output_model`.

        The schema is enforced twice: by the runtime (grammar-constrained decoding) and by
        Pydantic (types, enums, custom validators). On a validation failure the model gets the
        errors back once and is asked to correct its output.
        """
        options = options or GenerationOptions(temperature=0.1)
        model = self.model_for(tier)
        schema = output_model.model_json_schema()
        convo = list(messages)
        trace = self._new_trace(meta, model, tier)
        started = time.perf_counter()
        last_error = ""
        try:
            for attempt in range(1, self.structured_retries + 2):
                trace.attempts = attempt
                resp = await self._chat(convo, model=model, options=options, json_schema=schema)
                self._fill(trace, resp)
                if resp.finish_reason == "length":
                    last_error = "output was cut off by the token limit"
                    convo = [*messages]  # a truncated answer is not worth repairing; retry clean
                    continue
                try:
                    value = output_model.model_validate_json(resp.content)
                    return StructuredResult(value=value, response=resp, attempts=attempt)
                except ValidationError as err:
                    last_error = _summarize_validation_error(err)
                    convo = [
                        *messages,
                        ChatMessage("assistant", resp.content),
                        ChatMessage(
                            "user",
                            "Your previous JSON did not match the required schema:\n"
                            f"{last_error}\nReturn the corrected JSON object only.",
                        ),
                    ]
            raise LLMOutputError(f"{output_model.__name__} invalid after {trace.attempts} attempts: {last_error}")
        except LLMError as exc:
            trace.status, trace.error = _status_for(exc), str(exc)[:1000]
            raise
        finally:
            trace.latency_ms = int((time.perf_counter() - started) * 1000)
            await self.tracer.record(trace)

    async def stream_text(
        self,
        messages: list[ChatMessage],
        *,
        meta: CallMeta,
        tier: ModelTier = ModelTier.FAST,
        options: GenerationOptions | None = None,
    ) -> AsyncIterator[str]:
        options = options or GenerationOptions()
        model = self.model_for(tier)
        trace = self._new_trace(meta, model, tier)
        started = time.perf_counter()
        chars = 0
        try:
            async with self._gate:
                async for delta in self.provider.stream(messages, model=model, options=options):
                    chars += len(delta)
                    yield delta
        except LLMError as exc:
            trace.status, trace.error = _status_for(exc), str(exc)[:1000]
            raise
        finally:
            trace.latency_ms = int((time.perf_counter() - started) * 1000)
            trace.meta["streamed_chars"] = chars
            await self.tracer.record(trace)

    def _new_trace(self, meta: CallMeta, model: str, tier: ModelTier) -> CallTrace:
        return CallTrace(
            role=meta.role,
            prompt_version=meta.prompt_version,
            provider=self.provider.name,
            model=model,
            tier=tier.value,
            user_id=meta.user_id,
            subject=meta.subject,
            source_chunk_ids=meta.source_chunk_ids or None,
        )

    @staticmethod
    def _fill(trace: CallTrace, resp: LLMResponse) -> None:
        trace.model = resp.model or trace.model
        trace.prompt_tokens = (trace.prompt_tokens or 0) + (resp.prompt_tokens or 0)
        trace.completion_tokens = (trace.completion_tokens or 0) + (resp.completion_tokens or 0)


def schema_hint(output_model: type[BaseModel]) -> str:
    """Compact schema text to include in prompts; small models follow it better when they see it."""
    return json.dumps(output_model.model_json_schema(), separators=(",", ":"))
