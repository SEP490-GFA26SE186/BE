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
    assert s.llm_timeout_seconds == 45
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
