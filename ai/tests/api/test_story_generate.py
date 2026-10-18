import json
from pathlib import Path

import pytest

from app.deps import get_llm_provider
from app.providers.llm.mock import MockLLMProvider
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}
URL = "/v1/story/generate"
SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "story_request.json"


def _body(**over):
    body = json.loads(SAMPLE.read_text(encoding="utf-8"))
    body.update(over)
    return body


class CountingLLM:
    """Wraps the mock and counts calls; also counts how often the dependency built it."""

    name = "mock"
    model = "mock-v1"

    def __init__(self) -> None:
        self.calls = 0
        self.built = 0
        self._inner = MockLLMProvider()

    def factory(self):
        self.built += 1
        return self

    async def generate_story(self, call):
        self.calls += 1
        return await self._inner.generate_story(call)


@pytest.fixture
def llm(client):
    from app.main import app

    fake = CountingLLM()
    app.dependency_overrides[get_llm_provider] = fake.factory
    return fake


def test_sample_ok(client) -> None:
    r = client.post(URL, json=_body(), headers=H)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["request_id"] == "0f6c2d1e-demo"
    assert b["prompt_version"] == "story.v1"
    assert b["warnings"] == []
    assert list(b["pages"]) == [f"p{i}" for i in range(1, 9)]
    assert list(b["checkpoints"]) == ["k1", "k2", "k3", "k4"]
    u = b["usage"]
    assert u["provider"] == "mock" and u["model"] == "mock-v1"
    assert u["attempts"] == 1
    assert u["input_tokens"] > 0 and u["output_tokens"] > 0
    assert u["units"] == 0


def test_sample_response_has_the_shapes_node_reads(client) -> None:
    """Contract with Node: api/.../lib/persistPlan.js and stories.generation.store.js."""
    r = client.post(URL, json=_body(), headers=H)
    assert r.status_code == 200, r.text
    b = r.json()

    assert set(b) == {"request_id", "pages", "scenes", "checkpoints", "warnings",
                      "prompt_version", "usage"}
    for page in b["pages"].values():
        assert set(page) == {"scene", "text"}
        assert isinstance(page["text"], str)
        assert page["scene"] in b["scenes"]  # persistPlan rejects a dangling scene
    assert all(isinstance(d, str) and d for d in b["scenes"].values())

    cps = b["checkpoints"]
    assert set(cps["k1"]) == {"type", "question", "answer", "hint"}
    assert cps["k1"]["type"] == "emotion_self"
    assert cps["k1"]["answer"] in {"happy", "sad", "angry", "scared", "neutral"}

    k2 = cps["k2"]
    assert set(k2) == {"type", "question", "options", "answer", "hint"}
    assert k2["type"] == "perspective"
    assert set(k2["options"]) == {"o1", "o2", "o3"}  # dict keyed by option_id
    assert all(isinstance(t, str) for t in k2["options"].values())
    assert k2["answer"] in k2["options"]

    k3 = cps["k3"]
    assert set(k3) == {"type", "question", "options"}
    assert k3["type"] == "problem_solving"
    assert set(k3["options"]) == {"constructive", "avoidant", "impulsive"}  # keyed by role
    for option in k3["options"].values():
        assert set(option) == {"text", "feedback"}

    assert cps["k4"] == {"type": "reflection", "question": cps["k4"]["question"]}

    u = b["usage"]
    assert isinstance(u["provider"], str) and isinstance(u["model"], str)
    for key in ("input_tokens", "output_tokens", "estimated_cost_micros"):
        assert isinstance(u[key], int)


def test_custom_20_pages(client) -> None:
    body = _body(
        pages=[f"p{i}" for i in range(1, 21)],
        checkpoints=[
            {"id": "k1", "type": "emotion_self", "after": "p2"},
            {"id": "k2", "type": "perspective", "after": "p5", "target": "{NV2}"},
            {"id": "k3", "type": "emotion_other", "after": "p8", "target": "{NV2}"},
            {"id": "k4", "type": "problem_solving", "after": "p11"},
            {"id": "k5", "type": "perspective", "after": "p15", "target": "{NV3}"},
            {"id": "k6", "type": "reflection", "after": "p20"},
        ],
    )
    r = client.post(URL, json=body, headers=H)
    assert r.status_code == 200, r.text
    assert len(r.json()["pages"]) == 20
    assert len(r.json()["checkpoints"]) == 6


def test_real_name_in_situation_blocks_before_llm(client, llm) -> None:
    r = client.post(URL, json=_body(situation="An hay giành xe với {NV2}."), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "FORBIDDEN_TERM_DETECTED"
    assert "usage" not in r.json()
    assert llm.calls == 0


def test_real_name_in_character_description_blocks(client, llm) -> None:
    body = _body()
    body["characters"][1]["description"] = "em trai Bin, 4 tuổi"
    r = client.post(URL, json=body, headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "FORBIDDEN_TERM_DETECTED"
    assert llm.calls == 0


def test_real_name_in_topic_guidance_is_not_scanned(client, llm) -> None:
    # Spec 3.1: topic fields are written by experts and are not scanned.
    body = _body()
    body["topic"]["guidance"] = "An toàn là trên hết. Anh chị em nhường nhau."
    r = client.post(URL, json=body, headers=H)
    assert r.status_code == 200, r.text
    assert llm.calls == 1


def test_force_safety_blocked_has_usage(client) -> None:
    r = client.post(URL, json=_body(__force="SAFETY_BLOCKED"), headers=H)
    assert r.status_code == 422
    b = r.json()
    assert b["error"]["code"] == "SAFETY_BLOCKED"
    assert b["error"]["retryable"] is False
    assert b["usage"]["attempts"] == 1
    assert b["usage"]["provider"] == "mock"
    assert b["usage"]["input_tokens"] > 0


@pytest.mark.parametrize("force,status", [("PROVIDER_ERROR", 502), ("TIMEOUT", 504)])
def test_force_provider_failures_have_no_usage(client, force, status) -> None:
    r = client.post(URL, json=_body(__force=force), headers=H)
    assert r.status_code == status
    b = r.json()
    assert b["error"]["code"] == force
    assert b["error"]["retryable"] is True
    assert "usage" not in b


def test_force_output_invalid_has_usage(client) -> None:
    r = client.post(URL, json=_body(__force="OUTPUT_INVALID"), headers=H)
    assert r.status_code == 502
    b = r.json()
    assert b["error"]["code"] == "OUTPUT_INVALID"
    assert b["error"]["retryable"] is False
    # Attempt 1 + one internal retry, both summed (spec 8.3).
    assert b["usage"]["attempts"] == 2
    assert b["usage"]["output_tokens"] > 0


def test_force_invalid_output_once_succeeds_on_retry(client, llm) -> None:
    r = client.post(URL, json=_body(__force="INVALID_OUTPUT_ONCE"), headers=H)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["usage"]["attempts"] == 2
    assert b["warnings"] == []
    assert llm.calls == 2


@pytest.fixture
def gemini_settings(settings):
    from app.config import get_settings
    from app.main import app

    s = settings.model_copy(
        update={
            "llm_provider": "gemini",
            "gemini_api_key": "fake-key",
            "gemini_text_model": "fake-model",
        }
    )
    app.dependency_overrides[get_settings] = lambda: s
    return s


def test_force_rejected_when_provider_is_not_mock(client, gemini_settings, llm) -> None:
    # Review Focus 3 (spec 3.11.7): 422 INVALID_INPUT, provider never built nor called.
    r = client.post(URL, json=_body(__force="SAFETY_BLOCKED"), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert llm.built == 0
    assert llm.calls == 0


def test_force_in_old_envelope_is_unknown_field(client, gemini_settings, llm) -> None:
    body = {**_body(), "input": {"__force": "SAFETY_BLOCKED"}}
    r = client.post(URL, json=body, headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert llm.calls == 0


def test_unknown_field_is_invalid_input(client, llm) -> None:
    r = client.post(URL, json=_body(forbiden_terms=["An"]), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert llm.calls == 0


def test_requires_internal_token(client, llm) -> None:
    r = client.post(URL, json=_body())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert llm.calls == 0
