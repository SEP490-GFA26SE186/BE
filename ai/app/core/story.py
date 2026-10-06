"""Story orchestrator (spec 8): guard -> prompt -> call -> parse -> validate -> decide -> map.

At most one internal retry, as a multi-turn conversation carrying the issue list (spec 8.2).
The decision table (spec 8 step 7, 3.11.1) is documented on `generate_story`.
"""

import logging
import math
import time
from dataclasses import dataclass

from app.config import Settings
from app.core.guards import assert_no_forbidden_terms
from app.core.mapping import map_to_response, parse_llm_output
from app.core.prompt import PROMPT_VERSION, render_retry_turn, render_story_prompt
from app.core.usage import UsageAccumulator
from app.core.validator import RULES_BY_CODE, Issue, Severity, ValidationContext, validate
from app.errors import AiError
from app.providers.llm.base import LLMProvider, LLMResult, StoryLLMCall, Turn
from app.schemas.common import OutputWarning, Usage
from app.schemas.llm import LlmStoryOutput
from app.schemas.story import CheckpointType, StoryGenerateRequest, StoryGenerateResponse

logger = logging.getLogger(__name__)

# docs/04: max_output_tokens = total max words x TOKENS_PER_WORD x 1.3
_TOKEN_SAFETY_FACTOR = 1.3


def _max_words(req: StoryGenerateRequest, settings: Settings) -> int:
    """Upper bound of words the model may return (spec 8.1 table)."""
    lim = req.limits
    per_checkpoint = {
        CheckpointType.EMOTION_SELF: lim.question_max_words + lim.hint_max_words + 1,
        CheckpointType.EMOTION_OTHER: lim.question_max_words + lim.hint_max_words + 1,
        CheckpointType.PERSPECTIVE: (
            lim.question_max_words + lim.hint_max_words + 3 * lim.option_max_words
        ),
        CheckpointType.PROBLEM_SOLVING: (
            lim.question_max_words + 3 * (lim.option_max_words + lim.feedback_max_words)
        ),
        CheckpointType.REFLECTION: lim.question_max_words,
    }
    return (
        len(req.pages) * lim.page_max_words
        + sum(per_checkpoint[cp.type] for cp in req.checkpoints)
        # Scenes counted at their upper bound: the model picks how many, up to max_scenes.
        + lim.max_scenes * settings.scene_description_max_words
    )


def estimate_max_output_tokens(req: StoryGenerateRequest, settings: Settings) -> int:
    """Cap for the story TEXT only (spec 8.1), rounded up. Thinking is added separately."""
    raw = _max_words(req, settings) * settings.tokens_per_word * _TOKEN_SAFETY_FACTOR
    # round() first so float noise (50 x 2.0 x 1.3 = 130.00000000000003) does not add a token.
    return math.ceil(round(raw, 6))


def request_max_output_tokens(text_cap: int, settings: Settings) -> int:
    """Value sent to the SDK: thinking tokens must not eat into the story (spec 3.11.4)."""
    return text_cap + settings.llm_thinking_budget


def _guard_request(req: StoryGenerateRequest) -> None:
    # Spec 3.1: only fields the parent typed. topic.* is expert-written and not scanned.
    texts: dict[str, str | None] = {"situation": req.situation}
    for i, character in enumerate(req.characters, start=1):
        texts[f"characters[{i}].description"] = character.description
    assert_no_forbidden_terms(texts, req.forbidden_terms)


# Issue details are Vietnamese on purpose: they go into the retry prompt (spec 7.2, 8.2).
_TRUNCATED_DETAIL = "JSON bị cắt giữa chừng vì quá dài; viết gọn hơn, trả lại TOÀN BỘ JSON."
_SCHEMA_INVALID_DETAIL = (
    "Kết quả không phải JSON hợp lệ theo schema đã yêu cầu; trả lại TOÀN BỘ JSON đúng schema."
)
# Vietnamese on purpose: returned to Node (spec 7.2).
_OUTPUT_INVALID_MESSAGE = "Output của AI không hợp lệ."


def retry_text_cap(text_cap: int, settings: Settings) -> int:
    """Text cap of the retry after OUTPUT_TRUNCATED (spec 3.11.4): raised, rounded up."""
    return math.ceil(round(text_cap * settings.llm_truncation_retry_factor, 6))


@dataclass(frozen=True)
class _Attempt:
    raw: str  # sent back verbatim as the `model` turn of the retry, even if broken
    output: LlmStoryOutput | None
    issues: list[Issue]

    def has(self, *severities: Severity) -> bool:
        return any(issue.severity in severities for issue in self.issues)

    @property
    def codes(self) -> list[str]:
        return [issue.code for issue in self.issues]


def _parse_step_issue(code: str, detail: str) -> Issue:
    # #1 / #22 are checked here, not by their rule (spec 3.11.8); severity from the registry.
    return Issue(code=code, target_id=None, detail=detail, severity=RULES_BY_CODE[code].severity)


def _check(req: StoryGenerateRequest, result: LLMResult, attempt: int) -> _Attempt:
    """Spec 8 steps 5-6. Never raises: parse failures are issues like any other."""
    if result.finish_reason == "MAX_TOKENS":
        # Never parse a truncated reply, even if it happens to parse: it is a cut story.
        issue = _parse_step_issue("OUTPUT_TRUNCATED", _TRUNCATED_DETAIL)
        return _Attempt(result.text, None, [issue])
    output = parse_llm_output(result.text)
    if output is None:
        issue = _parse_step_issue("OUTPUT_SCHEMA_INVALID", _SCHEMA_INVALID_DETAIL)
        return _Attempt(result.text, None, [issue])
    return _Attempt(result.text, output, validate(ValidationContext(req, output, attempt)))


def _warnings(accepted: _Attempt) -> list[OutputWarning]:
    # The accepted attempt has no RETRY: its DOWNGRADE and WARN issues become warnings.
    return [
        OutputWarning(code=i.code, target_id=i.target_id, detail=i.detail)
        for i in accepted.issues
        if i.severity is not Severity.RETRY
    ]


def _retry_contents(prompt: str, first: _Attempt) -> list[Turn]:
    """Turns of the retry (spec 8.2): prompt, attempt 1 verbatim, then the issue list.

    An empty attempt 1 (e.g. MAX_TOKENS before any text) must not become an empty `model`
    turn: the issue list is then appended to the original prompt in a single `user` turn.
    """
    fix_up = render_retry_turn(first.issues)
    if not first.raw.strip():
        return [Turn(role="user", text=f"{prompt}\n\n{fix_up}")]
    return [
        Turn(role="user", text=prompt),
        Turn(role="model", text=first.raw),
        Turn(role="user", text=fix_up),
    ]


async def generate_story(
    req: StoryGenerateRequest, llm: LLMProvider, settings: Settings
) -> StoryGenerateResponse:
    """Decision (spec 8 step 7):

    - attempt 1 without RETRY / DOWNGRADE -> accept it (WARN -> warnings);
    - otherwise retry once with the issue list; attempt 2 without RETRY -> accept attempt 2;
    - attempt 1 had only DOWNGRADE / WARN and attempt 2 fails in any way (RETRY issues,
      truncated / unparseable, or the provider raising PROVIDER_ERROR / TIMEOUT /
      SAFETY_BLOCKED) -> accept attempt 1 (fallback, spec 3.11.1); attempt 2 is only logged;
    - attempt 2 still RETRY, attempt 1 had RETRY -> OUTPUT_INVALID (a provider error on
      attempt 2 propagates with the usage so far).

    Warnings come only from the accepted attempt. Usage sums every call, also on errors once
    a call returned a response (spec 8.3).
    """
    started = time.monotonic()
    _guard_request(req)  # step 1: before any LLM call
    prompt = render_story_prompt(req, settings)
    text_cap = estimate_max_output_tokens(req, settings)
    acc = UsageAccumulator()
    attempts: list[_Attempt] = []

    def elapsed_ms() -> int:
        return int((time.monotonic() - started) * 1000)

    def usage() -> Usage:
        return acc.to_usage(llm.name, llm.model, elapsed_ms(), settings)

    def log(outcome: str) -> None:
        # Spec 8.5: ids, counts, codes and tokens only - never story text at INFO.
        logger.info(
            "story %s %s: pages=%d checkpoints=%d attempts=%d codes=%s tokens=%d/%d "
            "latency_ms=%d",
            req.request_id, outcome, len(req.pages), len(req.checkpoints), acc.attempts,
            [a.codes for a in attempts], acc.input_tokens, acc.output_tokens, elapsed_ms(),
        )

    async def run(contents: list[Turn], cap: int, temperature: float | None) -> _Attempt:
        call = StoryLLMCall(
            frame=req,
            contents=contents,
            response_schema=LlmStoryOutput,
            max_output_tokens=request_max_output_tokens(cap, settings),
            temperature=temperature,
        )
        acc.start_call()
        try:
            result = await llm.generate_story(call)
        except AiError as error:
            if error.call_tokens is not None:  # a blocked response still reports usage
                acc.add_response(*error.call_tokens)
            if acc.has_response:
                error.usage = usage()
            log(f"failed {error.code}")
            raise
        acc.add_response(result.input_tokens, result.output_tokens)
        logger.debug(
            "story %s attempt %d finish_reason=%s raw=%s",
            req.request_id, acc.attempts, result.finish_reason, result.text,
        )
        attempt = _check(req, result, acc.attempts)
        attempts.append(attempt)
        return attempt

    first_turn = Turn(role="user", text=prompt)
    first = await run([first_turn], text_cap, settings.llm_temperature)
    accepted = first
    if first.has(Severity.RETRY, Severity.DOWNGRADE_AFTER_RETRY):
        # Attempt 1 would have been accepted as attempt 2 (only DOWNGRADE / WARN): whatever
        # goes wrong with the retry, keep it (spec 3.11.1).
        first_acceptable = not first.has(Severity.RETRY)
        truncated = any(i.code == "OUTPUT_TRUNCATED" for i in first.issues)
        try:
            second = await run(
                _retry_contents(prompt, first),
                retry_text_cap(text_cap, settings) if truncated else text_cap,
                settings.llm_retry_temperature,
            )
        except AiError as error:
            if not first_acceptable:
                raise
            # The failed call's tokens are already in `acc` (run() adds call_tokens).
            logger.info(
                "story %s retry failed with %s, falling back to attempt 1",
                req.request_id, error.code,
            )
            second = None
        if second is not None and not second.has(Severity.RETRY):
            accepted = second
        elif first_acceptable:
            accepted = first  # DOWNGRADE fallback (spec 3.11.1)
        else:
            log("output invalid")
            raise AiError.output_invalid(_OUTPUT_INVALID_MESSAGE, usage=usage())

    if accepted.output is None:
        # Unreachable by construction (an attempt without RETRY issues has parsed); fail
        # closed rather than assert, which `python -O` would strip.
        log("accepted attempt has no output")
        raise AiError.output_invalid(_OUTPUT_INVALID_MESSAGE, usage=usage())
    try:
        response = map_to_response(
            req, accepted.output, _warnings(accepted), usage(), PROMPT_VERSION
        )
    except ValueError:
        # Validator gap: every wire constraint should be a RETRY rule. Fail closed.
        log("output does not map")
        raise AiError.output_invalid(_OUTPUT_INVALID_MESSAGE, usage=usage()) from None

    log("ok, downgrade fallback to attempt 1" if accepted is first and acc.attempts > 1 else "ok")
    return response
