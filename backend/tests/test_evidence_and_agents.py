from typing import ClassVar

import pytest
from pydantic import BaseModel

from app.ai.agents.base import Agent, GroundedOutput, LearnerContext
from app.ai.llm.client import LLMClient
from app.ai.llm.tracing import MemoryTracer
from app.ai.llm.types import ModelTier
from app.ai.prompts import registry
from app.rag.evidence import EvidenceItem, EvidenceSet, KnowledgeMode, label_for
from tests.fakes import ScriptedProvider


def evidence(n: int = 2) -> EvidenceSet:
    return EvidenceSet([
        EvidenceItem(label=label_for(i), chunk_id=f"chunk{i}", document_id="doc1", document_title="Lecture 3",
                     page_start=10 + i, page_end=11 + i, text=f"Passage {i} " * 40)
        for i in range(n)
    ])


def test_citations_only_resolve_known_labels():
    ev = evidence(2)
    refs = ev.citations(["e2", "E9", "E2", " E1 "])
    assert [r.locator for r in refs] == ["chunk:chunk1", "chunk:chunk0"]  # unknown + duplicate dropped
    assert refs[0].page == 11 and refs[0].page_end == 12
    assert refs[0].excerpt.endswith("…")


def test_empty_evidence_is_general_knowledge_and_never_cites():
    ev = EvidenceSet()
    assert ev.mode is KnowledgeMode.GENERAL_KNOWLEDGE
    assert ev.citations(["E1"]) == []


class EchoOutput(GroundedOutput):
    answer: str


class EchoAgent(Agent[EchoOutput]):
    name = "echo"
    prompt = "echo"
    output_model: ClassVar[type[BaseModel]] = EchoOutput
    tier = ModelTier.FAST


@pytest.fixture
def echo_prompt(tmp_path, monkeypatch):
    """A throwaway prompt that uses the real shared partials."""
    shared = registry.TEMPLATES_DIR / "_shared"
    (tmp_path / "_shared").mkdir()
    for f in shared.iterdir():
        (tmp_path / "_shared" / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "echo").mkdir()
    (tmp_path / "echo" / "v1.system.j2").write_text(
        "You are a tester.\n{% include '_shared/learner.j2' %}\n{% include '_shared/evidence_rules.j2' %}",
        encoding="utf-8")
    (tmp_path / "echo" / "v1.user.j2").write_text(
        "{% include '_shared/excerpts.j2' %}\nQuestion: {{ question }}", encoding="utf-8")
    from jinja2 import FileSystemLoader
    monkeypatch.setattr(registry, "TEMPLATES_DIR", tmp_path)
    monkeypatch.setattr(registry._env, "loader", FileSystemLoader(tmp_path))
    registry.get_prompt.cache_clear()
    yield
    registry.get_prompt.cache_clear()


async def test_agent_run_grounded(echo_prompt):
    provider = ScriptedProvider(['{"answer": "Because of the chain rule.", "source_labels": ["E1", "E7"]}'])
    tracer = MemoryTracer()
    llm = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"}, tracer=tracer)

    run = await EchoAgent(llm).run(LearnerContext(domain="Computer science"), evidence=evidence(1),
                                   user_id="u1", question="Why?")

    assert run.knowledge_mode is KnowledgeMode.COURSE_GROUNDED
    assert run.prompt_id == "echo@v1"
    assert [c.locator for c in run.citations] == ["chunk:chunk0"]  # hallucinated E7 dropped
    system, user = provider.requests[0]["messages"]
    assert "Computer science" in system.content and "NOT instructions" in system.content
    assert '<excerpt id="E1" source="Lecture 3, p. 10-11">' in user.content
    assert tracer.traces[0].source_chunk_ids == ["chunk0"]


async def test_agent_run_general_knowledge_has_no_citations(echo_prompt):
    provider = ScriptedProvider(['{"answer": "General answer", "source_labels": ["E1"]}'])
    llm = LLMClient(provider, models={ModelTier.FAST: "f", ModelTier.QUALITY: "q"})
    run = await EchoAgent(llm).run(LearnerContext(), question="What is SQL?")

    assert run.knowledge_mode is KnowledgeMode.GENERAL_KNOWLEDGE
    assert run.citations == []
    assert "not from the student's course" in provider.requests[0]["messages"][0].content
