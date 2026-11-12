"""A small explicit state machine for workflows (study session, exam attempt, generation jobs).

The doc (section 9.4) allows a plain Python state machine instead of LangGraph. Workflows here
are short and their state lives in Postgres, so an explicit transition table is enough, easy to
test, and makes illegal moves (e.g. a hint during an exam) impossible by construction.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Generic, TypeVar

from app.core.errors import ConflictError

S = TypeVar("S", bound=StrEnum)


class IllegalTransition(ConflictError):
    message = "This action is not allowed in the current state."


@dataclass(frozen=True)
class StateMachine(Generic[S]):
    name: str
    transitions: dict[S, frozenset[S]]
    terminal: frozenset[S] = frozenset()

    @classmethod
    def build(cls, name: str, edges: Iterable[tuple[S, S]], terminal: Iterable[S] = ()) -> "StateMachine[S]":
        table: dict[S, set[S]] = {}
        for src, dst in edges:
            table.setdefault(src, set()).add(dst)
            table.setdefault(dst, set())
        return cls(name, {k: frozenset(v) for k, v in table.items()}, frozenset(terminal))

    def can(self, current: S, target: S) -> bool:
        return target in self.transitions.get(current, frozenset())

    def check(self, current: S, target: S) -> S:
        if not self.can(current, target):
            raise IllegalTransition(f"{self.name}: cannot go from {current} to {target}.")
        return target

    def require(self, current: S, allowed: Iterable[S], action: str) -> None:
        """Guard an action (e.g. 'request hint') to a set of states."""
        allowed = set(allowed)
        if current not in allowed:
            raise IllegalTransition(f"{self.name}: '{action}' is not allowed while {current}.")

    def is_terminal(self, state: S) -> bool:
        return state in self.terminal
