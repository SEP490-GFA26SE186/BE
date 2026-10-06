"""Full story orchestrator (spec 8, 3.11.1, 3.11.3, 3.11.4) driven by ScriptedLLMProvider."""

import logging

import pytest

from app.core.guards import find_forbidden_terms
from app.core.prompt import render_story_prompt
from app.core.story import estimate_max_output_tokens, generate_story
from app.core.validator import RULES_BY_CODE, Severity, ValidationContext, validate
from app.errors import AiError, ErrorCode
from tests.fixtures.frames import make_frame
from tests.fixtures.llm_outputs import drop_page, set_checkpoint_field, set_page_text, valid_output
from tests.fixtures.scripted import ScriptedLLMProvider, result

# 8 sentences x 11 words = 88 words > 70 x 1.1: PAGE_LENGTH_OUT_OF_RANGE (DOWNGRADE) only.
LONG_P3_FIRST = " ".join(["{NV1} ngồi đọc sách bên cửa sổ cạnh chậu cây xanh."] * 8)
LONG_P3_SECOND = " ".join(["{NV1} tưới nước cho luống rau trước hiên cùng mọi người."] * 8)

TRUNCATED_DETAIL_MARK = "bị cắt giữa chừng"


@pytest.fixture
def settings(settings):
    # Distinct values so the tests can tell which temperature each call used.
    return settings.model_copy(update={"llm_temperature": 0.9, "llm_retry_temperature": 0.3})


@pytest.fixture
def frame():
    return make_frame("medium")


def good(frame):
    return valid_output(frame)


def bad_retry(frame):
    """One RETRY issue: emotion answer outside the enum (EMOTION_ANSWER_INVALID, k1)."""
    return set_checkpoint_field(valid_output(frame), "k1", "answer", "confused")


def downgrade_only(frame, text=LONG_P3_FIRST):
    return set_page_text(valid_output(frame), "p3", text)


def with_preachy(out, page_id):
    """Adds a WARN (PREACHY_PHRASE) on `page_id`."""
    page = next(p for p in out.pages if p.page_id == page_id)
    return set_page_text(out, page_id, page.text + " Đó là bài học.")


def codes(warnings):
    return [(w.code, w.target_id) for w in warnings]


# ---- happy path / retry turn ----


async def test_first_attempt_valid_one_call(frame, settings) -> None:
    llm = ScriptedLLMProvider([result(good(frame))])
    resp = await generate_story(frame, llm, settings)
    assert len(llm.calls) == 1
    assert resp.usage.attempts == 1
    assert resp.warnings == []
    assert llm.calls[0].temperature == settings.llm_temperature


async def test_retry_is_multi_turn_with_issue_list(frame, settings) -> None:
    first = with_preachy(bad_retry(frame), "p5")  # RETRY + WARN
    raw_first = first.model_dump_json()
    llm = ScriptedLLMProvider([result(raw_first), result(good(frame))])

    resp = await generate_story(frame, llm, settings)

    assert resp.usage.attempts == 2
    assert resp.warnings == []
    second = llm.calls[1]
    assert [t.role for t in second.contents] == ["user", "model", "user"]
    assert second.contents[0].text == render_story_prompt(frame, settings)
    assert second.contents[1].text == raw_first
    assert second.temperature == settings.llm_retry_temperature
    assert second.max_output_tokens == llm.calls[0].max_output_tokens
    fix = second.contents[2].text
    issues = validate(ValidationContext(frame, first, 1))
    retry = [i for i in issues if i.severity is Severity.RETRY]
    warn = [i for i in issues if i.severity is Severity.WARN]
    assert [i.code for i in retry] == ["EMOTION_ANSWER_INVALID"]
    assert [i.code for i in warn] == ["PREACHY_PHRASE"]
    assert f"- {retry[0].detail}" in fix.splitlines()  # detail of the RETRY issue
    assert warn[0].detail not in fix and "bài học" not in fix  # the WARN issue is not sent
    assert "page_id" in fix and "checkpoint_id" in fix  # closing reminder


async def test_retry_temperature_default_is_not_sent(frame, settings) -> None:
    s = settings.model_copy(update={"llm_retry_temperature": None})
    llm = ScriptedLLMProvider([result(bad_retry(frame)), result(good(frame))])
    await generate_story(frame, llm, s)
    assert llm.calls[1].temperature is None


async def test_retry_turn_never_contains_forbidden_terms(frame, settings) -> None:
    first = drop_page(bad_retry(frame), "p2")
    llm = ScriptedLLMProvider([result(first), result(good(frame))])
    await generate_story(frame, llm, settings)
    for turn in llm.calls[1].contents:
        if turn.role == "user":
            assert find_forbidden_terms(turn.text, frame.forbidden_terms) == []


async def test_retry_retry_is_output_invalid_with_summed_usage(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(bad_retry(frame), input_tokens=100, output_tokens=200),
        result(bad_retry(frame), input_tokens=150, output_tokens=250),
    ])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    err = exc.value
    assert err.code is ErrorCode.OUTPUT_INVALID
    assert err.status_code == 502
    assert err.usage is not None
    assert err.usage.attempts == 2
    assert (err.usage.input_tokens, err.usage.output_tokens) == (250, 450)


# ---- DOWNGRADE ----


async def test_downgrade_twice_accepts_second_with_warning(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(downgrade_only(frame)),
        result(downgrade_only(frame, LONG_P3_SECOND)),
    ])
    resp = await generate_story(frame, llm, settings)
    assert resp.usage.attempts == 2
    assert resp.pages["p3"].text == LONG_P3_SECOND
    assert codes(resp.warnings) == [("PAGE_LENGTH_OUT_OF_RANGE", "p3")]


async def test_downgrade_then_good_has_no_warnings(frame, settings) -> None:
    llm = ScriptedLLMProvider([result(downgrade_only(frame)), result(good(frame))])
    resp = await generate_story(frame, llm, settings)
    assert resp.usage.attempts == 2
    assert resp.warnings == []
    assert resp.pages["p3"].text == good(frame).pages[2].text


async def test_review_focus_1_downgrade_fallback_returns_first_output(frame, settings) -> None:
    """Spec 3.11.1: attempt 1 only DOWNGRADE + WARN, attempt 2 loses p3 -> keep attempt 1."""
    first = with_preachy(downgrade_only(frame), "p5")
    llm = ScriptedLLMProvider([
        result(first, input_tokens=100, output_tokens=200),
        result(drop_page(good(frame), "p3"), input_tokens=150, output_tokens=250),
    ])

    resp = await generate_story(frame, llm, settings)

    assert resp.pages["p3"].text == LONG_P3_FIRST  # output of attempt 1
    assert list(resp.pages) == frame.pages
    assert codes(resp.warnings) == [
        ("PAGE_LENGTH_OUT_OF_RANGE", "p3"),
        ("PREACHY_PHRASE", "p5"),
    ]
    assert "PAGE_IDS_MISMATCH" not in {w.code for w in resp.warnings}
    assert resp.usage.attempts == 2
    assert (resp.usage.input_tokens, resp.usage.output_tokens) == (250, 450)


async def test_review_focus_1_control_retry_then_retry_is_invalid(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(bad_retry(frame)),
        result(drop_page(good(frame), "p3")),
    ])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    assert exc.value.code is ErrorCode.OUTPUT_INVALID


# ---- WARN ----


async def test_warnings_only_from_accepted_attempt(frame, settings) -> None:
    first = with_preachy(bad_retry(frame), "p5")  # WARN-A + RETRY
    second = with_preachy(good(frame), "p7")  # WARN-B
    llm = ScriptedLLMProvider([result(first), result(second)])
    resp = await generate_story(frame, llm, settings)
    assert codes(resp.warnings) == [("PREACHY_PHRASE", "p7")]


async def test_warn_only_does_not_retry(frame, settings) -> None:
    llm = ScriptedLLMProvider([result(with_preachy(good(frame), "p5"))])
    resp = await generate_story(frame, llm, settings)
    assert len(llm.calls) == 1
    assert resp.usage.attempts == 1
    assert codes(resp.warnings) == [("PREACHY_PHRASE", "p5")]
    assert resp.warnings[0].detail


# ---- Review Focus 2: truncation ----


async def test_review_focus_2_max_tokens_is_truncated_and_raises_cap(
    frame, settings, caplog
) -> None:
    s = settings.model_copy(update={"llm_thinking_budget": 512})
    cap = estimate_max_output_tokens(frame, s)
    # Parses fine, but MAX_TOKENS: must NOT be parsed / accepted.
    llm = ScriptedLLMProvider([
        result(good(frame), finish_reason="MAX_TOKENS"),
        result(good(frame)),
    ])

    with caplog.at_level(logging.INFO, logger="app.core.story"):
        resp = await generate_story(frame, llm, s)

    assert resp.usage.attempts == 2
    assert llm.calls[0].max_output_tokens == cap + 512
    # ceil(cap x 1.5) + budget; the budget is not multiplied.
    assert llm.calls[1].max_output_tokens == (3 * cap + 1) // 2 + 512
    assert TRUNCATED_DETAIL_MARK in llm.calls[1].contents[2].text
    assert "OUTPUT_TRUNCATED" in caplog.text
    assert "OUTPUT_SCHEMA_INVALID" not in caplog.text
    assert RULES_BY_CODE["OUTPUT_TRUNCATED"].severity is Severity.RETRY


async def test_review_focus_2_unparseable_stop_keeps_cap(frame, settings, caplog) -> None:
    s = settings.model_copy(update={"llm_thinking_budget": 512})
    raw = good(frame).model_dump_json()
    llm = ScriptedLLMProvider([result(raw[: len(raw) // 2]), result(good(frame))])

    with caplog.at_level(logging.INFO, logger="app.core.story"):
        await generate_story(frame, llm, s)

    assert llm.calls[1].max_output_tokens == llm.calls[0].max_output_tokens
    assert llm.calls[1].contents[1].text == raw[: len(raw) // 2]  # raw, even if broken
    assert TRUNCATED_DETAIL_MARK not in llm.calls[1].contents[2].text
    assert "OUTPUT_SCHEMA_INVALID" in caplog.text
    assert "OUTPUT_TRUNCATED" not in caplog.text


async def test_review_focus_2_max_tokens_twice_is_output_invalid(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(good(frame), finish_reason="MAX_TOKENS"),
        result(good(frame), finish_reason="MAX_TOKENS"),
    ])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    assert exc.value.code is ErrorCode.OUTPUT_INVALID
    assert exc.value.usage.attempts == 2


# ---- usage on errors (spec 8.3 table) ----


async def test_safety_blocked_first_call_has_usage(frame, settings) -> None:
    llm = ScriptedLLMProvider([AiError.safety_blocked("chặn", call_tokens=(70, 3))])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    u = exc.value.usage
    assert exc.value.code is ErrorCode.SAFETY_BLOCKED
    assert u is not None and u.attempts == 1
    assert (u.input_tokens, u.output_tokens) == (70, 3)


async def test_provider_error_first_call_has_no_usage(frame, settings) -> None:
    llm = ScriptedLLMProvider([AiError.provider_error("lỗi")])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    assert exc.value.code is ErrorCode.PROVIDER_ERROR
    assert exc.value.usage is None


async def test_timeout_on_retry_has_first_call_usage(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(bad_retry(frame), input_tokens=100, output_tokens=200),
        AiError.timeout("hết giờ"),
    ])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    u = exc.value.usage
    assert exc.value.code is ErrorCode.TIMEOUT
    assert u is not None and u.attempts == 2
    assert (u.input_tokens, u.output_tokens) == (100, 200)


async def test_safety_blocked_on_retry_sums_both(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result(bad_retry(frame), input_tokens=100, output_tokens=200),
        AiError.safety_blocked("chặn", call_tokens=(300, 0)),
    ])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    u = exc.value.usage
    assert exc.value.code is ErrorCode.SAFETY_BLOCKED
    assert u.attempts == 2
    assert (u.input_tokens, u.output_tokens) == (400, 200)


# ---- forbidden terms (spec 3.1, 10.4) ----


async def test_forbidden_term_lookalike_in_output_is_accepted(frame, settings) -> None:
    out = valid_output(frame)
    p4 = out.pages[3]
    out = set_page_text(out, "p4", p4.text + " An toàn là trên hết.")
    llm = ScriptedLLMProvider([result(out)])
    resp = await generate_story(frame, llm, settings)
    assert resp.warnings == []
    assert "An toàn" in resp.pages["p4"].text


async def test_real_name_in_situation_never_calls_llm(settings) -> None:
    frame = make_frame("medium", situation="An hay giành xe với {NV2}.")
    llm = ScriptedLLMProvider([])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    assert exc.value.code is ErrorCode.FORBIDDEN_TERM_DETECTED
    assert exc.value.usage is None
    assert llm.calls == []


# ---- log (spec 8.5) ----


async def test_info_log_has_codes_of_discarded_attempt_but_no_story_text(
    frame, settings, caplog
) -> None:
    first = with_preachy(downgrade_only(frame), "p5")
    llm = ScriptedLLMProvider([result(first), result(drop_page(good(frame), "p3"))])
    with caplog.at_level(logging.INFO, logger="app.core.story"):
        await generate_story(frame, llm, settings)
    info = "\n".join(r.getMessage() for r in caplog.records if r.levelno == logging.INFO)
    assert frame.request_id in info
    assert "PAGE_LENGTH_OUT_OF_RANGE" in info
    assert "PAGE_IDS_MISMATCH" in info  # issues of the discarded attempt are logged
    assert "ngồi đọc sách" not in info


# ---- fix round 1: broadened fallback, empty attempt 1, no assert ----


def _second_failures(frame):
    raw = good(frame).model_dump_json()
    return {
        "retry_issue": result(drop_page(good(frame), "p3"), input_tokens=150, output_tokens=250),
        "truncated": result(good(frame), input_tokens=150, output_tokens=250,
                            finish_reason="MAX_TOKENS"),
        "unparseable": result(raw[: len(raw) // 2], input_tokens=150, output_tokens=250),
        "provider_error": AiError.provider_error("lỗi"),
        "timeout": AiError.timeout("hết giờ"),
        "safety_blocked": AiError.safety_blocked("chặn", call_tokens=(150, 250)),
    }


# Tokens of the failed retry that reach usage: none without a response (provider/timeout).
_SECOND_TOKENS = {
    "retry_issue": (150, 250), "truncated": (150, 250), "unparseable": (150, 250),
    "provider_error": (0, 0), "timeout": (0, 0), "safety_blocked": (150, 250),
}


@pytest.mark.parametrize("kind", list(_SECOND_TOKENS))
async def test_downgrade_fallback_on_any_retry_failure(frame, settings, kind) -> None:
    first = with_preachy(downgrade_only(frame), "p5")
    llm = ScriptedLLMProvider([
        result(first, input_tokens=100, output_tokens=200),
        _second_failures(frame)[kind],
    ])

    resp = await generate_story(frame, llm, settings)

    assert len(llm.calls) == 2
    assert resp.pages["p3"].text == LONG_P3_FIRST
    assert codes(resp.warnings) == [
        ("PAGE_LENGTH_OUT_OF_RANGE", "p3"),
        ("PREACHY_PHRASE", "p5"),
    ]
    extra_in, extra_out = _SECOND_TOKENS[kind]
    assert resp.usage.attempts == 2
    assert (resp.usage.input_tokens, resp.usage.output_tokens) == (100 + extra_in, 200 + extra_out)


async def test_retry_after_empty_truncated_text_has_no_empty_model_turn(frame, settings) -> None:
    llm = ScriptedLLMProvider([
        result("", output_tokens=0, finish_reason="MAX_TOKENS"),
        result(good(frame)),
    ])
    resp = await generate_story(frame, llm, settings)

    assert resp.usage.attempts == 2
    contents = llm.calls[1].contents
    assert [t.role for t in contents] == ["user"]
    prompt = render_story_prompt(frame, settings)
    assert contents[0].text.startswith(prompt)
    assert TRUNCATED_DETAIL_MARK in contents[0].text[len(prompt):]


async def test_accepted_attempt_without_output_fails_closed(
    frame, settings, monkeypatch
) -> None:
    import app.core.story as story

    # Simulate the impossible: an attempt with no issues and no parsed output.
    monkeypatch.setattr(story, "_check", lambda req, res, n: story._Attempt(res.text, None, []))
    llm = ScriptedLLMProvider([result(good(frame))])
    with pytest.raises(AiError) as exc:
        await generate_story(frame, llm, settings)
    assert exc.value.code is ErrorCode.OUTPUT_INVALID
    assert exc.value.usage.attempts == 1
