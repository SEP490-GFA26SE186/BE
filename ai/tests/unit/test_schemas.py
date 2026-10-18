import copy
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.common import FileSafeId, ForceCode, StorageKey
from app.schemas.images import PortraitRequest, SceneRequest
from app.schemas.story import StoryGenerateRequest, StoryGenerateResponse
from app.schemas.tts import TtsRequest
from tests.fixtures.frames import make_frame, make_limits

SAMPLES = Path(__file__).resolve().parents[2] / "docs" / "samples"


def load(name: str) -> dict:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


@pytest.fixture
def payload() -> dict:
    return load("story_request.json")


def test_sample_request_parses(payload: dict) -> None:
    req = StoryGenerateRequest.model_validate(payload)
    assert req.force_ is None
    assert len(req.pages) == 8


def test_node_shaped_payload_with_force() -> None:
    # Shaped like api/src/modules/stories/lib/aiRequest.js output.
    node = {
        "request_id": "3f2b8c1e-5d7a-4c11-9a52-0b1e6f3d9a10",
        "topic": {"title": "Con hay nổi giận", "competency": "self_management", "guidance": "g"},
        "characters": [
            {"token": "{NV1}", "description": "", "is_main": True},
            {"token": "{NV2}", "description": "em trai", "is_main": False},
        ],
        "situation": None,
        "tone": "gentle",
        "pages": ["p1", "p2", "p3"],
        "checkpoints": [
            {"id": "k1", "type": "emotion_self", "after": "p2"},
            {"id": "k2", "type": "reflection", "after": "p3"},
        ],
        "limits": make_limits(),
        "forbidden_terms": [],
        "blocked_keywords": [],
        "__force": "SAFETY_BLOCKED",
    }
    req = StoryGenerateRequest.model_validate(node)
    assert req.force_ == ForceCode.SAFETY_BLOCKED
    assert req.situation is None
    assert req.characters[0].description == ""
    assert req.checkpoints[0].target is None


def test_force_settable_by_python_name(payload: dict) -> None:
    req = StoryGenerateRequest.model_validate({**payload, "force_": "TIMEOUT"})
    assert req.force_ == ForceCode.TIMEOUT


@pytest.mark.parametrize(
    "code",
    ["SAFETY_BLOCKED", "PROVIDER_ERROR", "TIMEOUT", "OUTPUT_INVALID", "INVALID_OUTPUT_ONCE"],
)
def test_all_force_codes_accepted(payload: dict, code: str) -> None:
    assert StoryGenerateRequest.model_validate({**payload, "__force": code}).force_ == code


def test_unknown_force_value_rejected(payload: dict) -> None:
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate({**payload, "__force": "BOOM"})


def test_force_inside_nested_object_rejected(payload: dict) -> None:
    payload["limits"]["__force"] = "TIMEOUT"
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)
    payload = load("story_request.json")
    payload["topic"]["__force"] = "TIMEOUT"
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


def test_unknown_top_level_field_rejected(payload: dict) -> None:
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate({**payload, "extra": 1})


def test_unknown_field_in_limits_rejected(payload: dict) -> None:
    payload["limits"]["nope"] = 1
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


def test_unknown_field_in_character_rejected(payload: dict) -> None:
    payload["characters"][0]["nope"] = 1
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


def test_typo_forbiden_terms_rejected(payload: dict) -> None:
    payload["forbiden_terms"] = payload.pop("forbidden_terms")
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


def test_missing_limits_rejected(payload: dict) -> None:
    del payload["limits"]
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


def test_limits_must_be_positive(payload: dict) -> None:
    payload["limits"]["max_scenes"] = 0
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


@pytest.mark.parametrize("field", ["page_target_min_words", "page_target_max_words"])
def test_page_target_is_required(payload: dict, field: str) -> None:
    # The target is a backend number like every other limit (docs/01): no service default.
    del payload["limits"][field]
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(payload)


@pytest.mark.parametrize(
    ("target_min", "target_max"),
    [(19, 60), (40, 71), (61, 60)],  # below page_min, above page_max, inverted
)
def test_page_target_must_sit_inside_min_max(payload: dict, target_min: int, target_max: int) -> None:
    payload["limits"].update(page_target_min_words=target_min, page_target_max_words=target_max)
    with pytest.raises(ValidationError) as exc:
        StoryGenerateRequest.model_validate(payload)
    assert "page_target" in str(exc.value)


def test_page_target_may_touch_the_bounds(payload: dict) -> None:
    payload["limits"].update(page_target_min_words=20, page_target_max_words=70)
    StoryGenerateRequest.model_validate(payload)


REFERENCE_CASES = {
    "duplicate_page": lambda p: p["pages"].append("p3"),
    "duplicate_checkpoint_id": lambda p: p["checkpoints"][1].update(id="k1"),
    "after_not_in_pages": lambda p: p["checkpoints"][0].update(after="p99"),
    "two_checkpoints_same_page": lambda p: p["checkpoints"][1].update(after="p2"),
    "no_main": lambda p: p["characters"][0].update(is_main=False),
    "two_main": lambda p: p["characters"][1].update(is_main=True),
    "perspective_missing_target": lambda p: p["checkpoints"][1].pop("target"),
    "emotion_other_missing_target": lambda p: p["checkpoints"][0].update(type="emotion_other"),
    "target_not_declared": lambda p: p["checkpoints"][1].update(target="{NV9}"),
    "token_NV1": lambda p: p["characters"][0].update(token="NV1"),
    "token_braced_lower": lambda p: p["characters"][0].update(token="{nv1}"),
    "duplicate_token": lambda p: p["characters"][1].update(token="{NV1}"),
    "no_pages": lambda p: (p.update(pages=[]), p.update(checkpoints=[])),
}


@pytest.mark.parametrize("name", list(REFERENCE_CASES))
def test_reference_integrity_failures(payload: dict, name: str) -> None:
    p = copy.deepcopy(payload)
    REFERENCE_CASES[name](p)
    with pytest.raises(ValidationError):
        StoryGenerateRequest.model_validate(p)


def test_reference_error_names_the_id(payload: dict) -> None:
    payload["pages"].append("p3")
    with pytest.raises(ValidationError) as exc:
        StoryGenerateRequest.model_validate(payload)
    assert "p3" in str(exc.value)


def test_story_policy_is_not_enforced() -> None:
    make_frame("custom", pages=3)
    make_frame("custom", pages=25)
    make_frame("custom", pages=5, checkpoints=[("emotion_self", 1)])
    make_frame("custom", pages=6, checkpoints=[("reflection", 3), ("emotion_self", 6)])
    for length in ("short", "medium", "long"):
        make_frame(length)


@pytest.mark.parametrize("key", ["stories/abc/pages/3", "stories/abc/", "a..b/c", "a", "a" * 200])
def test_storage_key_accepts(key: str) -> None:
    assert TypeAdapter(StorageKey).validate_python(key) == key


@pytest.mark.parametrize(
    "key", ["a/../b", "..", "/abs", "a\\b", "a b", "a?b", "", "a" * 201, "a/.."]
)
def test_storage_key_rejects(key: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(StorageKey).validate_python(key)


def test_file_safe_id() -> None:
    ta = TypeAdapter(FileSafeId)
    uid = "3f2b8c1e-5d7a-4c11-9a52-0b1e6f3d9a10"
    assert ta.validate_python(uid) == uid
    for bad in ["a/b", "..", ".", "a" * 101, "", "a b"]:
        with pytest.raises(ValidationError):
            ta.validate_python(bad)


def test_response_sample_parses() -> None:
    raw = load("story_response.json")
    resp = StoryGenerateResponse.model_validate(raw)
    assert resp.checkpoints["k3"].type == "problem_solving"
    assert resp.checkpoints["k1"].type == "emotion_self"
    assert resp.pages["p1"].scene == "s1"
    assert resp.model_dump(mode="json")["checkpoints"] == raw["checkpoints"]


def test_image_and_tts_requests_validate_paths() -> None:
    ok = PortraitRequest.model_validate(
        {"request_id": "r1", "storage_prefix": "stories/a/", "description": "d", "forbidden_terms": []}
    )
    assert ok.storage_prefix == "stories/a/"
    with pytest.raises(ValidationError):
        PortraitRequest.model_validate(
            {"request_id": "r1", "storage_prefix": "../x", "description": "d", "forbidden_terms": []}
        )
    with pytest.raises(ValidationError):
        TtsRequest.model_validate(
            {"request_id": "a/b", "storage_prefix": "p", "text": "t", "voice_id": "v"}
        )
    with pytest.raises(ValidationError):
        SceneRequest.model_validate(
            {
                "request_id": "r1",
                "storage_prefix": "p",
                "scene_description": "s",
                "characters": [{"description": "d", "portrait_key": "a/../b"}],
                "forbidden_terms": [],
            }
        )
    scene = SceneRequest.model_validate(
        {
            "request_id": "r1",
            "storage_prefix": "p",
            "scene_description": "s",
            "characters": [{"description": "d"}],
            "forbidden_terms": [],
            "__force": "TIMEOUT",
        }
    )
    assert scene.force_ == ForceCode.TIMEOUT
