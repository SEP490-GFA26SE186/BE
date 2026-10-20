"""Claude text provider through the Claude Code CLI on a Pro/Max subscription.

Built on claude-agent-sdk 0.2.163 (names read from the installed package: query.py, types.py,
_errors.py). The SDK does not call the model itself: it drives the `claude` CLI as a child
process, so the call runs on whatever that CLI is signed into and needs no API key. Same
pattern as d:/crawler_flatform (core/adapters/claude_sdk_tools.py, platform/Dockerfile).

Two ways to sign in (README "Claude"): `claude login` on a dev machine, or in a container the
env var CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`), which the CLI reads before any
browser login. The package is an optional extra (`.[claude-code]`); the image installs it with
build arg AI_EXTRAS=claude-code, and its Linux wheel bundles the CLI, so no Node is needed.
Every call spawns a fresh CLI process (seconds of fixed overhead).

The CLI is locked down: no built-in tools, no MCP servers, no user/project settings. Structured
output goes through the CLI's `--json-schema` (a forced tool call validated after generation,
not constrained decoding); the orchestrator still parses and validates everything.
Logs never contain prompt or output text.
"""

import asyncio
import json
import logging
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import anthropic

from app.config import Settings
from app.errors import AiError
from app.providers.llm.base import LLMResult, StoryLLMCall

logger = logging.getLogger(__name__)

_FINISH_REASONS = {"end_turn": "STOP", "max_tokens": "MAX_TOKENS"}
# How the CLI reports hitting CLAUDE_CODE_MAX_OUTPUT_TOKENS: an error result (subtype "success",
# no HTTP status) after it has already re-asked the model a few times. It is a truncation, so it
# becomes MAX_TOKENS and the orchestrator's OUTPUT_TRUNCATED path, not PROVIDER_ERROR.
_OUTPUT_CAP = re.compile(r"exceeded the \d+ output token maximum")
_SYSTEM_PROMPT = (
    "You write story content for a children's app. Follow the user's instructions exactly and "
    "answer only through the structured output that matches the given JSON Schema."
)
# The structured output is a synthetic tool call; the CLI may need another turn when its own
# schema check rejects the first attempt. Not a story-level retry (that is the orchestrator's).
_MAX_TURNS = 3
_INSTALL_HINT = 'pip install -e ".[claude-code]" (Docker: build arg AI_EXTRAS=claude-code)'
_CLI_HINT = (
    "Cài Claude Code CLI và chạy `claude login` (hoặc đặt CLAUDE_CODE_OAUTH_TOKEN), "
    "hoặc đặt LLM_CLAUDE_CLI_PATH."
)
# Credentials the CLI reads from its environment. Compose passes every variable as `${VAR:-}`,
# so an unset one arrives as an EMPTY string, and the CLI takes an empty value as a credential
# and stops consulting the others: the failure then reads "bad token", not "not configured"
# (d:/crawler_flatform, worker/src/crawler.ts). The SDK hands os.environ to the CLI as is.
_AUTH_ENV = ("CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")


def _drop_blank_auth_env() -> None:
    for name in _AUTH_ENV:
        if name in os.environ and not os.environ[name].strip():
            del os.environ[name]
    if os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning(
            "claude_code: ANTHROPIC_API_KEY is set, the CLI may bill the API key "
            "instead of the subscription"
        )


def _bundled_cli() -> Path | None:
    """The CLI shipped inside the SDK wheel (macOS/Linux only), which the SDK itself prefers
    over PATH. In the Docker image this is the only CLI there is."""
    import claude_agent_sdk

    name = "claude.exe" if sys.platform == "win32" else "claude"
    path = Path(claude_agent_sdk.__file__).parent / "_bundled" / name
    return path if path.is_file() else None


def _flatten(call: StoryLLMCall) -> str:
    """`query()` takes one prompt: earlier turns (a retry) go in front, tagged by role."""
    *earlier, last = call.contents
    if not earlier:
        return last.text
    parts = ["Earlier turns of this conversation, oldest first:"]
    for turn in earlier:
        role = "assistant" if turn.role == "model" else "user"
        parts.append(f'<turn role="{role}">\n{turn.text}\n</turn>')
    parts.append("Now answer this:")
    parts.append(last.text)
    return "\n\n".join(parts)


def _usage_tokens(usage: dict[str, Any] | None) -> tuple[int, int]:
    usage = usage or {}
    input_tokens = (
        (usage.get("input_tokens") or 0)
        + (usage.get("cache_read_input_tokens") or 0)
        + (usage.get("cache_creation_input_tokens") or 0)
    )
    return input_tokens, usage.get("output_tokens") or 0


class ClaudeCodeLLMProvider:
    name = "claude_code"

    def __init__(self, settings: Settings, query: Any = None) -> None:
        """`query` has the keyword surface of `claude_agent_sdk.query`; tests inject a fake."""
        self._settings = settings
        self.model: str | None = settings.llm_claude_model
        self._query = query

    async def verify_model(self) -> None:
        """Startup check: the SDK is installed and the CLI exists. Never spends a model call,
        so a wrong model alias or a logged-out CLI only shows on the first story."""
        try:
            import claude_agent_sdk  # noqa: F401
        except ImportError:
            raise RuntimeError(f"Thiếu gói claude-agent-sdk. {_INSTALL_HINT}") from None
        _drop_blank_auth_env()
        configured = self._settings.llm_claude_cli_path
        if configured:
            if not Path(configured).is_file():
                raise RuntimeError(f"LLM_CLAUDE_CLI_PATH không trỏ tới file có thật: {configured}")
            cli = configured
        elif _bundled_cli() is not None:
            return
        else:
            cli = shutil.which("claude")
            if cli is None:
                raise RuntimeError(f"Không tìm thấy CLI `claude` trong PATH. {_CLI_HINT}")
        # The SDK refuses .cmd/.bat on Windows (cmd.exe argument injection), and the npm install
        # puts exactly such a shim on PATH. PyPI ships no Windows wheel with a bundled claude.exe.
        if Path(cli).suffix.lower() in (".cmd", ".bat"):
            raise RuntimeError(
                f"CLI `claude` tìm được là file batch ({cli}); SDK không chạy file .cmd/.bat. "
                "Đặt LLM_CLAUDE_CLI_PATH trỏ tới claude.exe thật (bản npm: "
                "%APPDATA%\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe)."
            )

    def _options(self, call: StoryLLMCall) -> Any:
        from claude_agent_sdk import ClaudeAgentOptions

        settings = self._settings
        return ClaudeAgentOptions(
            model=self.model,
            system_prompt=_SYSTEM_PROMPT,
            tools=[],
            allowed_tools=[],
            mcp_servers={},
            # Without it the CLI still loads the account's claude.ai connectors (seen: Docs
            # tools able to write documents) on top of the empty mcp_servers.
            strict_mcp_config=True,
            setting_sources=[],
            max_turns=_MAX_TURNS,
            output_format={
                "type": "json_schema",
                "schema": anthropic.transform_schema(call.response_schema),
            },
            env={"CLAUDE_CODE_MAX_OUTPUT_TOKENS": str(call.max_output_tokens)},
            thinking=(
                {"type": settings.llm_claude_thinking} if settings.llm_claude_thinking else None
            ),
            effort=settings.llm_claude_effort,
            cli_path=settings.llm_claude_cli_path,
        )

    async def _last_result(self, call: StoryLLMCall) -> Any:
        from claude_agent_sdk import ResultMessage, query

        run = self._query or query
        result = None
        async for message in run(prompt=_flatten(call), options=self._options(call)):
            if isinstance(message, ResultMessage):
                result = message
        return result

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        from claude_agent_sdk import ClaudeSDKError, CLINotFoundError, ResultError

        try:
            # wait_for cancels the stream on expiry; the SDK then tears the CLI child down.
            result = await asyncio.wait_for(
                self._last_result(call), timeout=self._settings.llm_timeout_seconds
            )
        except TimeoutError:
            logger.warning("claude_code call timed out")
            raise AiError.timeout("Claude Code không trả lời kịp thời gian cho phép") from None
        except CLINotFoundError:
            logger.warning("claude_code CLI not found")
            raise AiError.provider_error(f"Không tìm thấy CLI `claude`. {_CLI_HINT}") from None
        except ResultError as error:
            if _OUTPUT_CAP.search(error.result or ""):
                return self._truncated(error.data.get("usage"))
            # Only status/subtype: `result` holds the CLI's "API Error: ..." prose.
            logger.warning(
                "claude_code error result status=%s subtype=%s",
                error.api_error_status,
                error.subtype,
            )
            raise self._error_result(error.api_error_status, error.subtype) from None
        except ClaudeSDKError as error:
            logger.warning("claude_code SDK error (%s)", type(error).__name__)
            raise AiError.provider_error("Claude Code CLI chạy lỗi") from None
        if result is None:
            raise AiError.provider_error("Claude Code CLI không trả kết quả")
        return self._to_result(result)

    def _truncated(self, usage: dict[str, Any] | None) -> LLMResult:
        input_tokens, output_tokens = _usage_tokens(usage)
        logger.info(
            "claude_code call model=%s hit the CLI output cap output_tokens=%d",
            self.model,
            output_tokens,
        )
        return LLMResult(
            text="", input_tokens=input_tokens, output_tokens=output_tokens,
            finish_reason="MAX_TOKENS",
        )

    @staticmethod
    def _error_result(status: int | None, subtype: str | None) -> AiError:
        if status in (401, 403):
            return AiError.provider_error(f"Claude Code chưa đăng nhập ({status}). {_CLI_HINT}")
        return AiError.provider_error(f"Claude Code trả lỗi {status or subtype or 'không rõ'}")

    def _to_result(self, result: Any) -> LLMResult:
        input_tokens, output_tokens = _usage_tokens(result.usage)
        stop_reason = result.stop_reason or ""
        logger.info(
            "claude_code call model=%s stop_reason=%s subtype=%s input_tokens=%d "
            "output_tokens=%d duration_ms=%d",
            self.model,
            stop_reason,
            result.subtype,
            input_tokens,
            output_tokens,
            result.duration_ms,
        )
        if stop_reason == "refusal":
            raise AiError.safety_blocked(
                "Claude từ chối nội dung vì lý do an toàn",
                call_tokens=(input_tokens, output_tokens),
            )
        if result.structured_output is not None:
            # Accepted even after `error_max_turns`: the payload is there, the orchestrator
            # decides whether it is valid.
            return LLMResult(
                text=json.dumps(result.structured_output, ensure_ascii=False),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                finish_reason="STOP",
            )
        if result.is_error:
            if _OUTPUT_CAP.search(result.result or ""):
                return self._truncated(result.usage)
            raise self._error_result(result.api_error_status, result.subtype)
        finish_reason = _FINISH_REASONS.get(stop_reason, stop_reason.upper() or "STOP")
        text = result.result or ""
        if not text and finish_reason != "MAX_TOKENS":
            raise AiError.provider_error("Claude Code trả kết quả không có nội dung")
        return LLMResult(
            text=text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            finish_reason=finish_reason,
        )
