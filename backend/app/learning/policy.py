"""Deterministic learning policy (doc sections 11.3-11.5). No model calls here.

Two decisions live in this module:

1. Concept state from evidence: a transparent weighted heuristic, shown as labels
   (needs practice / developing / good evidence / not enough evidence), never as a "% known".
2. Next activity after an answer: the routing table of doc 11.4. The model may write the
   question, but *what kind* of question comes next is decided here.
"""

import math
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class Verdict(StrEnum):
    CORRECT = "correct"
    PARTIALLY_CORRECT = "partially_correct"
    INCORRECT = "incorrect"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class ConceptStatus(StrEnum):
    NOT_ENOUGH_EVIDENCE = "not_enough_evidence"
    NEEDS_PRACTICE = "needs_practice"
    DEVELOPING = "developing"
    GOOD_EVIDENCE = "good_evidence"


class Difficulty(StrEnum):
    INTRODUCTORY = "introductory"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class ActivityType(StrEnum):
    DIAGNOSTIC = "diagnostic"  # find out what the student already knows
    EXPLAIN_AND_CHECK = "explain_and_check"  # short explanation, then a simpler question
    TARGETED_PRACTICE = "targeted_practice"  # aim at the missing idea
    REVIEW = "review"  # same level again, without hints this time
    TRANSFER = "transfer"  # apply the idea in a new situation


_VERDICT_VALUE = {Verdict.CORRECT: 1.0, Verdict.PARTIALLY_CORRECT: 0.5, Verdict.INCORRECT: 0.0}
_DIFFICULTY_WEIGHT = {Difficulty.INTRODUCTORY: 0.8, Difficulty.INTERMEDIATE: 1.0, Difficulty.ADVANCED: 1.2}
_CONFIDENCE_WEIGHT = {"high": 1.0, "medium": 0.85, "low": 0.6}
HALF_LIFE_DAYS = 14.0
# Shown as the bar in the UI; levels, not percentages of knowledge.
STATUS_LEVEL = {
    ConceptStatus.NOT_ENOUGH_EVIDENCE: 0,
    ConceptStatus.NEEDS_PRACTICE: 25,
    ConceptStatus.DEVELOPING: 55,
    ConceptStatus.GOOD_EVIDENCE: 90,
}


@dataclass(frozen=True)
class EvidencePoint:
    verdict: str
    created_at: datetime
    difficulty: str = Difficulty.INTERMEDIATE
    hints_used: int = 0
    confidence: str = "medium"
    exam: bool = False
    general_knowledge: bool = False


@dataclass(frozen=True)
class ConceptState:
    status: ConceptStatus
    estimate: float | None  # weighted mean of verdict values, 0..1 (internal; not shown as a score)
    evidence_count: int
    independent_successes: int
    reason: str
    recommended_action: str

    @property
    def level(self) -> int:
        return STATUS_LEVEL[self.status]


def evidence_weight(p: EvidencePoint, now: datetime) -> float:
    w = _DIFFICULTY_WEIGHT.get(p.difficulty, 1.0)  # StrEnum keys match their plain-string values
    w *= _CONFIDENCE_WEIGHT.get(p.confidence, 0.85)
    w *= max(0.4, 1.0 - 0.2 * p.hints_used)  # correct after hints is weaker evidence
    if p.exam:
        w *= 1.5  # independent recall under exam conditions (doc 11.4)
    if p.general_knowledge:
        w *= 0.8  # model-written rubric, lower default confidence (doc 10.5)
    age_days = max(0.0, (now - p.created_at).total_seconds() / 86400)
    return w * math.pow(0.5, age_days / HALF_LIFE_DAYS)


def concept_state(points: list[EvidencePoint], now: datetime) -> ConceptState:
    informative = [p for p in points if p.verdict in _VERDICT_VALUE]
    if not informative:
        return ConceptState(ConceptStatus.NOT_ENOUGH_EVIDENCE, None, 0, 0,
                            "No answers recorded for this concept yet.",
                            "Start with a short diagnostic question.")
    weights = [evidence_weight(p, now) for p in informative]
    estimate = sum(w * _VERDICT_VALUE[Verdict(p.verdict)] for w, p in zip(weights, informative, strict=True)) / sum(
        weights)
    independent = sum(1 for p in informative if p.verdict == Verdict.CORRECT and p.hints_used == 0)
    latest = max(informative, key=lambda p: p.created_at)

    if estimate < 0.45:
        status = ConceptStatus.NEEDS_PRACTICE
        reason = ("Your latest answer missed key ideas." if latest.verdict == Verdict.INCORRECT
                  else "Recent answers were only partly complete.")
        action = "Review the explanation, then try a simpler question."
    elif estimate >= 0.8 and independent >= 2:
        status = ConceptStatus.GOOD_EVIDENCE
        reason = f"{independent} correct answers without hints."
        action = "Schedule a spaced review in a few days, or try a transfer question."
    elif len(informative) < 2:
        status = ConceptStatus.NOT_ENOUGH_EVIDENCE if estimate < 0.8 else ConceptStatus.DEVELOPING
        reason = "Only one answer so far: one answer is not enough to judge."
        action = "Answer one more question on this concept."
    else:
        status = ConceptStatus.DEVELOPING
        reason = ("Correct, but with hints: try it again without hints." if latest.hints_used
                  else "Good progress; a second independent correct answer will confirm it.")
        action = "Practise once more without hints."
    return ConceptState(status, round(estimate, 3), len(informative), independent, reason, action)


# --- routing ---------------------------------------------------------------------------------------

@dataclass(frozen=True)
class LastResult:
    verdict: str
    difficulty: str
    hints_used: int
    gaps: list[str]
    misconception: str | None = None


@dataclass(frozen=True)
class NextStep:
    activity_type: ActivityType
    difficulty: Difficulty
    focus: str | None  # the gap or misconception the next question should target
    reason: str  # shown to the student as "what comes next and why"


def _down(d: Difficulty) -> Difficulty:
    return {Difficulty.ADVANCED: Difficulty.INTERMEDIATE}.get(d, Difficulty.INTRODUCTORY)


def _up(d: Difficulty) -> Difficulty:
    return {Difficulty.INTRODUCTORY: Difficulty.INTERMEDIATE}.get(d, Difficulty.ADVANCED)


def first_step(state: ConceptState) -> NextStep:
    difficulty = {
        ConceptStatus.GOOD_EVIDENCE: Difficulty.ADVANCED,
        ConceptStatus.DEVELOPING: Difficulty.INTERMEDIATE,
    }.get(state.status, Difficulty.INTRODUCTORY)
    if state.status == ConceptStatus.GOOD_EVIDENCE:
        return NextStep(ActivityType.TRANSFER, difficulty, None,
                        "You already have good evidence here, so we start with an application question.")
    return NextStep(ActivityType.DIAGNOSTIC, difficulty, None,
                    "A first question to see what you already know.")


def next_step(last: LastResult) -> NextStep:
    d = Difficulty(last.difficulty) if last.difficulty in Difficulty else Difficulty.INTERMEDIATE
    focus = last.misconception or (last.gaps[0] if last.gaps else None)
    if last.verdict == Verdict.INCORRECT:
        return NextStep(ActivityType.EXPLAIN_AND_CHECK, _down(d), focus,
                        "Next: a short explanation of the key idea, then a simpler question to check it.")
    if last.verdict == Verdict.PARTIALLY_CORRECT:
        missing = f' ("{focus}")' if focus else ""
        return NextStep(ActivityType.TARGETED_PRACTICE, d, focus,
                        f"Next: a question aimed at the part you missed{missing}.")
    if last.verdict == Verdict.CORRECT and last.hints_used > 0:
        return NextStep(ActivityType.REVIEW, d, None,
                        "Correct with hints: next, a similar question to answer without hints.")
    if last.verdict == Verdict.CORRECT:
        return NextStep(ActivityType.TRANSFER, _up(d), None,
                        "Correct without hints: next, a harder question that applies the idea.")
    return NextStep(ActivityType.DIAGNOSTIC, d, None,
                    "The answer did not give enough to judge: next, a clearer question on the same idea.")
