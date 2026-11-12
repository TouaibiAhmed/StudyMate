"""Benchmark local Ollama models on StudyMate-shaped tasks.

Usage (from backend/):
    .venv/Scripts/python scripts/benchmark_models.py llama3.1:8b llama3.2:3b

For each model it measures load time, prompt-processing and generation speed, end-to-end latency,
JSON validity, and whether answer grading matches human labels. Results go to
benchmarks/results/<timestamp>.json and a table is printed.
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from pydantic import BaseModel, Field, ValidationError

OLLAMA = "http://localhost:11434"
NUM_CTX = 4096

EXCERPT = (
    "Backpropagation computes the gradient of the loss with respect to every weight by applying the chain "
    "rule layer by layer, starting from the output. The gradients are then used by an optimizer such as "
    "gradient descent to update the weights. Computing gradients and updating weights are separate steps: "
    "backpropagation only computes the gradients."
)


class Grade(BaseModel):
    verdict: str = Field(pattern="^(correct|partially_correct|incorrect|insufficient_evidence)$")
    strengths: list[str]
    gaps: list[str]
    confidence: str = Field(pattern="^(high|medium|low)$")


class McqQuestion(BaseModel):
    prompt: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str


class Quiz(BaseModel):
    questions: list[McqQuestion] = Field(min_length=3, max_length=3)


GRADING_CASES = [
    ("Backpropagation applies the chain rule from the output layer backwards to get the gradient of the loss for "
     "each weight; the optimizer then uses those gradients to update the weights.", "correct"),
    ("We calculate gradients to know how much each weight should change.", "partially_correct"),
    ("Backpropagation is when the network randomly changes weights until the loss goes down.", "incorrect"),
]

GRADE_SYSTEM = (
    "You are the Assessment role of a study app. Evaluate the student's answer against the rubric and the course "
    "excerpt. Verdicts: correct, partially_correct, incorrect, insufficient_evidence. Be strict: an answer that "
    "misses a required idea is partially_correct at best. Return JSON only."
)


def grade_prompt(answer: str) -> list[dict]:
    return [
        {"role": "system", "content": GRADE_SYSTEM},
        {"role": "user", "content": (
            f'<excerpt id="E1">{EXCERPT}</excerpt>\n'
            "Question: Why do we calculate gradients during backpropagation, and how are they obtained?\n"
            "Rubric required ideas: (1) gradient of the loss w.r.t. each weight, (2) obtained with the chain rule "
            "propagated backwards through layers, (3) used afterwards by an optimizer to update weights.\n"
            f"Student answer: {answer}"
        )},
    ]


TUTOR_PROMPT = [
    {"role": "system", "content": (
        "You are a Socratic tutor for an undergraduate computer science student. Use only the course excerpt. "
        "Explain in at most 4 sentences, cite the excerpt as [E1], then ask ONE short follow-up question.")},
    {"role": "user", "content": f'<excerpt id="E1">{EXCERPT}</excerpt>\nI don\'t get the difference between '
                                "backpropagation and gradient descent."},
]

QUIZ_PROMPT = [
    {"role": "system", "content": "You write multiple-choice questions grounded only in the given excerpt. JSON only."},
    {"role": "user", "content": f'<excerpt id="E1">{EXCERPT}</excerpt>\nWrite exactly 3 questions, 4 options each.'},
]


def call(client: httpx.Client, model: str, messages: list[dict], schema: dict | None, max_tokens: int) -> dict:
    body = {"model": model, "messages": messages, "stream": False, "keep_alive": "10m",
            "options": {"temperature": 0.1, "num_predict": max_tokens, "num_ctx": NUM_CTX}}
    if schema:
        body["format"] = schema
    started = time.perf_counter()
    data = client.post(f"{OLLAMA}/api/chat", json=body).json()
    if "error" in data:
        raise RuntimeError(data["error"])
    wall = time.perf_counter() - started
    ns = 1e9
    return {
        "content": data["message"]["content"],
        "wall_s": round(wall, 2),
        "load_s": round(data.get("load_duration", 0) / ns, 2),
        "prompt_tokens": data.get("prompt_eval_count", 0),
        "prompt_tps": round(data.get("prompt_eval_count", 0) / max(data.get("prompt_eval_duration", 1) / ns, 1e-6), 1),
        "gen_tokens": data.get("eval_count", 0),
        "gen_tps": round(data.get("eval_count", 0) / max(data.get("eval_duration", 1) / ns, 1e-6), 1),
        "finish": data.get("done_reason"),
    }


def bench(model: str) -> dict:
    out: dict = {"model": model, "tasks": {}}
    with httpx.Client(timeout=600) as client:
        # Warm-up / load measurement
        warm = call(client, model, [{"role": "user", "content": "Say OK."}], None, 5)
        out["load_s"] = warm["load_s"]

        grades = []
        for answer, expected in GRADING_CASES:
            r = call(client, model, grade_prompt(answer), Grade.model_json_schema(), 300)
            try:
                g = Grade.model_validate_json(r["content"])
                r.update(valid=True, verdict=g.verdict, expected=expected, match=g.verdict == expected)
            except ValidationError:
                r.update(valid=False, verdict=None, expected=expected, match=False)
            r.pop("content")
            grades.append(r)
        out["tasks"]["grading"] = grades

        tutor = call(client, model, TUTOR_PROMPT, None, 250)
        out["tasks"]["tutor"] = {**{k: v for k, v in tutor.items() if k != "content"}, "sample": tutor["content"]}

        quiz = call(client, model, QUIZ_PROMPT, Quiz.model_json_schema(), 900)
        try:
            Quiz.model_validate_json(quiz["content"])
            quiz["valid"] = True
        except ValidationError:
            quiz["valid"] = False
        quiz.pop("content")
        out["tasks"]["quiz"] = quiz
    return out


def summarize(r: dict) -> str:
    g = r["tasks"]["grading"]
    t = r["tasks"]["tutor"]
    q = r["tasks"]["quiz"]
    avg = lambda xs: round(sum(xs) / len(xs), 1)  # noqa: E731
    return (
        f"{r['model']:<16} load {r['load_s']:>5}s | prompt {avg([x['prompt_tps'] for x in g]):>6} tok/s | "
        f"gen {avg([x['gen_tps'] for x in g + [t, q]]):>5} tok/s | grade {avg([x['wall_s'] for x in g]):>5}s "
        f"({sum(x['match'] for x in g)}/{len(g)} match, {sum(x['valid'] for x in g)}/{len(g)} valid) | "
        f"tutor {t['wall_s']:>5}s | quiz {q['wall_s']:>5}s valid={q['valid']}"
    )


def main() -> None:
    models = sys.argv[1:] or ["llama3.1:8b"]
    results = []
    for m in models:
        print(f"Benchmarking {m} ...", flush=True)
        results.append(bench(m))
        print(summarize(results[-1]), flush=True)
    out_dir = Path(__file__).resolve().parents[1] / "benchmarks" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSaved {path}")
    for r in results:
        print(f"\n--- {r['model']} tutor sample ---\n{r['tasks']['tutor']['sample']}")


if __name__ == "__main__":
    main()
