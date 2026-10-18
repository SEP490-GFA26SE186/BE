"""GeminiLLMProvider with an injected fake client (spec 10.3): no respx, no network.

The fake mimics `google.genai.client.AsyncClient` (`client.models.generate_content(...)`)
and returns real `google.genai.types.GenerateContentResponse` objects, so the response
shape is the SDK's own (google-genai 2.25.0), not a hand-written guess.
"""

import asyncio
import logging
from typing import Any

import httpx
import pytest
from google.genai import errors as genai_errors
from google.genai import types

from app.config import Settings
from app.errors import AiError, ErrorCode
from app.providers.llm.base import LLMResult, StoryLLMCall, Turn
from app.providers.llm.gemini import GeminiLLMProvider, normalize_finish_reason
from app.schemas.llm import LlmStoryOutput
from tests.fixtures.frames import make_frame

API_KEY = "AIza-test-secret-key-123"
MODEL = "gemini-test-model"
PROMPT_TEXT = "PROMPT-SECRET-noi-dung-truyen"
FIXUP_TEXT = "FIXUP-SECRET-sua-lai"
OUTPUT_TEXT = '{"pages": [], "scenes": [], "checkpoints": [], "marker": "OUTPUT-SECRET"}'


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "internal_token": "test-token",
        "llm_provider": "gemini",
        "tts_provider": "mock",
        "gemini_api_key": API_KEY,
        "gemini_text_model": MODEL,
        "llm_timeout_seconds": 5,
        "llm_thinking_budget": 0,
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


def make_response(
    *,
    text: str | None = OUTPUT_TEXT,
    finish_reason: str | None = "STOP",
    prompt_tokens: int | None = 100,
    candidates_tokens: int | None = 40,
    thoughts_tokens: int | None = None,
    block_reason: str | None = None,
    no_candidates: bool = False,
    thought_text: str | None = None,
) -> types.GenerateContentResponse:
    parts = []
    if thought_text is not None:
        parts.append(types.Part(text=thought_text, thought=True))
    if text is not None:
        parts.append(types.Part(text=text))
    candidates = (
        None
        if no_candidates
        else [
            types.Candidate(
                content=types.Content(role="model", parts=parts or None),
                finish_reason=finish_reason,
            )
        ]
    )
    return types.GenerateContentResponse(
        candidates=candidates,
        prompt_feedback=(
            types.GenerateContentResponsePromptFeedback(block_reason=block_reason)
            if block_reason
            else None
        ),
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt_tokens,
            candidates_token_count=candidates_tokens,
            thoughts_token_count=thoughts_tokens,
        ),
    )


class FakeModels:
    def __init__(self, outcome: Any, delay: float = 0) -> None:
        self.outcome = outcome
        self.delay = delay
        self.calls: list[dict[str, Any]] = []

    async def generate_content(self, *, model: str, contents: Any, config: Any = None):
        self.calls.append({"model": model, "contents": contents, "config": config})
        if self.delay:
            await asyncio.sleep(self.delay)
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


class FakeAsyncClient:
    """Same surface as `genai.Client(...).aio` for what the provider uses."""

    def __init__(self, outcome: Any, delay: float = 0) -> None:
        self.models = FakeModels(outcome, delay)


def provider_with(outcome: Any, *, delay: float = 0, **settings: Any):
    fake = FakeAsyncClient(outcome, delay)
    return GeminiLLMProvider(make_settings(**settings), client=fake), fake.models


def api_error(code: int) -> genai_errors.APIError:
    body = {"error": {"code": code, "message": "boom", "status": "X"}}
    cls = genai_errors.ClientError if code < 500 else genai_errors.ServerError
    return cls(code, body)


# --- identity ---------------------------------------------------------------------------


def test_name_and_model_come_from_settings() -> None:
    provider, _ = provider_with(make_response())
    assert provider.name == "gemini"
    assert provider.model == MODEL


def test_without_client_builds_real_async_client_with_sdk_retry_off() -> None:
    from google.genai.client import AsyncClient

    provider = GeminiLLMProvider(make_settings())
    assert isinstance(provider._client, AsyncClient)
    # One provider call = exactly one request to Gemini (spec 3.9 / 9.3).
    http_options = provider._client._api_client._http_options
    assert http_options.retry_options is not None
    assert http_options.retry_options.attempts == 1


# --- request built for the SDK ----------------------------------------------------------


async def test_config_sent_to_sdk() -> None:
    provider, models = provider_with(make_response(), llm_thinking_budget=0)

    await provider.generate_story(make_call(max_output_tokens=1234))

    [sent] = models.calls
    assert sent["model"] == MODEL
    config = sent["config"]
    assert isinstance(config, types.GenerateContentConfig)
    assert config.response_mime_type == "application/json"
    assert config.response_schema is LlmStoryOutput
    assert config.max_output_tokens == 1234
    assert config.temperature is None  # None -> not set, SDK/model default applies
    assert "temperature" not in config.model_fields_set
    # Thinking is explicit even when off (spec 3.11.4).
    assert config.thinking_config is not None
    assert config.thinking_config.thinking_budget == 0
    # Safety thresholds are never lowered (spec 9.3).
    assert config.safety_settings is None


async def test_temperature_and_thinking_budget_are_forwarded() -> None:
    provider, models = provider_with(make_response(), llm_thinking_budget=512)

    await provider.generate_story(make_call(temperature=0.4))

    config = models.calls[0]["config"]
    assert config.temperature == 0.4
    assert config.thinking_config.thinking_budget == 512


async def test_turns_become_sdk_contents_in_order() -> None:
    provider, models = provider_with(make_response())
    turns = [Turn("user", PROMPT_TEXT), Turn("model", OUTPUT_TEXT), Turn("user", FIXUP_TEXT)]

    await provider.generate_story(make_call(contents=turns))

    contents = models.calls[0]["contents"]
    assert all(isinstance(c, types.Content) for c in contents)
    assert [(c.role, [p.text for p in c.parts]) for c in contents] == [
        ("user", [PROMPT_TEXT]),
        ("model", [OUTPUT_TEXT]),
        ("user", [FIXUP_TEXT]),
    ]


# --- normal responses -------------------------------------------------------------------


async def test_normal_response_maps_text_and_tokens() -> None:
    provider, _ = provider_with(
        make_response(prompt_tokens=321, candidates_tokens=45, thoughts_tokens=7)
    )

    result = await provider.generate_story(make_call())

    assert result == LLMResult(
        text=OUTPUT_TEXT, input_tokens=321, output_tokens=45 + 7, finish_reason="STOP"
    )


async def test_thought_parts_are_not_part_of_the_text() -> None:
    provider, _ = provider_with(make_response(thought_text="thinking...", thoughts_tokens=3))

    result = await provider.generate_story(make_call())

    assert result.text == OUTPUT_TEXT


async def test_missing_usage_counts_are_zero() -> None:
    provider, _ = provider_with(
        make_response(prompt_tokens=None, candidates_tokens=None, thoughts_tokens=None)
    )

    result = await provider.generate_story(make_call())

    assert (result.input_tokens, result.output_tokens) == (0, 0)


async def test_max_tokens_is_a_normal_result() -> None:
    provider, _ = provider_with(
        make_response(text='{"pages": [', finish_reason="MAX_TOKENS", candidates_tokens=1200)
    )

    result = await provider.generate_story(make_call())

    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == '{"pages": ['
    assert result.output_tokens == 1200


async def test_max_tokens_with_no_text_is_still_a_normal_result() -> None:
    # Thinking can eat the whole cap: that is a truncation (retry with a higher cap),
    # not an empty response.
    provider, _ = provider_with(
        make_response(text=None, finish_reason="MAX_TOKENS", thoughts_tokens=900)
    )

    result = await provider.generate_story(make_call())

    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == ""
    assert result.output_tokens == 40 + 900


# --- safety -----------------------------------------------------------------------------


@pytest.mark.parametrize("reason", ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"])
async def test_safety_finish_reason_raises_safety_blocked_with_tokens(reason: str) -> None:
    provider, _ = provider_with(
        make_response(text=None, finish_reason=reason, prompt_tokens=80, thoughts_tokens=5)
    )

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.SAFETY_BLOCKED
    assert exc.value.call_tokens == (80, 40 + 5)


async def test_blocked_prompt_raises_safety_blocked() -> None:
    provider, _ = provider_with(
        make_response(no_candidates=True, block_reason="SAFETY", prompt_tokens=90,
                      candidates_tokens=None)
    )

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.SAFETY_BLOCKED
    assert exc.value.call_tokens == (90, 0)


async def test_safety_blocked_without_usage_metadata_has_zero_tokens() -> None:
    response = types.GenerateContentResponse(
        prompt_feedback=types.GenerateContentResponsePromptFeedback(block_reason="OTHER")
    )
    provider, _ = provider_with(response)

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.SAFETY_BLOCKED
    assert exc.value.call_tokens == (0, 0)


# --- provider errors --------------------------------------------------------------------


@pytest.mark.parametrize("code", [429, 500, 503, 400])
async def test_sdk_api_errors_become_provider_error(code: int) -> None:
    provider, _ = provider_with(api_error(code))

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.PROVIDER_ERROR
    assert exc.value.call_tokens is None


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("connection refused"),
        httpx.ReadError("reset"),
        ConnectionResetError("reset"),
    ],
)
async def test_network_errors_become_provider_error(error: Exception) -> None:
    provider, _ = provider_with(error)

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.PROVIDER_ERROR


@pytest.mark.parametrize(
    "response",
    [
        make_response(no_candidates=True),
        make_response(text=None),
        make_response(text=""),
        types.GenerateContentResponse(),
    ],
    ids=["no-candidates", "no-parts", "empty-text", "bare"],
)
async def test_response_without_text_is_provider_error(response: Any) -> None:
    provider, _ = provider_with(response)

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.PROVIDER_ERROR


# --- timeout ----------------------------------------------------------------------------


async def test_call_slower_than_timeout_raises_timeout() -> None:
    provider, _ = provider_with(make_response(), delay=1.0, llm_timeout_seconds=0.05)

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.TIMEOUT


async def test_sdk_http_timeout_also_raises_timeout() -> None:
    provider, _ = provider_with(httpx.ReadTimeout("slow"))

    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())

    assert exc.value.code == ErrorCode.TIMEOUT


# --- finish_reason normalisation --------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (types.FinishReason.STOP, "STOP"),
        (types.FinishReason.MAX_TOKENS, "MAX_TOKENS"),
        (types.FinishReason.SAFETY, "SAFETY"),
        ("max_tokens", "MAX_TOKENS"),
        ("STOP", "STOP"),
        (None, "FINISH_REASON_UNSPECIFIED"),
    ],
)
def test_normalize_finish_reason(raw: Any, expected: str) -> None:
    assert normalize_finish_reason(raw) == expected


# --- logs -------------------------------------------------------------------------------


async def test_logs_never_contain_prompt_output_or_api_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    turns = [Turn("user", PROMPT_TEXT), Turn("model", OUTPUT_TEXT), Turn("user", FIXUP_TEXT)]

    ok, _ = provider_with(make_response())
    await ok.generate_story(make_call(contents=turns))
    for outcome in (
        api_error(429),
        make_response(text=None, finish_reason="SAFETY"),
        httpx.ConnectError("down"),
    ):
        failing, _ = provider_with(outcome)
        with pytest.raises(AiError):
            await failing.generate_story(make_call(contents=turns))
    GeminiLLMProvider(make_settings())  # real client construction

    assert caplog.records, "provider should log something (tokens, finish_reason)"
    logged = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (PROMPT_TEXT, FIXUP_TEXT, "OUTPUT-SECRET", API_KEY):
        assert secret not in logged


# --- verify_model (spec 9.3, startup check) ----------------------------------------------


class FakeListModels:
    """`await client.models.list()` returns an async pager; here an async iterator."""

    def __init__(self, names: list[str]) -> None:
        self.names = names
        self.list_calls = 0

    async def list(self):
        self.list_calls += 1
        names = self.names

        async def pager():
            for name in names:
                yield types.Model(name=name)

        return pager()


class FakeListClient:
    def __init__(self, names: list[str]) -> None:
        self.models = FakeListModels(names)


@pytest.mark.parametrize("listed", [MODEL, f"models/{MODEL}"])
async def test_verify_model_accepts_listed_model_with_or_without_prefix(listed: str) -> None:
    client = FakeListClient(["models/other-model", listed])
    provider = GeminiLLMProvider(make_settings(), client=client)
    await provider.verify_model()
    assert client.models.list_calls == 1


async def test_verify_model_missing_model_names_model_and_env_var() -> None:
    client = FakeListClient(["models/other-model", f"models/{MODEL}-extra"])
    provider = GeminiLLMProvider(make_settings(), client=client)
    with pytest.raises(RuntimeError) as info:
        await provider.verify_model()
    assert MODEL in str(info.value)
    assert "GEMINI_TEXT_MODEL" in str(info.value)
    assert API_KEY not in str(info.value)
