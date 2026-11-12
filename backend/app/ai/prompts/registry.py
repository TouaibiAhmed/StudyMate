"""Versioned prompt templates.

Layout:  app/ai/prompts/templates/<name>/v<N>.system.j2  and  v<N>.user.j2
Shared partials live in templates/_shared/ and are pulled in with {% include %}.

A prompt is identified as "<name>@v<N>". The version is stored with every AI output so a
grade or a generated exam can always be traced back to the exact prompt that produced it.
Changing a prompt's wording = add a new version file; never edit a released version in place.
"""

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from app.ai.llm.types import ChatMessage

TEMPLATES_DIR = Path(__file__).parent / "templates"
_VERSION_RE = re.compile(r"^v(\d+)\.system\.j2$")

_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    undefined=StrictUndefined,
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=False,
)


@dataclass(frozen=True)
class Prompt:
    name: str
    version: int

    @property
    def id(self) -> str:
        return f"{self.name}@v{self.version}"

    def render(self, **variables: Any) -> list[ChatMessage]:
        system = _env.get_template(f"{self.name}/v{self.version}.system.j2").render(**variables).strip()
        user = _env.get_template(f"{self.name}/v{self.version}.user.j2").render(**variables).strip()
        return [ChatMessage("system", system), ChatMessage("user", user)]


def available_versions(name: str) -> list[int]:
    folder = TEMPLATES_DIR / name
    if not folder.is_dir():
        return []
    return sorted(int(m.group(1)) for f in folder.iterdir() if (m := _VERSION_RE.match(f.name)))


@lru_cache
def get_prompt(name: str, version: int | None = None) -> Prompt:
    """Return a pinned version, or the latest one when `version` is None."""
    versions = available_versions(name)
    if not versions:
        raise KeyError(f"No prompt templates named {name!r}")
    chosen = version if version is not None else versions[-1]
    if chosen not in versions:
        raise KeyError(f"Prompt {name!r} has no version v{chosen}")
    return Prompt(name, chosen)
