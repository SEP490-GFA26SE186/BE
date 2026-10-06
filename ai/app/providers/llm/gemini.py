"""Gemini text provider (spec 9.3), built on google-genai 2.25.0.

SDK names below were read from the installed package (google/genai/types.py, client.py,
_api_client.py, errors.py), not from memory. Differences from the spec are listed in
the README ("Ghi chu google-genai").

Does one thing: send the turns, return raw JSON text + token counts. Prompt, retry and
validation belong to the orchestrator. Logs never contain prompt text, output text or
the API key (spec 8.5).
"""

import asyncio
import logging
import time
from enum import Enum
from typing import Any

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.config import Settings
from app.errors import AiError
from app.providers.llm.base import LLMResult, StoryLLMCall

logger = logging.getLogger(__name__)

# Candidate finish reasons that mean "blocked by a content filter" (types.FinishReason).
# RECITATION / LANGUAGE / OTHER are not safety blocks: they go through the normal path
# (empty text -> PROVIDER_ERROR, partial text -> the orchestrator's parse step).
_SAFETY_FINISH_REASONS = frozenset(
    {
        "SAFETY",
        "BLOCKLIST",
        "PROHIBITED_CONTENT",
        "SPII",
        "IMAGE_SAFETY",
        "IMAGE_PROHIBITED_CONTENT",
    }
)
_UNSPECIFIED = "FINISH_REASON_UNSPECIFIED"


def normalize_finish_reason(raw: Any) -> str:
    """SDK finish reason (types.FinishReason, a str enum, or None) -> upper-case name.

    Unknown values are kept: the SDK's CaseInSensitiveEnum turns an unknown server value
    into a pseudo-member whose value is the raw string.
    """
    if raw is None:
        return _UNSPECIFIED
    value = raw.value if isinstance(raw, Enum) else raw
    return str(value).upper()


def _build_client(settings: Settings) -> Any:
    if settings.gemini_api_key is None:
        raise ValueError("GEMINI_API_KEY is required for GeminiLLMProvider")
    # SDK retry: with `retry_options=None` the SDK already makes a single attempt
    # (_api_client.retry_args: "If None, the 'never retry' stop strategy will be used").
    # Set attempts=1 explicitly anyway, so a future SDK default cannot silently turn one
    # provider call into several Gemini requests (spec 3.9 counts one per call).
    # No SDK HTTP timeout: generate_story wraps the call in asyncio.wait_for instead.
    http_options = types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1))
    client = genai.Client(
        api_key=settings.gemini_api_key.get_secret_value(), http_options=http_options
    )
    return client.aio


class GeminiLLMProvider:
    name = "gemini"

    def __init__(self, settings: Settings, client: Any = None) -> None:
        """`client` is an async client (`genai.Client(...).aio` shape); tests inject a fake."""
        self._settings = settings
        self.model: str | None = settings.gemini_text_model
        self._client = client if client is not None else _build_client(settings)

    async def verify_model(self) -> None:
        """Startup check (spec 9.3): `gemini_text_model` must be in the model list.

        One `models.list` call (no generation, no billing). The SDK returns names as
        `models/<id>`; the configured value may be given with or without the prefix.
        """
        wanted = (self.model or "").removeprefix("models/")
        pager = await self._client.models.list()
        async for listed in pager:
            if (listed.name or "").removeprefix("models/") == wanted:
                return
        raise RuntimeError(
            f"Model Gemini '{self.model}' không có trong danh sách model của API key. "
            "Kiểm tra biến GEMINI_TEXT_MODEL."
        )

    def _config(self, call: StoryLLMCall) -> types.GenerateContentConfig:
        options: dict[str, Any] = {
            "response_mime_type": "application/json",
            # The SDK accepts a Pydantic class and converts it (t_schema ->
            # model_json_schema); `str | None` fields come out as `nullable: true`.
            "response_schema": call.response_schema,
            "max_output_tokens": call.max_output_tokens,
            # Explicit, never the model default (spec 3.11.4). 0 = thinking off.
            "thinking_config": types.ThinkingConfig(
                thinking_budget=self._settings.llm_thinking_budget
            ),
            # safety_settings deliberately not set: default thresholds, never lowered.
        }
        if call.temperature is not None:
            options["temperature"] = call.temperature
        return types.GenerateContentConfig(**options)

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        contents = [
            types.Content(role=turn.role, parts=[types.Part(text=turn.text)])
            for turn in call.contents
        ]
        started = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                self._client.models.generate_content(
                    model=self.model, contents=contents, config=self._config(call)
                ),
                timeout=self._settings.llm_timeout_seconds,
            )
        except (TimeoutError, httpx.TimeoutException) as error:
            logger.warning("gemini call timed out (%s)", type(error).__name__)
            raise AiError.timeout("Gemini không trả lời kịp thời gian cho phép") from None
        except genai_errors.APIError as error:
            # Only code/status: the message may echo request details.
            logger.warning("gemini API error code=%s status=%s", error.code, error.status)
            raise AiError.provider_error(f"Gemini trả lỗi {error.code}") from None
        except (httpx.HTTPError, OSError) as error:
            logger.warning("gemini network error (%s)", type(error).__name__)
            raise AiError.provider_error("Không kết nối được tới Gemini") from None
        latency_ms = round((time.perf_counter() - started) * 1000)
        return self._to_result(response, latency_ms)

    def _to_result(self, response: types.GenerateContentResponse, latency_ms: int) -> LLMResult:
        usage = response.usage_metadata
        input_tokens = (usage.prompt_token_count or 0) if usage else 0
        # candidates_token_count excludes thoughts (total_token_count = prompt + candidates
        # + tool_use_prompt + thoughts); both are billed as output.
        output_tokens = (
            (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)
            if usage
            else 0
        )

        feedback = response.prompt_feedback
        if feedback is not None and feedback.block_reason is not None:
            block_reason = normalize_finish_reason(feedback.block_reason)
            logger.warning(
                "gemini prompt blocked reason=%s input_tokens=%d", block_reason, input_tokens
            )
            raise AiError.safety_blocked(
                "Gemini chặn yêu cầu vì lý do an toàn",
                call_tokens=(input_tokens, output_tokens),
            )

        if not response.candidates:
            logger.warning("gemini response has no candidates")
            raise AiError.provider_error("Gemini trả response rỗng")

        finish_reason = normalize_finish_reason(response.candidates[0].finish_reason)
        logger.info(
            "gemini call model=%s finish_reason=%s input_tokens=%d output_tokens=%d "
            "latency_ms=%d",
            self.model,
            finish_reason,
            input_tokens,
            output_tokens,
            latency_ms,
        )
        if finish_reason in _SAFETY_FINISH_REASONS:
            raise AiError.safety_blocked(
                "Gemini chặn nội dung vì lý do an toàn",
                call_tokens=(input_tokens, output_tokens),
            )

        # `.text` joins the first candidate's text parts and skips thought parts.
        text = response.text or ""
        if not text and finish_reason != "MAX_TOKENS":
            # MAX_TOKENS with no text (thinking ate the cap) is a truncation for the
            # orchestrator to retry with a higher cap, not an empty response.
            raise AiError.provider_error("Gemini trả response không có nội dung")

        return LLMResult(
            text=text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            finish_reason=finish_reason,
        )
