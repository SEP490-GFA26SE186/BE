"""Story analysis orchestrator (family-story spec 5.3): guard -> prompt -> call -> parse ->
validate, with at most one internal retry carrying the issue list (same shape as
`generate_story`). There is no DOWNGRADE: an attempt is valid or it is not.
"""

import logging
import math
import time
from dataclasses import dataclass

from pydantic import ValidationError

from app.config import Settings
from app.core.guards import assert_no_forbidden_terms
from app.core.prompt import render_analyze_prompt, render_analyze_retry_turn
from app.core.story import request_max_output_tokens, retry_text_cap
from app.core.usage import UsageAccumulator
from app.core.validator import Issue, Severity
from app.core.validator.analyze_rules import validate_analysis
from app.errors import AiError
from app.providers.llm.base import LLMProvider, LLMResult, StoryLLMCall, Turn
from app.schemas.analyze import StoryAnalyzeRequest, StoryAnalyzeResponse
from app.schemas.common import Usage
from app.schemas.llm import LlmAnalyzeOutput

logger = logging.getLogger(__name__)

_TOKEN_SAFETY_FACTOR = 1.3
# Words outside the two limited texts: codes, reasons and the JSON keys.
_OVERHEAD_WORDS = 120

# Vietnamese on purpose: retry prompt / returned to Node (spec 7.2).
_TRUNCATED_DETAIL = "JSON bị cắt giữa chừng vì quá dài; viết gọn hơn, trả lại TOÀN BỘ JSON."
_SCHEMA_INVALID_DETAIL = (
    "Kết quả không phải JSON hợp lệ theo schema đã yêu cầu; trả lại TOÀN BỘ JSON đúng schema."
)
_OUTPUT_INVALID_MESSAGE = "Output phân tích của AI không hợp lệ."


def estimate_analyze_max_output_tokens(req: StoryAnalyzeRequest, settings: Settings) -> int:
    words = req.limits.moment_max_words + req.limits.seed_event_max_words + _OVERHEAD_WORDS
    return math.ceil(round(words * settings.tokens_per_word * _TOKEN_SAFETY_FACTOR, 6))


def _guard_request(req: StoryAnalyzeRequest) -> None:
    # Only fields the parent typed; the catalog is Specialist-written and not scanned.
    texts: dict[str, str | None] = {"situation": req.situation}
    for i, character in enumerate(req.characters, start=1):
        texts[f"characters[{i}].description"] = character.description
    assert_no_forbidden_terms(texts, req.forbidden_terms)


def _blank_to_none(value: str | None) -> str | None:
    return value if value is not None and value.strip() else None


@dataclass(frozen=True)
class _Attempt:
    raw: str
    output: LlmAnalyzeOutput | None
    issues: list[Issue]

    @property
    def codes(self) -> list[str]:
        return [issue.code for issue in self.issues]


def _parse_issue(code: str, detail: str) -> Issue:
    return Issue(code=code, target_id=None, detail=detail, severity=Severity.RETRY)


def _check(req: StoryAnalyzeRequest, result: LLMResult) -> _Attempt:
    if result.finish_reason == "MAX_TOKENS":
        return _Attempt(result.text, None, [_parse_issue("OUTPUT_TRUNCATED", _TRUNCATED_DETAIL)])
    try:
        output = LlmAnalyzeOutput.model_validate_json(result.text)
    except ValidationError:
        issue = _parse_issue("OUTPUT_SCHEMA_INVALID", _SCHEMA_INVALID_DETAIL)
        return _Attempt(result.text, None, [issue])
    # Schema-constrained output often fills an unused optional with "": treat it as null.
    output = output.model_copy(update={
        "moment_summary": _blank_to_none(output.moment_summary),
        "seed_event": _blank_to_none(output.seed_event),
    })
    return _Attempt(result.text, output, validate_analysis(req, output))


def _retry_contents(prompt: str, first: _Attempt) -> list[Turn]:
    fix_up = render_analyze_retry_turn(first.issues)
    if not first.raw.strip():
        return [Turn(role="user", text=f"{prompt}\n\n{fix_up}")]
    return [
        Turn(role="user", text=prompt),
        Turn(role="model", text=first.raw),
        Turn(role="user", text=fix_up),
    ]


async def analyze_story(
    req: StoryAnalyzeRequest, llm: LLMProvider, settings: Settings
) -> StoryAnalyzeResponse:
    """Attempt 1 valid -> accept; else retry once with the issue list; still invalid ->
    OUTPUT_INVALID. Usage sums every call, also on errors once a call returned a response."""
    started = time.monotonic()
    _guard_request(req)  # before any LLM call
    prompt = render_analyze_prompt(req)
    text_cap = estimate_analyze_max_output_tokens(req, settings)
    acc = UsageAccumulator()
    attempts: list[_Attempt] = []

    def elapsed_ms() -> int:
        return int((time.monotonic() - started) * 1000)

    def usage() -> Usage:
        return acc.to_usage(llm.name, llm.model, elapsed_ms(), settings)

    def log(outcome: str) -> None:
        # ids, counts, codes and tokens only - never the situation or the analysis text.
        logger.info(
            "analysis %s %s: catalog=%d needs=%d forced=%d attempts=%d codes=%s tokens=%d/%d "
            "latency_ms=%d",
            req.request_id, outcome, len(req.catalog), len(req.needs),
            len(req.forced_sub_skills), acc.attempts, [a.codes for a in attempts],
            acc.input_tokens, acc.output_tokens, elapsed_ms(),
        )

    async def run(contents: list[Turn], cap: int, temperature: float | None) -> _Attempt:
        call = StoryLLMCall(
            frame=req,
            contents=contents,
            response_schema=LlmAnalyzeOutput,
            max_output_tokens=request_max_output_tokens(cap, settings),
            temperature=temperature,
        )
        acc.start_call()
        try:
            result = await llm.generate_story(call)
        except AiError as error:
            if error.call_tokens is not None:
                acc.add_response(*error.call_tokens)
            if acc.has_response:
                error.usage = usage()
            log(f"failed {error.code}")
            raise
        acc.add_response(result.input_tokens, result.output_tokens)
        attempt = _check(req, result)
        attempts.append(attempt)
        return attempt

    accepted = await run([Turn(role="user", text=prompt)], text_cap, settings.llm_temperature)
    if accepted.issues:
        truncated = "OUTPUT_TRUNCATED" in accepted.codes
        accepted = await run(
            _retry_contents(prompt, accepted),
            retry_text_cap(text_cap, settings) if truncated else text_cap,
            settings.llm_retry_temperature,
        )
    if accepted.issues or accepted.output is None:
        log("output invalid")
        raise AiError.output_invalid(_OUTPUT_INVALID_MESSAGE, usage=usage())

    out = accepted.output
    final_usage = usage()
    log("ok")
    return StoryAnalyzeResponse(
        request_id=req.request_id,
        moment_summary=out.moment_summary,
        seed_event=out.seed_event,
        sub_skill_codes=out.sub_skill_codes,
        reasons=out.reasons,
        usage=final_usage,
        provider=final_usage.provider,
        model=final_usage.model,
    )
