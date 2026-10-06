"""`ScriptedLLMProvider`: plays a fixed list of steps, one per call (spec 10.1).

Each step is an `LLMResult` to return or an `AiError` to raise. Every `StoryLLMCall` received
is recorded in `calls`, so tests can assert on turns, temperature and token caps.
"""

from app.errors import AiError
from app.providers.llm.base import LLMResult, StoryLLMCall
from app.schemas.llm import LlmStoryOutput


def result(
    output: LlmStoryOutput | str,
    *,
    input_tokens: int = 100,
    output_tokens: int = 200,
    finish_reason: str = "STOP",
) -> LLMResult:
    """An `LLMResult` from a parsed output (dumped to JSON) or raw text."""
    text = output if isinstance(output, str) else output.model_dump_json()
    return LLMResult(
        text=text,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        finish_reason=finish_reason,
    )


class ScriptedLLMProvider:
    name = "scripted"
    model = "scripted-v1"

    def __init__(self, steps: list[LLMResult | AiError]) -> None:
        self._steps = list(steps)
        self.calls: list[StoryLLMCall] = []

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        self.calls.append(call)
        if not self._steps:
            raise AssertionError(f"unexpected LLM call #{len(self.calls)}")
        step = self._steps.pop(0)
        if isinstance(step, AiError):
            raise step
        return step
