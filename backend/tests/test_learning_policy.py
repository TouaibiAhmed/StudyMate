from datetime import UTC, datetime, timedelta

from app.learning.policy import (
    ActivityType,
    ConceptStatus,
    Difficulty,
    EvidencePoint,
    LastResult,
    concept_state,
    evidence_weight,
    first_step,
    next_step,
)

NOW = datetime(2026, 11, 12, tzinfo=UTC)


def point(verdict, days_ago=0, **kw):
    return EvidencePoint(verdict=verdict, created_at=NOW - timedelta(days=days_ago), **kw)


def test_no_evidence_means_not_enough_evidence():
    s = concept_state([], NOW)
    assert s.status is ConceptStatus.NOT_ENOUGH_EVIDENCE and s.level == 0
    assert concept_state([point("insufficient_evidence")], NOW).status is ConceptStatus.NOT_ENOUGH_EVIDENCE


def test_one_correct_answer_is_never_good_evidence():
    s = concept_state([point("correct")], NOW)
    assert s.status is ConceptStatus.DEVELOPING
    assert "one answer is not enough" in s.reason.lower()


def test_two_independent_correct_answers_give_good_evidence():
    s = concept_state([point("correct", 1), point("correct")], NOW)
    assert s.status is ConceptStatus.GOOD_EVIDENCE and s.independent_successes == 2


def test_correct_with_hints_stays_developing():
    s = concept_state([point("correct", 1, hints_used=2), point("correct", hints_used=1)], NOW)
    assert s.status is ConceptStatus.DEVELOPING and "hints" in s.reason


def test_incorrect_answers_need_practice_and_recent_evidence_counts_more():
    assert concept_state([point("incorrect"), point("partially_correct")], NOW).status is ConceptStatus.NEEDS_PRACTICE
    # An old failure followed by two recent independent successes: good evidence.
    s = concept_state([point("incorrect", 60), point("correct", 1), point("correct")], NOW)
    assert s.status is ConceptStatus.GOOD_EVIDENCE


def test_evidence_weights():
    base = evidence_weight(point("correct"), NOW)
    assert evidence_weight(point("correct", hints_used=2), NOW) < base
    assert evidence_weight(point("correct", exam=True), NOW) > base
    assert evidence_weight(point("correct", general_knowledge=True), NOW) < base
    assert abs(evidence_weight(point("correct", 14), NOW) - base / 2) < 1e-9  # 14-day half-life


def test_routing_table_gives_different_activities_per_response_state():
    """FR-07: at least three response states lead to different next activities."""
    def route(verdict, hints=0):
        return next_step(LastResult(verdict=verdict, difficulty="intermediate", hints_used=hints,
                                    gaps=["chain rule"], misconception=None))

    incorrect, partial = route("incorrect"), route("partially_correct")
    hinted, independent, unclear = route("correct", hints=2), route("correct"), route("insufficient_evidence")
    assert (incorrect.activity_type, incorrect.difficulty) == (ActivityType.EXPLAIN_AND_CHECK, Difficulty.INTRODUCTORY)
    assert (partial.activity_type, partial.focus) == (ActivityType.TARGETED_PRACTICE, "chain rule")
    assert hinted.activity_type is ActivityType.REVIEW
    assert (independent.activity_type, independent.difficulty) == (ActivityType.TRANSFER, Difficulty.ADVANCED)
    assert unclear.activity_type is ActivityType.DIAGNOSTIC
    assert len({r.activity_type for r in (incorrect, partial, hinted, independent, unclear)}) == 5


def test_first_step_depends_on_concept_state():
    assert first_step(concept_state([], NOW)).activity_type is ActivityType.DIAGNOSTIC
    good = concept_state([point("correct", 1), point("correct")], NOW)
    assert first_step(good).activity_type is ActivityType.TRANSFER


def test_evaluation_cleanup_removes_rubric_label_artifacts():
    """Seen with llama3.1:8b: gaps carrying '(missing idea)', alternatives listed as gaps, no strengths."""
    from app.ai.agents.assessment import AnswerEvaluation
    from app.modules.study.service import _consistent

    raw = AnswerEvaluation(
        verdict="correct", confidence="high", strengths=[],
        covered_ideas=["Low training error but high test error"],
        gaps=["The model has memorized noise in the training set (missing idea)",
              "Acceptable alternative: The model is too good at fitting the training data (missing idea)",
              "Low training error but high test error"],
    )
    rubric = {"acceptable_alternatives": ["The model is too good at fitting the training data."]}
    ev = _consistent(raw, general_knowledge=True, rubric=rubric)
    assert ev.gaps == ["The model has memorized noise in the training set"]
    assert ev.strengths == ["You explained: Low training error but high test error"]
    assert (ev.verdict, ev.confidence) == ("partially_correct", "medium")


def test_all_required_ideas_covered_means_correct():
    """Seen with llama3.1:8b: every required idea covered, yet 'partially_correct' with style-only gaps."""
    from app.ai.agents.assessment import AnswerEvaluation
    from app.modules.study.service import _consistent

    rubric = {"required_ideas": ["too complex", "memorizes noise", "low train error, high test error"]}
    raw = AnswerEvaluation(verdict="partially_correct", confidence="medium", strengths=[],
                           covered_ideas=["too complex", "memorizes noise", "low train error, high test error"],
                           gaps=["could be explained more clearly"])
    assert (_consistent(raw, False, rubric).verdict, _consistent(raw, False, rubric).gaps) == ("correct", [])
    # A stated misconception keeps it from being correct.
    wrong = raw.model_copy(update={"misconception": "Overfitting means the model is too simple"})
    assert _consistent(wrong, False, rubric).verdict == "partially_correct"
    # Missing ideas keep it partial.
    partial = raw.model_copy(update={"covered_ideas": ["too complex"], "gaps": ["memorizes noise"]})
    assert _consistent(partial, False, rubric).verdict == "partially_correct"
