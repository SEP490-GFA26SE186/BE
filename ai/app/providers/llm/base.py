"""LLM port (spec 9.1). Story-specific: one method, used by story generation and analysis.

Real providers only read `contents` / `response_schema` / limits; `frame` exists for the mock.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel

from app.schemas.analyze import StoryAnalyzeRequest
from app.schemas.story import StoryGenerateRequest


@dataclass(frozen=True)
class Turn:
    role: Literal["user", "model"]
    text: str


@dataclass(frozen=True)
class StoryLLMCall:
    # `frame` is in the port although Gemini ignores it: it is the price for the mock to
    # build an output that fits the frame (and read `__force`) without parsing the prompt
    # back. Kept explicit here rather than hidden behind another abstraction (spec 9.1).
    frame: StoryGenerateRequest | StoryAnalyzeRequest  # analysis: family-story spec 5.3
    contents: list[Turn]  # multi-turn; includes the fix-up turn on a retry (spec 8.2)
    response_schema: type[BaseModel]
    max_output_tokens: int  # text cap + thinking budget (the value sent to the SDK)
    temperature: float | None  # None = SDK default


@dataclass(frozen=True)
class LLMResult:
    text: str
    input_tokens: int
    output_tokens: int  # includes thinking tokens: both are billed as output
    finish_reason: str  # normalised enum name: "STOP" | "MAX_TOKENS" | ...


class LLMProvider(Protocol):
    name: str
    model: str | None

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        """Send the turns, return raw JSON text + token counts.

        Raises AiError for the provider's own failures. SAFETY_BLOCKED carries
        `call_tokens` of the blocked response; PROVIDER_ERROR / TIMEOUT carry none.
        MAX_TOKENS is NOT an error: it comes back as a normal LLMResult.
        """
        ...
