import json
from pathlib import Path

from app.core.mapping import map_to_response, parse_llm_output
from app.schemas.common import Usage
from app.schemas.story import StoryGenerateRequest

SAMPLES = Path(__file__).resolve().parents[2] / "docs" / "samples"


def _load(name: str) -> str:
    return (SAMPLES / name).read_text(encoding="utf-8")


def _sample_request() -> StoryGenerateRequest:
    return StoryGenerateRequest.model_validate_json(_load("story_request.json"))


def test_map_sample_matches_node_fixture() -> None:
    # story_response.json is the fixture Node consumes: the dict shape must match it exactly.
    expected = json.loads(_load("story_response.json"))
    output = parse_llm_output(_load("story_llm_output.json"))
    assert output is not None
    usage = Usage(provider="mock", model="mock-v1", latency_ms=1)

    resp = map_to_response(_sample_request(), output, [], usage, "story.v1")
    wire = resp.model_dump(mode="json")

    assert wire["pages"] == expected["pages"]
    assert wire["scenes"] == expected["scenes"]
    assert wire["checkpoints"] == expected["checkpoints"]
    assert wire["request_id"] == expected["request_id"]
    assert wire["prompt_version"] == "story.v1"
    assert wire["warnings"] == []
    assert wire["usage"]["provider"] == "mock"


def test_parse_truncated_json_is_none() -> None:
    text = _load("story_llm_output.json")
    assert parse_llm_output(text[: len(text) // 2]) is None


def test_parse_wrong_shape_is_none() -> None:
    data = json.loads(_load("story_llm_output.json"))
    del data["pages"]
    assert parse_llm_output(json.dumps(data)) is None


def test_parse_non_object_is_none() -> None:
    assert parse_llm_output("[]") is None
    assert parse_llm_output("") is None


def test_parse_code_fence_is_not_stripped() -> None:
    # Decision: structured output never returns a ```json fence, so we do not strip one.
    # A fenced reply is treated as unparseable (the OUTPUT_SCHEMA_INVALID path).
    fenced = "```json\n" + _load("story_llm_output.json") + "\n```"
    assert parse_llm_output(fenced) is None
