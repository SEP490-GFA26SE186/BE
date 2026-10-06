"""Node <-> ai compatibility (Task 16, spec 11).

The payload below is hand-written to be exactly what
`api/src/modules/stories/lib/aiRequest.js` `buildAiRequest` builds for a `long` story
(`story_layout.long` in `api/prisma/seed_platform_settings.js`; limits = the 8
`limits.*` keys of `api/src/modules/stories/lib/storySettings.js`). Node-side quirks kept:
`situation` may be null, a character `description` may be "" (no appearance), `target`
appears only on `perspective` / `emotion_other`, `__force` sits at the TOP level
(`api/src/workers/ai.processor.js`).
"""

import copy

import pytest

from app.errors import NON_RETRYABLE, ErrorCode
from app.schemas.common import ForceCode
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}
URL = "/v1/story/generate"

NODE_LONG_PAYLOAD = {
    "request_id": "9b2f0c6e-1d4a-4f7e-a3c1-0e5d2b7a9f10",
    "topic": {
        "title": "Con hay nổi giận",
        "competency": "self_management",
        "guidance": "Giúp trẻ nhận ra dấu hiệu của cơn giận và chọn cách hạ nhiệt.",
    },
    "characters": [
        {"token": "{NV1}", "description": "bé trai 6 tuổi, áo xanh", "is_main": True},
        {"token": "{NV2}", "description": "", "is_main": False},
    ],
    "situation": None,
    "tone": "gentle",
    "pages": [f"p{n}" for n in range(1, 11)],
    "checkpoints": [
        {"id": "k1", "type": "emotion_self", "after": "p2"},
        {"id": "k2", "type": "perspective", "after": "p4", "target": "{NV2}"},
        {"id": "k3", "type": "problem_solving", "after": "p6"},
        {"id": "k4", "type": "emotion_other", "after": "p8", "target": "{NV2}"},
        {"id": "k5", "type": "reflection", "after": "p10"},
    ],
    "limits": {
        "page_min_words": 20,
        "page_max_words": 70,
        "sentence_max_words": 15,
        "question_max_words": 15,
        "option_max_words": 12,
        "hint_max_words": 20,
        "feedback_max_words": 25,
        "max_scenes": 4,
    },
    "forbidden_terms": ["Bin", "Na"],
    "blocked_keywords": [{"keyword": "đánh", "severity": "warn"}],
}

# Hand copy of NON_RETRYABLE_ERROR_CODES in api/src/clients/aiClient.js.
NODE_NON_RETRYABLE = {"INVALID_INPUT", "FORBIDDEN_TERM_DETECTED", "SAFETY_BLOCKED", "OUTPUT_INVALID"}
ALL_CODES = {c.value for c in ErrorCode}


def _payload(force: str | None = None) -> dict:
    body = copy.deepcopy(NODE_LONG_PAYLOAD)
    if force is not None:
        body["__force"] = force
    return body


def test_node_and_ai_agree_on_non_retryable() -> None:
    assert {c.value for c in NON_RETRYABLE} == NODE_NON_RETRYABLE


def test_node_long_payload_succeeds_with_fields_node_reads(client) -> None:
    r = client.post(URL, json=_payload(), headers=H)
    assert r.status_code == 200, r.text
    b = r.json()
    # persistPlan.js reads pages[label].{text,scene}, scenes[key], checkpoints[label].question
    assert list(b["pages"]) == [f"p{n}" for n in range(1, 11)]
    for page in b["pages"].values():
        assert isinstance(page["text"], str) and page["scene"] in b["scenes"]
    assert list(b["checkpoints"]) == ["k1", "k2", "k3", "k4", "k5"]
    assert b["checkpoints"]["k4"]["answer"] in {"happy", "sad", "angry", "scared", "neutral"}
    # stories.generation.store.js succeededData reads these usage keys.
    for key in ("provider", "model", "input_tokens", "output_tokens", "estimated_cost_micros"):
        assert key in b["usage"]


@pytest.mark.parametrize("force", [c.value for c in ForceCode])
def test_every_force_code_gives_a_body_node_can_classify(client, force: str) -> None:
    r = client.post(URL, json=_payload(force), headers=H)
    if force == ForceCode.INVALID_OUTPUT_ONCE:
        assert r.status_code == 200, r.text
        assert r.json()["usage"]["attempts"] == 2
        return
    err = r.json()["error"]
    assert set(err) == {"code", "message", "retryable"}
    assert err["code"] == force and err["code"] in ALL_CODES
    assert err["retryable"] is (err["code"] not in NODE_NON_RETRYABLE)


def test_force_inside_nested_object_is_invalid_input(client) -> None:
    body = _payload()
    body["topic"]["__force"] = "SAFETY_BLOCKED"
    r = client.post(URL, json=body, headers=H)
    assert r.status_code == 422
    assert r.json()["error"] == {
        "code": "INVALID_INPUT",
        "message": r.json()["error"]["message"],
        "retryable": False,
    }
