"""LLM outputs for tests (spec 10.1).

`valid_output(frame)` is the same builder the mock provider uses (plan adjustment 5): one
source of truth for "a valid output for any frame". The corruption helpers below each change
exactly one thing and return a deep copy (Tasks 10-11 add more as rules get real checks).
"""

from typing import Any

from app.providers.llm.mock import build_valid_output
from app.schemas.llm import LlmOption, LlmScene, LlmStoryOutput
from app.schemas.story import StoryGenerateRequest


def valid_output(frame: StoryGenerateRequest) -> LlmStoryOutput:
    return build_valid_output(frame)


def _copy(out: LlmStoryOutput) -> LlmStoryOutput:
    return out.model_copy(deep=True)


def _page(out: LlmStoryOutput, page_id: str):
    return next(p for p in out.pages if p.page_id == page_id)


def _checkpoint(out: LlmStoryOutput, checkpoint_id: str):
    return next(c for c in out.checkpoints if c.checkpoint_id == checkpoint_id)


def drop_page(out: LlmStoryOutput, page_id: str) -> LlmStoryOutput:
    out = _copy(out)
    out.pages = [p for p in out.pages if p.page_id != page_id]
    return out


def duplicate_page(out: LlmStoryOutput, page_id: str) -> LlmStoryOutput:
    out = _copy(out)
    out.pages.append(_page(out, page_id).model_copy())
    return out


def add_unknown_page(out: LlmStoryOutput, page_id: str = "p99") -> LlmStoryOutput:
    out = _copy(out)
    out.pages.append(out.pages[-1].model_copy(update={"page_id": page_id}))
    return out


def set_page_text(out: LlmStoryOutput, page_id: str, text: str) -> LlmStoryOutput:
    out = _copy(out)
    _page(out, page_id).text = text
    return out


def set_scene_of_page(out: LlmStoryOutput, page_id: str, scene_id: str) -> LlmStoryOutput:
    out = _copy(out)
    _page(out, page_id).scene_id = scene_id
    return out


def add_scenes(out: LlmStoryOutput, count: int) -> LlmStoryOutput:
    out = _copy(out)
    start = len(out.scenes) + 1
    out.scenes += [
        LlmScene(scene_id=f"s{n}", description="extra scene") for n in range(start, start + count)
    ]
    return out


def set_checkpoint_field(
    out: LlmStoryOutput, checkpoint_id: str, field: str, value: Any
) -> LlmStoryOutput:
    out = _copy(out)
    setattr(_checkpoint(out, checkpoint_id), field, value)
    return out


def set_options(
    out: LlmStoryOutput, checkpoint_id: str, options: list[LlmOption]
) -> LlmStoryOutput:
    out = _copy(out)
    _checkpoint(out, checkpoint_id).options = options
    return out
