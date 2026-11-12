"""Field of study -> domain type (doc 12.2). Selects prompt style and rubric type.

Keyword rules give an instant, predictable answer. Free-text fields that match nothing fall
back to "conceptual"; the student can change it on the profile page.
"""

import re
from typing import Literal

DomainType = Literal["quantitative", "code-based", "conceptual", "argumentative", "language"]
DOMAIN_TYPES: tuple[str, ...] = ("quantitative", "code-based", "conceptual", "argumentative", "language")

_RULES: list[tuple[DomainType, tuple[str, ...]]] = [
    ("code-based", ("computer", "software", "programming", "data science", "cybersecurity", "network",
                    "information technology", "it", "ai", "machine learning", "web", "devops")),
    ("quantitative", ("math", "physics", "statistic", "engineering", "electrical", "mechanical", "civil",
                      "industrial", "finance", "accounting", "econometric", "chemistry")),
    ("language", ("language", "linguistic", "english", "french", "arabic", "spanish", "german", "translation")),
    ("argumentative", ("literature", "philosophy", "politic", "law", "sociology", "social science")),
]

# Fields where a "code-based" keyword would be misleading.
_FORCE_CONCEPTUAL = ("biology", "medicine", "pharmacy", "history", "psychology", "marketing", "management")


def _has(text: str, keyword: str) -> bool:
    # Match at a word start: "statistic" matches "statistics", "ai" does not match "maintenance".
    return re.search(rf"\b{re.escape(keyword)}", text) is not None


def classify_domain(*texts: str | None) -> DomainType:
    """Classify from the most specific text first (specialization, then domain, then field)."""
    for text in texts:
        if not text:
            continue
        t = text.strip().lower()
        if any(_has(t, k) for k in _FORCE_CONCEPTUAL):
            return "conceptual"
        for domain_type, keywords in _RULES:
            if any(_has(t, k) for k in keywords):
                return domain_type
    return "conceptual"
