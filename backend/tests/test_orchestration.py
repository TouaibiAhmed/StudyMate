from enum import StrEnum

import pytest

from app.orchestration.budget import BudgetExceeded, CallBudget
from app.orchestration.state_machine import IllegalTransition, StateMachine


class Exam(StrEnum):
    READY = "ready"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    EXPIRED = "expired"


EXAM = StateMachine.build(
    "exam_attempt",
    [(Exam.READY, Exam.IN_PROGRESS), (Exam.IN_PROGRESS, Exam.SUBMITTED), (Exam.IN_PROGRESS, Exam.EXPIRED)],
    terminal=[Exam.SUBMITTED, Exam.EXPIRED],
)


def test_allowed_and_illegal_transitions():
    assert EXAM.check(Exam.READY, Exam.IN_PROGRESS) is Exam.IN_PROGRESS
    with pytest.raises(IllegalTransition):
        EXAM.check(Exam.SUBMITTED, Exam.IN_PROGRESS)
    assert EXAM.is_terminal(Exam.EXPIRED)


def test_action_guard_blocks_hints_during_exam():
    with pytest.raises(IllegalTransition, match="hint"):
        EXAM.require(Exam.IN_PROGRESS, allowed=[Exam.SUBMITTED, Exam.EXPIRED], action="hint")


def test_call_budget():
    budget = CallBudget(limit=2)
    budget.spend()
    budget.spend()
    assert budget.remaining == 0
    with pytest.raises(BudgetExceeded):
        budget.spend()
