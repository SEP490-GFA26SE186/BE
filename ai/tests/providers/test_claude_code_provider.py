"""ClaudeCodeLLMProvider with an injected fake `query`: no CLI process, no network.

The fake stands in for `claude_agent_sdk.query(prompt=..., options=...)` and yields real
`claude_agent_sdk.ResultMessage` objects, so the result shape is the SDK's own
(claude-agent-sdk 0.2.163).
"""

import asyncio
import json
import logging
import os
from typing import Any

import anthropic
import pytest

# Optional extra `.[claude-code]` (dev only): without it these tests are skipped, not failed.
pytest.importorskip("claude_agent_sdk")

from claude_agent_sdk import (  # noqa: E402
    AssistantMessage,
    ClaudeAgentOptions,
    CLINotFoundError,
    ProcessError,
    ResultError,
    ResultMessage,
    TextBlock,
)

from app.config import Settings  # noqa: E402
from app.errors import AiError, ErrorCode  # noqa: E402
from app.providers.llm.base import StoryLLMCall, Turn  # noqa: E402
from app.providers.llm.claude_code import ClaudeCodeLLMProvider  # noqa: E402
from app.schemas.llm import LlmStoryOutput  # noqa: E402
from tests.fixtures.frames import make_frame  # noqa: E402

MODEL = "sonnet"
PROMPT_TEXT = "PROMPT-SECRET-noi-dung-truyen"
FIXUP_TEXT = "FIXUP-SECRET-sua-lai"
PREVIOUS_OUTPUT = '{"pages": [], "marker": "PREVIOUS-SECRET"}'
STRUCTURED = {"pages": [], "scenes": [], "checkpoints": [], "marker": "OUTPUT-SECRET"}


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "internal_token": "test-token",
        "llm_provider": "claude_code",
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


def make_result(
    *,
    structured: Any = STRUCTURED,
    result: str | None = None,
    stop_reason: str | None = "end_turn",
    is_error: bool = False,
    subtype: str = "success",
    api_error_status: int | None = None,
    input_tokens: int = 100,
    output_tokens: int = 40,
    cache_read: int = 0,
    cache_creation: int = 0,
) -> ResultMessage:
    return ResultMessage(
        subtype=subtype,
        duration_ms=10,
        duration_api_ms=8,
        is_error=is_error,
        num_turns=1,
        session_id="s1",
        stop_reason=stop_reason,
        usage={
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_input_tokens": cache_read,
            "cache_creation_input_tokens": cache_creation,
        },
        result=result,
        structured_output=structured,
        api_error_status=api_error_status,
    )


class FakeQuery:
    """Callable with the same keyword surface as `claude_agent_sdk.query`."""

    def __init__(self, *outcome: Any, delay: float = 0) -> None:
        self.outcome = outcome
        self.delay = delay
        self.calls: list[dict[str, Any]] = []

    def __call__(self, *, prompt: str, options: ClaudeAgentOptions):
        self.calls.append({"prompt": prompt, "options": options})

        async def gen():
            if self.delay:
                await asyncio.sleep(self.delay)
            for item in self.outcome:
                if isinstance(item, BaseException):
                    raise item
                yield item

        return gen()


def provider_with(*outcome: Any, delay: float = 0, **settings: Any):
    fake = FakeQuery(*outcome, delay=delay)
    return ClaudeCodeLLMProvider(make_settings(**settings), query=fake), fake


# --- identity ---------------------------------------------------------------------------


def test_name_and_model_come_from_settings() -> None:
    provider, _ = provider_with(make_result())
    assert provider.name == "claude_code"
    assert provider.model == MODEL


# --- options ----------------------------------------------------------------------------


async def test_options_lock_the_cli_down() -> None:
    provider, fake = provider_with(make_result())

    await provider.generate_story(make_call(max_output_tokens=1234))

    options = fake.calls[0]["options"]
    assert options.model == MODEL
    # No built-in tool (Bash, Read, Write...), no MCP, no user/project settings: the story
    # prompt must not be able to make the CLI touch the machine.
    assert options.tools == []
    assert options.allowed_tools == []
    assert options.mcp_servers == {}
    # Without strict, the CLI still loads the account's claude.ai connectors (seen: Docs tools).
    assert options.strict_mcp_config is True
    assert options.setting_sources == []
    assert options.output_format == {
        "type": "json_schema",
        "schema": anthropic.transform_schema(LlmStoryOutput),
    }
    # The CLI's own output cap carries the orchestrator's max_output_tokens.
    assert options.env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] == "1234"
    assert options.thinking is None and options.effort is None
    assert options.cli_path is None
    assert isinstance(options.system_prompt, str) and options.system_prompt


async def test_thinking_effort_and_cli_path_are_forwarded() -> None:
    provider, fake = provider_with(
        make_result(),
        llm_claude_thinking="disabled",
        llm_claude_effort="low",
        llm_claude_cli_path="C:/tools/claude.exe",
    )

    await provider.generate_story(make_call())

    options = fake.calls[0]["options"]
    assert options.thinking == {"type": "disabled"}
    assert options.effort == "low"
    assert options.cli_path == "C:/tools/claude.exe"


async def test_single_turn_prompt_is_the_turn_text() -> None:
    provider, fake = provider_with(make_result())
    await provider.generate_story(make_call())
    assert fake.calls[0]["prompt"] == PROMPT_TEXT


async def test_retry_turns_are_flattened_in_order() -> None:
    provider, fake = provider_with(make_result())
    turns = [Turn("user", PROMPT_TEXT), Turn("model", PREVIOUS_OUTPUT), Turn("user", FIXUP_TEXT)]

    await provider.generate_story(make_call(contents=turns))

    prompt = fake.calls[0]["prompt"]
    first, previous, fixup = (prompt.index(t) for t in (PROMPT_TEXT, PREVIOUS_OUTPUT, FIXUP_TEXT))
    assert first < previous < fixup
    assert prompt.endswith(FIXUP_TEXT)
    assert 'role="assistant"' in prompt[:previous]


# --- results ----------------------------------------------------------------------------


async def test_structured_output_becomes_json_text_and_tokens() -> None:
    provider, _ = provider_with(
        AssistantMessage(content=[TextBlock(text="ignored")], model=MODEL),
        make_result(input_tokens=10, cache_read=70, cache_creation=20, output_tokens=40),
    )

    result = await provider.generate_story(make_call())

    assert json.loads(result.text) == STRUCTURED
    assert result.input_tokens == 100
    assert result.output_tokens == 40
    assert result.finish_reason == "STOP"


async def test_no_structured_output_falls_back_to_result_text() -> None:
    # The orchestrator parses it; prose here becomes OUTPUT_SCHEMA_INVALID and a retry.
    provider, _ = provider_with(make_result(structured=None, result='{"pages": []}'))
    result = await provider.generate_story(make_call())
    assert result.text == '{"pages": []}'
    assert result.finish_reason == "STOP"


async def test_max_tokens_is_a_normal_result() -> None:
    provider, _ = provider_with(
        make_result(structured=None, result='{"pages": [', stop_reason="max_tokens")
    )
    result = await provider.generate_story(make_call())
    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == '{"pages": ['


async def test_refusal_is_safety_blocked_with_call_tokens() -> None:
    provider, _ = provider_with(
        make_result(structured=None, stop_reason="refusal", input_tokens=90, output_tokens=3)
    )
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.SAFETY_BLOCKED
    assert exc.value.call_tokens == (90, 3)


async def test_error_result_is_provider_error() -> None:
    provider, _ = provider_with(
        make_result(
            structured=None,
            result="API Error: OUTPUT-SECRET",
            is_error=True,
            api_error_status=529,
        )
    )
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.PROVIDER_ERROR
    assert "529" in exc.value.message
    assert "OUTPUT-SECRET" not in exc.value.message


_CAP_TEXT = (
    "API Error: Claude's response exceeded the 3378 output token maximum. To configure this "
    "behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable."
)


async def test_output_cap_error_result_is_a_truncation() -> None:
    # Measured 2026-10-15: thinking filled CLAUDE_CODE_MAX_OUTPUT_TOKENS on every CLI turn.
    provider, _ = provider_with(
        make_result(structured=None, result=_CAP_TEXT, is_error=True, output_tokens=13512)
    )
    result = await provider.generate_story(make_call())
    assert result.finish_reason == "MAX_TOKENS"
    assert result.text == ""
    assert result.output_tokens == 13512


async def test_output_cap_result_error_is_a_truncation() -> None:
    data = {"subtype": "success", "is_error": True, "result": _CAP_TEXT,
            "usage": {"input_tokens": 8, "output_tokens": 13512}}
    provider, _ = provider_with(ResultError("Claude Code returned an error result", data, 1))
    result = await provider.generate_story(make_call())
    assert result.finish_reason == "MAX_TOKENS"
    assert (result.input_tokens, result.output_tokens) == (8, 13512)


async def test_empty_result_is_provider_error() -> None:
    provider, _ = provider_with(make_result(structured=None, result=None))
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.PROVIDER_ERROR


async def test_no_result_message_is_provider_error() -> None:
    provider, _ = provider_with(AssistantMessage(content=[TextBlock(text="x")], model=MODEL))
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.PROVIDER_ERROR


# --- errors -----------------------------------------------------------------------------


def _result_error(status: int | None) -> ResultError:
    data = {"subtype": "success", "is_error": True, "result": "API Error: OUTPUT-SECRET"}
    if status is not None:
        data["api_error_status"] = status
    return ResultError("Claude Code returned an error result: OUTPUT-SECRET", data, exit_code=1)


@pytest.mark.parametrize(
    ("error", "fragment"),
    [
        (_result_error(429), "429"),
        (_result_error(401), "claude login"),
        (CLINotFoundError("Claude Code not found"), "LLM_CLAUDE_CLI_PATH"),
        (ProcessError("boom OUTPUT-SECRET", exit_code=3), "Claude Code"),
    ],
)
async def test_sdk_errors_map_to_provider_error(error: Exception, fragment: str) -> None:
    provider, _ = provider_with(error)
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.PROVIDER_ERROR
    assert fragment in exc.value.message
    assert "OUTPUT-SECRET" not in exc.value.message


async def test_slow_call_times_out() -> None:
    provider, _ = provider_with(make_result(), delay=1, llm_timeout_seconds=0.05)
    with pytest.raises(AiError) as exc:
        await provider.generate_story(make_call())
    assert exc.value.code is ErrorCode.TIMEOUT


async def test_logs_never_contain_prompt_or_output(caplog) -> None:
    caplog.set_level(logging.DEBUG)
    provider, _ = provider_with(make_result())
    await provider.generate_story(make_call())
    error_provider, _ = provider_with(_result_error(500))
    with pytest.raises(AiError):
        await error_provider.generate_story(make_call())
    for secret in (PROMPT_TEXT, "OUTPUT-SECRET"):
        assert secret not in caplog.text


# --- startup check ----------------------------------------------------------------------


@pytest.fixture
def no_bundled_cli(monkeypatch) -> None:
    """The Linux/macOS wheel bundles the CLI; these tests are about the PATH fallback."""
    monkeypatch.setattr("app.providers.llm.claude_code._bundled_cli", lambda: None)


async def test_verify_model_fails_when_cli_is_missing(monkeypatch, no_bundled_cli) -> None:
    monkeypatch.setattr("app.providers.llm.claude_code.shutil.which", lambda name: None)
    provider, _ = provider_with(make_result())
    with pytest.raises(RuntimeError, match="LLM_CLAUDE_CLI_PATH"):
        await provider.verify_model()


async def test_verify_model_fails_when_configured_cli_path_does_not_exist(tmp_path) -> None:
    provider, _ = provider_with(
        make_result(), llm_claude_cli_path=str(tmp_path / "missing-claude.exe")
    )
    with pytest.raises(RuntimeError, match="LLM_CLAUDE_CLI_PATH"):
        await provider.verify_model()


@pytest.mark.parametrize("found", ["C:/npm/claude.CMD", "C:/npm/claude.bat"])
async def test_verify_model_rejects_windows_batch_shim_on_path(monkeypatch, no_bundled_cli, found) -> None:
    # The SDK refuses .cmd/.bat (cmd.exe argument injection); npm installs exactly that.
    monkeypatch.setattr("app.providers.llm.claude_code.shutil.which", lambda name: found)
    provider, _ = provider_with(make_result())
    with pytest.raises(RuntimeError, match="LLM_CLAUDE_CLI_PATH"):
        await provider.verify_model()


async def test_verify_model_rejects_batch_cli_path(tmp_path) -> None:
    shim = tmp_path / "claude.cmd"
    shim.write_text("@echo off", encoding="utf-8")
    provider, _ = provider_with(make_result(), llm_claude_cli_path=str(shim))
    with pytest.raises(RuntimeError, match="claude.exe"):
        await provider.verify_model()


async def test_verify_model_ok_with_cli_on_path(monkeypatch, no_bundled_cli) -> None:
    monkeypatch.setattr(
        "app.providers.llm.claude_code.shutil.which", lambda name: "C:/tools/claude.exe"
    )
    provider, fake = provider_with(make_result())
    await provider.verify_model()
    assert fake.calls == []  # never spends a model call


async def test_verify_model_ok_with_bundled_cli_and_nothing_on_path(monkeypatch, tmp_path) -> None:
    # The Docker image: the wheel's own CLI, no `claude` on PATH, no LLM_CLAUDE_CLI_PATH.
    bundled = tmp_path / "claude"
    bundled.write_text("", encoding="utf-8")
    monkeypatch.setattr("app.providers.llm.claude_code._bundled_cli", lambda: bundled)
    monkeypatch.setattr("app.providers.llm.claude_code.shutil.which", lambda name: None)
    provider, fake = provider_with(make_result())
    await provider.verify_model()
    assert fake.calls == []


async def test_verify_model_drops_blank_auth_env(monkeypatch, no_bundled_cli) -> None:
    # Compose passes `${VAR:-}`: an empty token would reach the CLI and be taken as a credential.
    monkeypatch.setattr(
        "app.providers.llm.claude_code.shutil.which", lambda name: "C:/tools/claude.exe"
    )
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "  ")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "kept-token")
    provider, _ = provider_with(make_result())
    await provider.verify_model()
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in os.environ
    assert "ANTHROPIC_API_KEY" not in os.environ
    assert os.environ["ANTHROPIC_AUTH_TOKEN"] == "kept-token"
