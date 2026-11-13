from typing import Literal

from app.core.schemas import CamelModel

Kind = Literal["course", "roadmap"]


class RecommendationOut(CamelModel):
    kind: Kind
    item_id: str
    title: str
    subtitle: str
    description: str
    reason: str  # the main, human-readable reason
    reasons: list[str]
    score: float
    href: str


class FeedbackIn(CamelModel):
    kind: Kind
    item_id: str
    action: Literal["dismiss"] = "dismiss"
