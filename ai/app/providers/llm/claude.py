"""Claude text provider over the Anthropic API, built on anthropic 1.11.0.

SDK names below were read from the installed package (anthropic/_client.py, types/,
_exceptions.py, lib/_parse/_transform.py), not from memory. Differences from Gemini are
listed in the README ("Claude").

Credentials: ANTHROPIC_API_KEY from ai/.env when set; otherwise the SDK's own chain (env
vars, then the active `ant auth login` profile), so a developer can run without a key file.

Does one thing: send the turns, return raw JSON text + token counts. Prompt, retry and
validation belong to the orchestrator. Logs never contain prompt text, output text or the key.
"""

import asyncio
import logging
from typing import Any

import anthropic

from app.config import Settings
from app.errors import AiError
from app.providers.llm.base import LLMResult, StoryLLMCall

logger = logging.getLogger(__name__)

_FINISH_REASONS = {"end_turn": "STOP", "max_tokens": "MAX_TOKENS"}
_LOGIN_HINT = "Chạy `ant auth login` hoặc đặt ANTHROPIC_API_KEY."


def _build_client(settings: Settings) -> anthropic.AsyncAnthropic:
    # max_retries=0: one provider call = one request (BullMQ and the orchestrator own
    # retries). No SDK timeout: generate_story wraps the call in asyncio.wait_for instead.
    key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
    return anthropic.AsyncAnthropic(api_key=key, max_retries=0)


class ClaudeLLMProvider:
    name = "claude"

    def __init__(self, settings: Settings, client: Any = None) -> None:
        """`client` is an `anthropic.AsyncAnthropic`-shaped object; tests inject a fake."""
        self._settings = settings
        self.model: str | None = settings.llm_claude_model
        self._client = client if client is not None else _build_client(settings)

    async def verify_model(self) -> None:
        """Startup check: the model exists and the credentials work (no generation, no billing)."""
        try:
            await self._client.models.retrieve(self.model)
        except anthropic.NotFoundError:
            raise RuntimeError(
                f"Model Claude '{self.model}' không tồn tại. Kiểm tra biến LLM_CLAUDE_MODEL."
            ) from None
        except (anthropic.CredentialsError, anthropic.AuthenticationError):
            raise RuntimeError(
                f"Không có thông tin đăng nhập Claude hợp lệ. {_LOGIN_HINT}"
            ) from None

    def _params(self, call: StoryLLMCall) -> dict[str, Any]:
        # call.temperature is always None here: Settings rejects LLM_*TEMPERATURE for claude,
        # and anthropic 1.x has no temperature argument.
        output_config: dict[str, Any] = {
            "format": {
                "type": "json_schema",
                # The SDK's own strict conversion (additionalProperties: false, defaults moved
                # into descriptions) - the shape structured outputs accepts.
                "schema": anthropic.transform_schema(call.response_schema),
            }
        }
        if self._settings.llm_claude_effort is not None:
            output_config["effort"] = self._settings.llm_claude_effort
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": call.max_output_tokens,
            "messages": [
                {"role": "assistant" if turn.role == "model" else "user", "content": turn.text}
                for turn in call.contents
            ],
            "output_config": output_config,
        }
        if self._settings.llm_claude_thinking is not None:
            params["thinking"] = {"type": self._settings.llm_claude_thinking}
        return params

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        try:
            message = await asyncio.wait_for(
                self._client.messages.create(**self._params(call)),
                timeout=self._settings.llm_timeout_seconds,
            )
        except (TimeoutError, anthropic.APITimeoutError) as error:
            logger.warning("claude call timed out (%s)", type(error).__name__)
            raise AiError.timeout("Claude không trả lời kịp thời gian cho phép") from None
        except anthropic.APIStatusError as error:
            # Only status/type: the message may echo request details.
            logger.warning("claude API error status=%s type=%s", error.status_code, error.type)
            raise AiError.provider_error(f"Claude trả lỗi {error.status_code}") from None
        except anthropic.APIConnectionError as error:
            logger.warning("claude network error (%s)", type(error).__name__)
            raise AiError.provider_error("Không kết nối được tới Claude") from None
        except anthropic.CredentialsError:
            logger.warning("claude credentials missing")
            raise AiError.provider_error(
                f"Không có thông tin đăng nhập Claude. {_LOGIN_HINT}"
            ) from None
        return self._to_result(message)

    def _to_result(self, message: Any) -> LLMResult:
        usage = message.usage
        input_tokens = (
            usage.input_tokens
            + (usage.cache_read_input_tokens or 0)
            + (usage.cache_creation_input_tokens or 0)
        )
        # Thinking tokens are already part of output_tokens (both billed as output).
        output_tokens = usage.output_tokens
        stop_reason = message.stop_reason or ""
        logger.info(
            "claude call model=%s stop_reason=%s input_tokens=%d output_tokens=%d",
            self.model,
            stop_reason,
            input_tokens,
            output_tokens,
        )
        if stop_reason == "refusal":
            raise AiError.safety_blocked(
                "Claude từ chối nội dung vì lý do an toàn",
                call_tokens=(input_tokens, output_tokens),
            )
        finish_reason = _FINISH_REASONS.get(stop_reason, stop_reason.upper())
        text = "".join(block.text for block in message.content if block.type == "text")
        if not text and finish_reason != "MAX_TOKENS":
            raise AiError.provider_error("Claude trả response không có nội dung")
        return LLMResult(
            text=text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            finish_reason=finish_reason,
        )
