import pytest
from pydantic import ValidationError

from app.config import Settings


def make(**env: object) -> Settings:
    # _env_file=None: never read ai/.env (it holds the real key).
    return Settings(_env_file=None, **env)  # type: ignore[arg-type]


def test_settings_has_no_database_or_redis_fields() -> None:
    # Architectural invariant (spec 10.4): ai/ never touches DB or Redis.
    assert "database_url" not in Settings.model_fields
    assert "redis_url" not in Settings.model_fields


def test_missing_internal_token_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_TOKEN", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_defaults() -> None:
    s = make(internal_token="t")
    # 20-page story measured at 90.5 s per call on Claude (docs/01); Node waits 320 s for two.
    assert s.llm_timeout_seconds == 150
    assert s.llm_thinking_budget == 0
    assert s.llm_truncation_retry_factor == 1.5
    assert s.llm_provider == "mock"
    # Gemini 3 docs strongly advise keeping the default temperature (docs/01).
    assert s.llm_temperature is None
    assert s.llm_retry_temperature is None
    # Measured 2.557 on gemini-3.8-flash (Task 8 spike) x ~1.1 margin (docs/01).
    assert s.tokens_per_word == 2.8


def test_empty_temperature_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_TEMPERATURE", "")
    assert make(internal_token="t").llm_temperature is None


def test_retry_temperature_can_be_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_RETRY_TEMPERATURE", "0.4")
    assert make(internal_token="t").llm_retry_temperature == 0.4
    monkeypatch.setenv("LLM_RETRY_TEMPERATURE", "")
    assert make(internal_token="t").llm_retry_temperature is None


def test_negative_thinking_budget_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_THINKING_BUDGET", "-1")
    with pytest.raises(ValidationError):
        make(internal_token="t")


def test_gemini_requires_key_and_model_without_leaking_values() -> None:
    with pytest.raises(ValidationError) as exc:
        make(internal_token="t", llm_provider="gemini")
    text = str(exc.value)
    assert "GEMINI_API_KEY" in text and "GEMINI_TEXT_MODEL" in text

    with pytest.raises(ValidationError) as exc:
        make(internal_token="t", llm_provider="gemini", gemini_api_key="sekret-key-123")
    text = str(exc.value)
    assert "GEMINI_TEXT_MODEL" in text and "GEMINI_API_KEY" not in text
    assert "sekret-key-123" not in text


def test_gemini_ok_when_configured() -> None:
    s = make(
        internal_token="t",
        llm_provider="gemini",
        gemini_api_key="k",
        gemini_text_model="m",
    )
    assert s.gemini_text_model == "m"


# --- Claude (API) and Claude Code (CLI subscription) ------------------------------------


@pytest.mark.parametrize("provider", ["claude", "claude_code"])
def test_claude_providers_require_model(provider: str) -> None:
    with pytest.raises(ValidationError) as exc:
        make(internal_token="t", llm_provider=provider)
    assert "LLM_CLAUDE_MODEL" in str(exc.value)


def test_claude_api_key_is_optional_and_never_leaks() -> None:
    # No key: the SDK resolves credentials itself (env vars, then an `ant auth login` profile).
    s = make(internal_token="t", llm_provider="claude", llm_claude_model="m")
    assert s.anthropic_api_key is None

    with pytest.raises(ValidationError) as exc:
        make(internal_token="t", llm_provider="claude", anthropic_api_key="sk-ant-sekret-123")
    assert "sk-ant-sekret-123" not in str(exc.value)


@pytest.mark.parametrize("provider", ["claude", "claude_code"])
@pytest.mark.parametrize("field", ["llm_temperature", "llm_retry_temperature"])
def test_claude_providers_reject_temperature(provider: str, field: str) -> None:
    # Current Claude models reject non-default sampling, and anthropic 1.x has no such argument.
    with pytest.raises(ValidationError) as exc:
        make(internal_token="t", llm_provider=provider, llm_claude_model="m", **{field: 0.4})
    assert field.upper() in str(exc.value)


def test_llm_claude_thinking_and_effort_default_to_not_sent() -> None:
    s = make(internal_token="t", llm_provider="claude", llm_claude_model="m")
    assert s.llm_claude_thinking is None
    assert s.llm_claude_effort is None


def test_llm_claude_thinking_and_effort_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_CLAUDE_THINKING", "between_tools")
    monkeypatch.setenv("LLM_CLAUDE_EFFORT", "low")
    s = make(internal_token="t", llm_provider="claude", llm_claude_model="m")
    assert s.llm_claude_thinking == "between_tools"
    assert s.llm_claude_effort == "low"

    monkeypatch.setenv("LLM_CLAUDE_EFFORT", "turbo")
    with pytest.raises(ValidationError):
        make(internal_token="t", llm_provider="claude", llm_claude_model="m")


def test_claude_code_rejects_between_tools() -> None:
    # The Agent SDK's ThinkingConfig only knows adaptive | enabled | disabled.
    with pytest.raises(ValidationError) as exc:
        make(
            internal_token="t",
            llm_provider="claude_code",
            llm_claude_model="sonnet",
            llm_claude_thinking="between_tools",
        )
    assert "LLM_CLAUDE_THINKING" in str(exc.value)


@pytest.mark.parametrize(
    ("provider", "extra", "expected"),
    [
        ("mock", {}, "mock-v1"),
        ("gemini", {"gemini_api_key": "k", "gemini_text_model": "g-model"}, "g-model"),
        ("claude", {"llm_claude_model": "c-model"}, "c-model"),
        ("claude_code", {"llm_claude_model": "sonnet"}, "sonnet"),
    ],
)
def test_llm_model_reports_the_active_model(provider: str, extra: dict, expected: str) -> None:
    assert make(internal_token="t", llm_provider=provider, **extra).llm_model == expected
