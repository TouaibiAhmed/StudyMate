import pytest
from pydantic import BaseModel, Field

from app.ai.llm.client import CallMeta, LLMClient
from app.ai.llm.tracing import MemoryTracer
from app.ai.llm.types import ChatMessage, LLMOutputError, LLMTimeoutError, ModelTier
from tests.fakes import ScriptedProvider


class Verdict(BaseModel):
    verdict: str = Field(pattern="^(correct|incorrect)$")
    score: float = Field(ge=0, le=1)


MESSAGES = [ChatMessage("system", "s"), ChatMessage("user", "u")]
META = CallMeta(role="assessment", prompt_version="assessment@v1", source_chunk_ids=["c1"])


def make_client(provider, tracer=None):
    return LLMClient(
        provider,
        models={ModelTier.FAST: "fast-model", ModelTier.QUALITY: "quality-model"},
        tracer=tracer or MemoryTracer(),
    )


async def test_structured_output_valid_first_try():
    provider = ScriptedProvider(['{"verdict": "correct", "score": 0.9}'])
    tracer = MemoryTracer()
    result = await make_client(provider, tracer).generate_structured(MESSAGES, Verdict, meta=META)

    assert result.value == Verdict(verdict="correct", score=0.9)
    assert result.attempts == 1
    # The JSON schema is passed to the runtime and the quality tier picks the quality model.
    assert provider.requests[0]["schema"]["title"] == "Verdict"
    assert provider.requests[0]["model"] == "quality-model"
    trace = tracer.traces[0]
    assert (trace.role, trace.status, trace.prompt_version, trace.source_chunk_ids) == (
        "assessment", "ok", "assessment@v1", ["c1"],
    )


async def test_structured_output_repaired_after_validation_error():
    provider = ScriptedProvider(['{"verdict": "maybe", "score": 2}', '{"verdict": "incorrect", "score": 0.1}'])
    result = await make_client(provider).generate_structured(MESSAGES, Verdict, meta=META)

    assert result.value.verdict == "incorrect"
    assert result.attempts == 2
    repair = provider.requests[1]["messages"]
    assert repair[-2].role == "assistant" and "maybe" in repair[-2].content
    assert "did not match the required schema" in repair[-1].content


async def test_structured_output_gives_up_and_traces_invalid_output():
    provider = ScriptedProvider(["not json", "still not json"])
    tracer = MemoryTracer()
    with pytest.raises(LLMOutputError):
        await make_client(provider, tracer).generate_structured(MESSAGES, Verdict, meta=META)
    assert tracer.traces[0].status == "invalid_output"
    assert tracer.traces[0].attempts == 2


async def test_truncated_output_is_retried_without_repair_prompt():
    provider = ScriptedProvider(['{"verdict": "corr', '{"verdict": "correct", "score": 1}'],
                                finish_reasons=["length", "stop"])
    result = await make_client(provider).generate_structured(MESSAGES, Verdict, meta=META)
    assert result.value.verdict == "correct"
    assert len(provider.requests[1]["messages"]) == len(MESSAGES)


async def test_provider_error_is_traced_and_reraised():
    provider = ScriptedProvider([LLMTimeoutError("slow")])
    tracer = MemoryTracer()
    with pytest.raises(LLMTimeoutError):
        await make_client(provider, tracer).generate_text(MESSAGES, meta=META)
    assert tracer.traces[0].status == "timeout"
    assert tracer.traces[0].model == "fast-model"


async def test_stream_text_yields_deltas_and_traces():
    provider = ScriptedProvider(["hello there student"])
    tracer = MemoryTracer()
    pieces = [p async for p in make_client(provider, tracer).stream_text(MESSAGES, meta=META)]
    assert "".join(pieces).strip() == "hello there student"
    assert tracer.traces[0].meta["streamed_chars"] > 0
