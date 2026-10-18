"""Input of every rule (spec 7.2)."""

from dataclasses import dataclass

from app.schemas.llm import LlmStoryOutput
from app.schemas.story import StoryGenerateRequest


@dataclass(frozen=True)
class ValidationContext:
    frame: StoryGenerateRequest
    output: LlmStoryOutput
    attempt: int
