"""ClaudeLLMProvider with an injected fake client: no network.

The fake mimics `anthropic.AsyncAnthropic` for what the provider uses
(`client.messages.create(...)`, `client.models.retrieve(...)`) and returns real
`anthropic.types.Message` objects, so the response shape is the SDK's own (anthropic 1.11.0).
"""

import asyncio
import logging
from typing import Any

import anthropic
import httpx2
import pytest
from anthropic.types import Message

from app.config import Settings
from app.errors import AiError, ErrorCode
from app.providers.llm.base import StoryLLMCall, Turn
from app.providers.llm.claude import ClaudeLLMProvider
from app.schemas.llm import LlmStoryOutput
from tests.fixtures.frames import make_frame

API_KEY = "sk-ant-test-secret-key-123"
MODEL = "claude-test-model"
PROMPT_TEXT = "PROMPT-SECRET-noi-dung-truyen"
FIXUP_TEXT = "FIXUP-SECRET-sua-lai"
OUTPUT_TEXT = '{"pages": [], "scenes": [], "checkpoints": [], "marker": "OUTPUT-SECRET"}'


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "internal_token": "test-token",
        "llm_provider": "claude",
        "tts_provider": "mock",
        "llm_claude_model": MODEL,
        "llm_timeout_seconds": 5,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def make_call(**overrides: Any) -> StoryLLMCall:
    values: dict[str, Any] = {
        "frame": make_frame(),
        "contents": [Turn("user", PROMPT_TEXT)],
        "response_schema": LlmStoryOutput,
        "max_output_tokens": 1200,
        "temperature": None,
    }
    values.update(overrides)
    return StoryLLMCall(**values)


def make_message(
    *,
    text: str | None = OUTPUT_TEXT,
    stop_reason: str | None = "end_turn",
    input_tokens: int = 100,
    output_tokens: int = 40,
    cache_read: int | None = None,
    cache_creation: int | None = None,
) -> Message:
    content = [{"type": "text", "text": text, "citations": None}] if text is not None else []
    return Message.model_validate(
        {
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": MODEL,
            "content": content,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": cache_creation,
            },
        }
    )


_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def status_error(cls: type[anthropic.APIStatusError], status: int) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_REQUEST)
    return cls("boom OUTPUT-SECRET", response=response, body=None)


class FakeMessages:
    def __init__(self, outcome: Any, delay: float = 0) -> None:
        self.outcome = outcome
        self.delay = delay
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Message:
        self.calls.append(kwargs)
        if self.delay:
            await asyncio.sleep(self.delay)
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


class FakeModels:
    def __init__(self, outcome: Any = None) -> None:
        self.outcome = outcome
        self.calls: list[str] = []

    async def retrieve(self, model_id: str) -> Any:
        self.calls.append(model_id)
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


class FakeAsyncAnthropic:
    def __init__(self, outcome: Any = None, delay: float = 0, models: Any = None) -> None:
        self.messages = FakeMessages(outcome, delay)
        self.models = FakeModels(models)


def provider_with(outcome: Any, *, delay: float = 0, **settings: Any):
    fake = FakeAsyncAnthropic(outcome, delay)
    return ClaudeLLMProvider(make_settings(**settings), client=fake), fake.messages


# --- identity / client ------------------------------------------------------------------


def test_name_and_model_come_from_settings() -> None:
    provider, _ = provider_with(make_message())
    assert provider.name == "claude"
    assert provider.model == MODEL


def test_real_client_has_sdk_retry_off_and_uses_configured_key() -> None:
    provider = ClaudeLLMProvider(make_settings(anthropic_api_key=API_KEY))
    assert isinstance(provider._client, anthropic.AsyncAnthropic)
    # One provider call = exactly one request (BullMQ and the orchestrator own retries).
    assert provider._client.max_retries == 0
    assert provider._client.api_key == API_KEY


def test_real_client_without_key_leaves_credentials_to_the_sdk(monkeypatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    provider = ClaudeLLMProvider(make_settings())
    # No key passed: the SDK's chain (env vars, then an `ant auth login` profile) decides.
    assert provider._client.api_key is None


# --- request ----------------------------------------------------------------------------


async def test_request_sent_to_sdk() -> None:
    provider, messages = provider_with(make_message())

    await provider.generate_story(make_call(max_output_tokens=1234))

    [sent] = messages.calls
    assert sent["model"] == MODEL
    assert sent["max_tokens"] == 1234
    output_format = sent["output_config"]["format"]
    assert output_format["type"] == "json_schema"
    assert output_format["schema"] == anthropic.transform_schema(LlmStoryOutput)
    # Not configured -> not sent: the model's own defaults apply.
    assert "thinking" not in sent
    assert "effort" not in sent["output_config"]
    assert "temperature" not in sent


async def test_thinking_and_effort_are_forwarded() -> None:
    provider, messages = provider_with(
        make_message(), llm_claude_thinking="between_tools", llm_claude_effort="low"
    )

    await provider.generate_story(make_call())

    sent = messages.calls[0]
    assert sent["thinking"] == {"type": "between_tools"}
    assert sent["output_config"]["effort"] == "low"


async def test_turns_become_messages_in_order() -> None:
    provider, messages = provider_with(make_message())
    turns = [Turn("user", PROMPT_TEXT), Turn("model", OUTPUT_TEXT), Turn("user", FIXUP_TEXT)]

    await provider.generate_story(make_call(contents=turns))

    assert messages.calls[0]["messages"] == [
        {"role": "user", "content": PROMPT_TEXT},
        {"role": "assistant", "content": OUTPUT_TEXT},
        {"role": "user", "content": FIXUP_TEXT},
    ]


# --- responses --------------------------------------------------------------------------


async def test_end_turn_returns_text_and_tokens() -> None:
    provider, _ = provider_with(make_message(input_tokens=100, output_tokens=40))

    result = await provider.generate_story(make_call())

    assert result.text == OUTPUT_TEXT
    assert result.input_tokens == 100
    assert result.output_tokens == 40
    assert result.finish_reason == "STOP"


async def test_cached_input_tokens_count_as_input() -> None:
    provider, _ = provider_with(
        make_message(input_tokens=10, cache_read=70, cache_creation=20)
    )
    result = await provider.generate_story(make_call())
    assert result.input_tokens == 100


async def test_max_tokens_is_a_normal_result() -> None:
    provider, _ = provider_with(make_message(text='{"pages": [', stop_reason="max_tokens"))
    result = await provider.generate_story(make_call())
    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == '{"pages": ['


async def test_max_tokens_without_text_is_still_a_truncation() -> None:
    provider, _ = provider_with(make_message(text=None, stop_reason="max_tokens"))
    result = await provider.generate_story(make_call())
    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == ""


async def test_refusal_is_safety_blocked_with_call_tokens() -> None:
    provider, _ = provider_with(
        make_message(text=None, stop_reason="refusal", input_tokens=90, output_tokens=3)
    )
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.SAFETY_BLOCKED
    assert exc.value.call_tokens == (90, 3)


async def test_empty_response_is_provider_error() -> None:
    provider, _ = provider_with(make_message(text=None, stop_reason="end_turn"))
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.PROVIDER_ERROR


# --- errors -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (status_error(anthropic.RateLimitError, 429), ErrorCode.PROVIDER_ERROR),
        (status_error(anthropic.OverloadedError, 529), ErrorCode.PROVIDER_ERROR),
        (status_error(anthropic.InternalServerError, 500), ErrorCode.PROVIDER_ERROR),
        (status_error(anthropic.AuthenticationError, 401), ErrorCode.PROVIDER_ERROR),
        (status_error(anthropic.BadRequestError, 400), ErrorCode.PROVIDER_ERROR),
        (anthropic.APIConnectionError(request=_REQUEST), ErrorCode.PROVIDER_ERROR),
        (anthropic.APITimeoutError(request=_REQUEST), ErrorCode.TIMEOUT),
        (anthropic.CredentialsError("no credentials"), ErrorCode.PROVIDER_ERROR),
    ],
)
async def test_sdk_errors_map_to_ai_errors(error: Exception, code: ErrorCode) -> None:
    provider, _ = provider_with(error)
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is code
    assert exc.value.call_tokens is None
    assert "OUTPUT-SECRET" not in exc.value.message


async def test_slow_call_times_out() -> None:
    provider, _ = provider_with(make_message(), delay=1, llm_timeout_seconds=0.05)
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.TIMEOUT


async def test_logs_never_contain_prompt_output_or_key(caplog) -> None:
    caplog.set_level(logging.DEBUG)
    provider, _ = provider_with(make_message(), anthropic_api_key=API_KEY)
    await provider.generate_story(make_call(contents=[Turn("user", PROMPT_TEXT)]))

    error_provider, _ = provider_with(status_error(anthropic.RateLimitError, 429))
    with pytest.raises(AiError):
        await error_provider.generate_story(make_call())

    for secret in (PROMPT_TEXT, "OUTPUT-SECRET", API_KEY):
        assert secret not in caplog.text


# --- startup check ----------------------------------------------------------------------


async def test_verify_model_ok() -> None:
    fake = FakeAsyncAnthropic(models=object())
    provider = ClaudeLLMProvider(make_settings(), client=fake)
    await provider.verify_model()
    assert fake.models.calls == [MODEL]


async def test_verify_model_missing_model_names_the_variable() -> None:
    fake = FakeAsyncAnthropic(models=status_error(anthropic.NotFoundError, 404))
    provider = ClaudeLLMProvider(make_settings(), client=fake)
    with pytest.raises(RuntimeError, match="LLM_CLAUDE_MODEL"):
        await provider.verify_model()


@pytest.mark.parametrize(
    "error",
    [
        anthropic.CredentialsError("no credentials"),
        status_error(anthropic.AuthenticationError, 401),
    ],
)
async def test_verify_model_without_credentials_points_to_login(error: Exception) -> None:
    fake = FakeAsyncAnthropic(models=error)
    provider = ClaudeLLMProvider(make_settings(), client=fake)
    with pytest.raises(RuntimeError, match="ant auth login"):
        await provider.verify_model()
