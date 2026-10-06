"""LLM list shape -> wire dict shape (spec 3.2, 5.4, 5.5).

Order is mandatory: parse -> validate on the lists -> map to dicts. Mapping first would let
a dict silently swallow a duplicate page_id, so `map_to_response` runs only AFTER validation
(in M1, where there is no validator yet, after parsing).
"""

from pydantic import TypeAdapter, ValidationError

from app.schemas.common import OutputWarning, Usage
from app.schemas.llm import LlmCheckpoint, LlmStoryOutput
from app.schemas.story import CheckpointOut, PageOut, StoryGenerateRequest, StoryGenerateResponse

_CHECKPOINT_OUT: TypeAdapter[CheckpointOut] = TypeAdapter(CheckpointOut)


def parse_llm_output(text: str) -> LlmStoryOutput | None:
    """Parse the raw LLM text. `None` when it is not valid JSON of the list shape; never raises.

    A ```json code fence is NOT stripped: structured output (response_schema +
    application/json) never returns one, so a fenced reply is treated as unparseable.
    """
    try:
        return LlmStoryOutput.model_validate_json(text)
    except ValidationError:
        return None


def _checkpoint_wire(cp: LlmCheckpoint) -> dict[str, object]:
    wire: dict[str, object] = {"type": cp.type, "question": cp.question}
    match cp.type:
        case "emotion_self" | "emotion_other":
            wire |= {"answer": cp.answer, "hint": cp.hint}
        case "perspective":
            # Keyed by option_id.
            wire |= {
                "options": {o.option_id: o.text for o in cp.options},
                "answer": cp.answer,
                "hint": cp.hint,
            }
        case "problem_solving":
            # Keyed by role.
            wire["options"] = {o.role: {"text": o.text, "feedback": o.feedback} for o in cp.options}
    return wire


def map_to_response(
    req: StoryGenerateRequest,
    output: LlmStoryOutput,
    warnings: list[OutputWarning],
    usage: Usage,
    prompt_version: str,
) -> StoryGenerateResponse:
    """Build the wire response. Raises `ValueError` (pydantic `ValidationError`) if the output
    does not fit the wire shape, e.g. an unknown emotion or a None option key."""
    return StoryGenerateResponse(
        request_id=req.request_id,
        pages={p.page_id: PageOut(scene=p.scene_id, text=p.text) for p in output.pages},
        scenes={s.scene_id: s.description for s in output.scenes},
        checkpoints={
            cp.checkpoint_id: _CHECKPOINT_OUT.validate_python(_checkpoint_wire(cp))
            for cp in output.checkpoints
        },
        warnings=warnings,
        prompt_version=prompt_version,
        usage=usage,
    )
