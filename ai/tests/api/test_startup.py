"""Startup model check (lifespan) and the Gemini provider wiring. No network: fakes only."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.config import get_settings
from app.deps import get_llm_provider
from app.main import app
from app.providers.llm.gemini import GeminiLLMProvider
from tests.conftest import TOKEN
from tests.providers.test_gemini_provider import make_response, make_settings
from tests.fixtures.llm_outputs import valid_output
from app.schemas.story import StoryGenerateRequest

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "story_request.json"
H = {"X-Internal-Token": TOKEN}


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.clear()
    if hasattr(app.state, "llm_provider"):
        del app.state.llm_provider


class RecordingProvider:
    """Stands in for GeminiLLMProvider inside lifespan; never touches the SDK."""

    instances: list["RecordingProvider"] = []
    fail = False

    def __init__(self, settings, client=None) -> None:
        self.verified = 0
        RecordingProvider.instances.append(self)

    async def verify_model(self) -> None:
        self.verified += 1
        if RecordingProvider.fail:
            raise RuntimeError("model missing: GEMINI_TEXT_MODEL")


@pytest.fixture
def recording(monkeypatch):
    RecordingProvider.instances = []
    RecordingProvider.fail = False
    monkeypatch.setattr(main_module, "GeminiLLMProvider", RecordingProvider)
    return RecordingProvider


def test_lifespan_mock_never_builds_or_verifies_a_provider(settings, recording) -> None:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app):
        pass
    assert recording.instances == []


def test_lifespan_gemini_verifies_once_and_shares_provider(recording) -> None:
    settings = make_settings()
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app):
        assert len(recording.instances) == 1
        assert recording.instances[0].verified == 1
        assert app.state.llm_provider is recording.instances[0]


def test_lifespan_gemini_startup_fails_when_model_missing(recording) -> None:
    recording.fail = True
    app.dependency_overrides[get_settings] = lambda: make_settings()
    with pytest.raises(RuntimeError, match="GEMINI_TEXT_MODEL"):
        with TestClient(app):
            pass


def test_get_llm_provider_reuses_one_instance(monkeypatch) -> None:
    from types import SimpleNamespace

    built = []

    def fake_build(settings):
        built.append(settings)
        return object()

    monkeypatch.setattr("app.deps.GeminiLLMProvider", lambda s: fake_build(s))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    settings = make_settings()
    first = get_llm_provider(request, settings)
    second = get_llm_provider(request, settings)
    assert first is second
    assert len(built) == 1


def test_get_llm_provider_prefers_lifespan_instance() -> None:
    from types import SimpleNamespace

    shared = object()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(llm_provider=shared)))
    assert get_llm_provider(request, make_settings()) is shared


def test_endpoint_with_gemini_settings_and_fake_client(monkeypatch) -> None:
    from tests.providers.test_gemini_provider import FakeAsyncClient

    settings = make_settings(
        price_text_input_per_mtok_micros=1_000_000,
        price_text_output_per_mtok_micros=2_000_000,
    )
    body = json.loads(SAMPLE.read_text(encoding="utf-8"))
    frame = StoryGenerateRequest.model_validate(body)
    text = valid_output(frame).model_dump_json()
    fake = FakeAsyncClient(
        make_response(text=text, prompt_tokens=1000, candidates_tokens=500)
    )
    provider = GeminiLLMProvider(settings, client=fake)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_llm_provider] = lambda: provider

    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/v1/story/generate", json=body, headers=H)
    assert r.status_code == 200, r.text
    usage = r.json()["usage"]
    assert usage["provider"] == "gemini"
    assert usage["model"] == settings.gemini_text_model
    assert usage["input_tokens"] == 1000 and usage["output_tokens"] == 500
    assert usage["estimated_cost_micros"] == 1000 * 1 + 500 * 2
    assert len(fake.models.calls) == 1


def test_force_rejected_with_gemini_before_provider_is_built(monkeypatch) -> None:
    built = []
    monkeypatch.setattr("app.deps.GeminiLLMProvider", lambda s: built.append(s))
    settings = make_settings()
    app.dependency_overrides[get_settings] = lambda: settings
    body = json.loads(SAMPLE.read_text(encoding="utf-8"))
    body["__force"] = "OUTPUT_INVALID"
    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/v1/story/generate", json=body, headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    # NB: the provider may be built (FastAPI resolves it); what matters is it is never called.


# --- Claude providers -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("provider", "attr"),
    [("claude", "ClaudeLLMProvider"), ("claude_code", "ClaudeCodeLLMProvider")],
)
def test_lifespan_claude_providers_verify_once_and_share(monkeypatch, provider, attr) -> None:
    RecordingProvider.instances = []
    RecordingProvider.fail = False
    monkeypatch.setattr(main_module, attr, RecordingProvider)
    from tests.providers.test_claude_provider import make_settings as claude_settings

    settings = claude_settings(llm_provider=provider)
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app):
        assert len(RecordingProvider.instances) == 1
        assert RecordingProvider.instances[0].verified == 1
        assert app.state.llm_provider is RecordingProvider.instances[0]


@pytest.mark.parametrize(
    ("provider", "attr"),
    [("claude", "ClaudeLLMProvider"), ("claude_code", "ClaudeCodeLLMProvider")],
)
def test_get_llm_provider_builds_claude_providers(monkeypatch, provider, attr) -> None:
    from types import SimpleNamespace

    from tests.providers.test_claude_provider import make_settings as claude_settings

    built = []
    monkeypatch.setattr(f"app.deps.{attr}", lambda s: built.append(s) or object())
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    settings = claude_settings(llm_provider=provider)
    first = get_llm_provider(request, settings)
    assert get_llm_provider(request, settings) is first
    assert built == [settings]


def test_health_reports_claude_model() -> None:
    from tests.providers.test_claude_provider import MODEL
    from tests.providers.test_claude_provider import make_settings as claude_settings

    app.dependency_overrides[get_settings] = lambda: claude_settings()
    body = TestClient(app).get("/health").json()
    assert body["llm_provider"] == "claude"
    assert body["llm_model"] == MODEL
