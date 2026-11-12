"""Bounded model usage per session (doc 9.5: 'set a maximum number of model calls')."""

from dataclasses import dataclass

from app.core.errors import RateLimitedError


class BudgetExceeded(RateLimitedError):
    message = "This session has reached its AI usage limit. Start a new session to continue."


@dataclass
class CallBudget:
    limit: int
    used: int = 0

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.used)

    def spend(self, calls: int = 1) -> None:
        if self.used + calls > self.limit:
            raise BudgetExceeded()
        self.used += calls
