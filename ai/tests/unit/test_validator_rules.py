"""Structure and checkpoint rules #2-#14 (spec 7.3). Each case breaks exactly one thing."""

import unicodedata
from pathlib import Path

import pytest

from app.core.validator import RULES_BY_CODE, Issue, Severity, ValidationContext, validate
from app.schemas.llm import LlmOption, LlmStoryOutput
from app.schemas.story import StoryGenerateRequest
from tests.fixtures import llm_outputs as lo
from tests.fixtures.frames import make_frame, make_limits
from tests.fixtures.llm_outputs import valid_output


def run(frame: StoryGenerateRequest, out: LlmStoryOutput, code: str) -> list[Issue]:
    return list(RULES_BY_CODE[code].check(ValidationContext(frame=frame, output=out, attempt=1)))


def assert_one(
    issues: list[Issue], code: str, target: str | None, *mentions: str, count: int | None = None
) -> None:
    """Every issue carries `code` and RETRY; `target` is among the targets; the issue for it
    mentions `mentions`. With `count`, the number of issues must match exactly."""
    assert issues
    assert {i.code for i in issues} == {code}
    assert all(i.severity is Severity.RETRY for i in issues)
    hit = [i for i in issues if i.target_id == target]
    assert hit, f"no issue for target {target!r}: {issues}"
    for text in mentions:
        assert any(text in i.detail for i in hit), (text, hit)
    if count is not None:
        assert len(issues) == count, issues


@pytest.fixture
def frame() -> StoryGenerateRequest:
    # long: k1 emotion_self p2, k2 perspective p4, k3 problem_solving p6, k4 emotion_other p8,
    # k5 reflection p10.
    return make_frame("long")


@pytest.fixture
def out(frame: StoryGenerateRequest) -> LlmStoryOutput:
    return valid_output(frame)


@pytest.mark.parametrize("length", ["short", "medium", "long"])
def test_valid_output_passes(length: str) -> None:
    f = make_frame(length)
    assert validate(ValidationContext(frame=f, output=valid_output(f), attempt=1)) == []


def test_valid_output_passes_custom() -> None:
    f = make_frame(
        "custom",
        pages=5,
        checkpoints=[("emotion_other", 2), ("problem_solving", 3), ("reflection", 5)],
    )
    assert validate(ValidationContext(frame=f, output=valid_output(f), attempt=1)) == []


# ---- #2 / #3 ----


def test_page_ids(frame, out) -> None:
    assert run(frame, out, "PAGE_IDS_MISMATCH") == []
    assert_one(
        run(frame, lo.drop_page(out, "p3"), "PAGE_IDS_MISMATCH"), "PAGE_IDS_MISMATCH", "p3", count=1
    )
    assert_one(
        run(frame, lo.add_unknown_page(out, "p9x"), "PAGE_IDS_MISMATCH"),
        "PAGE_IDS_MISMATCH",
        "p9x",
        "p9x",
        count=1,
    )
    dup = run(frame, lo.duplicate_page(out, "p2"), "PAGE_IDS_MISMATCH")
    assert_one(dup, "PAGE_IDS_MISMATCH", "p2", "p2", count=1)


def test_checkpoint_ids(frame, out) -> None:
    code = "CHECKPOINT_IDS_MISMATCH"
    assert run(frame, out, code) == []
    missing = out.model_copy(deep=True)
    missing.checkpoints = [c for c in missing.checkpoints if c.checkpoint_id != "k3"]
    assert_one(run(frame, missing, code), code, "k3", "k3")
    extra = out.model_copy(deep=True)
    extra.checkpoints.append(extra.checkpoints[0].model_copy(update={"checkpoint_id": "k9"}))
    assert_one(run(frame, extra, code), code, "k9", "k9")
    dup = out.model_copy(deep=True)
    dup.checkpoints.append(dup.checkpoints[1].model_copy())
    assert_one(run(frame, dup, code), code, "k2", "k2")


def test_checkpoint_type_changed(frame, out) -> None:
    code = "CHECKPOINT_IDS_MISMATCH"
    bad = lo.set_checkpoint_field(out, "k4", "type", "emotion_self")
    assert_one(run(frame, bad, code), code, "k4", "k4", "emotion_other")


# ---- #4 / #5 / #6 ----


def test_page_scene_missing(frame, out) -> None:
    code = "PAGE_SCENE_MISSING"
    assert run(frame, out, code) == []
    assert_one(run(frame, lo.set_scene_of_page(out, "p4", "s9"), code), code, "p4", "p4", "s9")


def test_scene_count(frame, out) -> None:
    code = "SCENE_COUNT_EXCEEDED"
    assert run(frame, out, code) == []
    # max_scenes = 4 and the valid output already has 4; an unused fifth still counts.
    assert_one(run(frame, lo.add_scenes(out, 1), code), code, None, "5", "4", count=1)


@pytest.mark.parametrize("blank", ["", "   \n\t"])
def test_scene_description_missing(frame, out, blank: str) -> None:
    code = "SCENE_DESCRIPTION_MISSING"
    assert run(frame, out, code) == []
    bad = out.model_copy(deep=True)
    bad.scenes[1].description = blank
    assert_one(run(frame, bad, code), code, "s2", "s2")


# ---- #7 / #8 ----


@pytest.mark.parametrize("answer", [None, "tired", ""])
def test_emotion_answer(frame, out, answer) -> None:
    code = "EMOTION_ANSWER_INVALID"
    assert run(frame, out, code) == []
    bad = lo.set_checkpoint_field(out, "k1", "answer", answer)
    assert_one(run(frame, bad, code), code, "k1", "k1")


@pytest.mark.parametrize(("cid", "hint"), [("k4", None), ("k1", "  "), ("k2", None)])
def test_hint_missing(frame, out, cid: str, hint) -> None:
    code = "EMOTION_HINT_MISSING"
    assert run(frame, out, code) == []
    bad = lo.set_checkpoint_field(out, cid, "hint", hint)
    assert_one(run(frame, bad, code), code, cid, cid)


# ---- #9 / #10 ----


def _options(out: LlmStoryOutput, ids: list[str | None]) -> list[LlmOption]:
    base = next(c for c in out.checkpoints if c.checkpoint_id == "k2")
    return [o.model_copy(update={"option_id": i}) for o, i in zip(base.options, ids, strict=True)]


def test_perspective_options(frame, out) -> None:
    code = "PERSPECTIVE_OPTIONS_INVALID"
    assert run(frame, out, code) == []
    base = next(c for c in out.checkpoints if c.checkpoint_id == "k2").options
    two = lo.set_options(out, "k2", base[:2])
    assert_one(run(frame, two, code), code, "k2", "k2", "2")
    four = lo.set_options(out, "k2", [*base, base[0].model_copy(update={"option_id": "o4"})])
    assert_one(run(frame, four, code), code, "k2", "k2", "4")
    no_id = lo.set_options(out, "k2", _options(out, ["o1", None, "o3"]))
    assert_one(run(frame, no_id, code), code, "k2", "k2", "option_id")
    dup = lo.set_options(out, "k2", _options(out, ["o1", "o1", "o3"]))
    assert_one(run(frame, dup, code), code, "k2", "k2", "o1")


@pytest.mark.parametrize("answer", ["o4", None])
def test_perspective_answer(frame, out, answer) -> None:
    code = "PERSPECTIVE_ANSWER_INVALID"
    assert run(frame, out, code) == []
    bad = lo.set_checkpoint_field(out, "k2", "answer", answer)
    assert_one(run(frame, bad, code), code, "k2", "k2")


def test_perspective_missing_hint_is_reported_by_hint_rule_only(frame, out) -> None:
    bad = lo.set_checkpoint_field(out, "k2", "hint", None)
    assert run(frame, bad, "PERSPECTIVE_ANSWER_INVALID") == []
    assert run(frame, bad, "PERSPECTIVE_OPTIONS_INVALID") == []
    assert [i.target_id for i in run(frame, bad, "EMOTION_HINT_MISSING")] == ["k2"]


# ---- #11 / #12 ----


def _ps_options(out: LlmStoryOutput) -> list[LlmOption]:
    return next(c for c in out.checkpoints if c.checkpoint_id == "k3").options


def test_problem_solving_roles(frame, out) -> None:
    code = "PROBLEM_SOLVING_ROLES_INVALID"
    assert run(frame, out, code) == []
    opts = _ps_options(out)
    no_avoidant = lo.set_options(out, "k3", [o for o in opts if o.role != "avoidant"])
    assert_one(run(frame, no_avoidant, code), code, "k3", "k3", "avoidant")
    same = lo.set_options(
        out, "k3", [o.model_copy(update={"role": "constructive"}) for o in opts]
    )
    assert_one(run(frame, same, code), code, "k3", "k3", "constructive")
    odd = lo.set_options(
        out, "k3", [o.model_copy(update={"role": "angry"}) if o.role == "impulsive" else o
                    for o in opts]
    )
    issues = run(frame, odd, code)
    assert any("angry" in i.detail for i in issues)
    assert any("impulsive" in i.detail for i in issues)


def test_problem_solving_fields(frame, out) -> None:
    code = "PROBLEM_SOLVING_FIELD_MISSING"
    assert run(frame, out, code) == []
    opts = _ps_options(out)
    no_fb = lo.set_options(
        out, "k3", [o.model_copy(update={"feedback": None}) if o.role == "avoidant" else o
                    for o in opts]
    )
    assert_one(run(frame, no_fb, code), code, "k3", "k3", "avoidant", "feedback")
    blank = lo.set_options(
        out, "k3", [o.model_copy(update={"text": " "}) if o.role == "impulsive" else o
                    for o in opts]
    )
    assert_one(run(frame, blank, code), code, "k3", "k3", "impulsive", "text")


# ---- #13 ----


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("answer", "happy"),
        ("hint", "một gợi ý"),
        ("options", [LlmOption(text="x")]),
    ],
)
def test_reflection_shape(frame, out, field: str, value) -> None:
    code = "REFLECTION_SHAPE_INVALID"
    assert run(frame, out, code) == []
    bad = lo.set_checkpoint_field(out, "k5", field, value)
    assert_one(run(frame, bad, code), code, "k5", "k5", field, count=1)


# ---- #14 ----


def test_unknown_token_in_page_text(frame, out) -> None:
    code = "UNKNOWN_CHARACTER_TOKEN"
    assert run(frame, out, code) == []
    bad = lo.set_page_text(out, "p2", "{NV1} chơi với {NV4} và {NV3} ở sân.")
    issues = run(frame, bad, code)
    assert_one(issues, code, "p2", "{NV4}")
    assert len(issues) == 1  # {NV1} and {NV3} are declared


@pytest.mark.parametrize("field", ["question", "hint"])
def test_unknown_token_in_checkpoint_fields(frame, out, field: str) -> None:
    code = "UNKNOWN_CHARACTER_TOKEN"
    bad = lo.set_checkpoint_field(out, "k1", field, "{NV1} và {NV7} cười.")
    assert_one(run(frame, bad, code), code, "k1", "{NV7}")


def test_unknown_token_in_options(frame, out) -> None:
    code = "UNKNOWN_CHARACTER_TOKEN"
    for field in ("text", "feedback"):
        opts = [
            o.model_copy(update={field: "gặp {NV5} ở cổng"}) if o.role == "avoidant" else o
            for o in _ps_options(out)
        ]
        assert_one(run(frame, lo.set_options(out, "k3", opts), code), code, "k3", "{NV5}")
    persp = _options(out, ["o1", "o2", "o3"])
    persp[0].text = "{NV6} muốn xem sách"
    assert_one(run(frame, lo.set_options(out, "k2", persp), code), code, "k2", "{NV6}")


def test_declared_tokens_pass(frame, out) -> None:
    bad = lo.set_page_text(out, "p1", "{NV1}, {NV2} và {NV3} đi dạo.")
    assert run(frame, bad, "UNKNOWN_CHARACTER_TOKEN") == []


# ---- whole validate ----


def test_three_problems_give_three_issues(frame, out) -> None:
    bad = lo.drop_page(out, "p3")
    bad = lo.set_checkpoint_field(bad, "k1", "answer", "tired")
    bad = lo.set_scene_of_page(bad, "p1", "s9")
    codes = [i.code for i in validate(ValidationContext(frame=frame, output=bad, attempt=1))]
    assert codes.count("PAGE_IDS_MISMATCH") == 1
    assert codes.count("EMOTION_ANSWER_INVALID") == 1
    assert codes.count("PAGE_SCENE_MISSING") == 1
    assert len(codes) == 3


def test_details_never_contain_story_text_or_forbidden_terms(frame, out) -> None:
    bad = lo.set_page_text(out, "p2", "An giành xe của Bin {NV4}")
    for issue in validate(ValidationContext(frame=frame, output=bad, attempt=1)):
        assert not any(t in issue.detail for t in frame.forbidden_terms)


def test_max_scenes_comes_from_frame() -> None:
    f = make_frame("short", limits=make_limits(max_scenes=2))
    o = valid_output(f)
    assert run(f, o, "SCENE_COUNT_EXCEEDED") == []
    assert len(run(f, lo.add_scenes(o, 1), "SCENE_COUNT_EXCEEDED")) == 1


# ---- echoed LLM values are bounded (controller ruling on I1) ----

LONG = "p9 " + "x" * 200


def test_long_unknown_page_id_is_truncated(frame, out) -> None:
    bad = lo.add_unknown_page(out, LONG)
    (issue,) = run(frame, bad, "PAGE_IDS_MISMATCH")
    assert LONG[:40] + "…" in issue.detail
    assert LONG[:41] not in issue.detail


def test_long_answer_scene_id_role_type_are_truncated(frame, out) -> None:
    cases = [
        ("PERSPECTIVE_ANSWER_INVALID", lo.set_checkpoint_field(out, "k2", "answer", LONG)),
        ("PAGE_SCENE_MISSING", lo.set_scene_of_page(out, "p1", LONG)),
        ("CHECKPOINT_IDS_MISMATCH", lo.set_checkpoint_field(out, "k1", "type", LONG)),
        (
            "PROBLEM_SOLVING_ROLES_INVALID",
            lo.set_options(
                out, "k3", [o.model_copy(update={"role": LONG}) for o in _ps_options(out)]
            ),
        ),
    ]
    for code, bad in cases:
        issues = run(frame, bad, code)
        assert issues, code
        for issue in issues:
            assert LONG[:41] not in issue.detail, code
        assert any(LONG[:40] + "…" in i.detail for i in issues), code


def test_unknown_token_echo_is_truncated(frame, out) -> None:
    long_token = "{NV" + "9" * 200 + "}"
    bad = lo.add_unknown_page(out, LONG)
    bad = lo.set_page_text(bad, LONG, f"{long_token} đi dạo.")
    issues = run(frame, bad, "UNKNOWN_CHARACTER_TOKEN")
    assert len(issues) == 1
    assert long_token[:41] not in issues[0].detail
    assert LONG[:41] not in issues[0].detail
    assert long_token[:40] + "…" in issues[0].detail
    assert LONG[:40] + "…" in issues[0].detail


# ---- #15-#21 content and length rules ----
def _words(n: int, word: str = "bé") -> str:
    return " ".join([word] * n)


def _sentences(*counts: int) -> str:
    return " ".join(_words(n) + "." for n in counts)


def only(issues: list[Issue], code: str, severity: Severity, target: str | None) -> Issue:
    assert issues and {i.code for i in issues} == {code}
    assert all(i.severity is severity for i in issues)
    (hit,) = [i for i in issues if i.target_id == target]
    return hit


def kw_frame(*pairs: tuple[str, str]) -> StoryGenerateRequest:
    return make_frame("long", blocked_keywords=[{"keyword": k, "severity": s} for k, s in pairs])


def test_blocked_keyword_block_in_page_and_feedback() -> None:
    f = kw_frame(("đánh", "block"))
    out = valid_output(f)
    code = "BLOCKED_KEYWORD_BLOCK"
    assert run(f, out, code) == []
    bad = lo.set_page_text(out, "p3", "Bé muốn ĐÁNH em.")
    assert_one(run(f, bad, code), code, "p3", "đánh", count=1)
    opts = [o.model_copy() for o in _ps_options(out)]
    opts[0].feedback = "Con không được đánh em."
    bad = lo.set_options(out, "k3", opts)
    assert_one(run(f, bad, code), code, "k3", count=1)


def test_blocked_keyword_also_scans_question_hint_option_text() -> None:
    f = kw_frame(("đánh", "block"))
    out = valid_output(f)
    code = "BLOCKED_KEYWORD_BLOCK"
    for field in ("question", "hint"):
        bad = lo.set_checkpoint_field(out, "k2", field, "Bé đánh em?")
        assert_one(run(f, bad, code), code, "k2", count=1)
    opts = [o.model_copy(update={"text": "đánh em"}) for o in out.checkpoints[1].options]
    assert_one(run(f, lo.set_options(out, "k2", opts), code), code, "k2")


def test_blocked_keyword_matching_rules() -> None:
    f = kw_frame(("đánh", "block"), ("đá bóng", "block"))
    out = valid_output(f)
    code = "BLOCKED_KEYWORD_BLOCK"
    # Whole-tieng match: "đánh" IS a tieng of "đánh răng", so it hits. Deliberate - the
    # phrase is not filtered; the team sees the false positive and trims the keyword list.
    bad = lo.set_page_text(out, "p3", "Bé đánh răng mỗi tối.")
    assert_one(run(f, bad, code), code, "p3")
    # Multi-word keyword = whole phrase.
    assert_one(run(f, lo.set_page_text(out, "p3", "Bé thích đá bóng."), code), code, "p3")
    assert run(f, lo.set_page_text(out, "p3", "Bé đá quả bóng."), code) == []
    # No partial word, no diacritic folding.
    assert run(f, lo.set_page_text(out, "p3", "Bé đánhh em."), code) == []
    assert run(f, lo.set_page_text(out, "p3", "Bé danh em."), code) == []
    # NFD input still matches.
    nfd = unicodedata.normalize("NFD", "Bé đánh em.")
    assert_one(run(f, lo.set_page_text(out, "p3", nfd), code), code, "p3")


def test_blocked_keyword_warn_is_warn_and_separate() -> None:
    f = kw_frame(("đánh", "block"), ("la hét", "warn"))
    out = lo.set_page_text(valid_output(f), "p3", "Bé la hét to.")
    assert run(f, out, "BLOCKED_KEYWORD_BLOCK") == []
    only(run(f, out, "BLOCKED_KEYWORD_WARN"), "BLOCKED_KEYWORD_WARN", Severity.WARN, "p3")
    out = lo.set_page_text(valid_output(f), "p3", "Bé đánh em.")
    assert run(f, out, "BLOCKED_KEYWORD_WARN") == []


def test_blocked_keyword_one_issue_per_target_and_keyword() -> None:
    f = kw_frame(("đánh", "block"))
    out = lo.set_page_text(valid_output(f), "p3", "đánh đánh đánh.")
    assert len(run(f, out, "BLOCKED_KEYWORD_BLOCK")) == 1


@pytest.mark.parametrize(
    ("words", "ok"), [(19, False), (20, True), (70, True), (76, True), (77, True), (78, False)]
)
def test_page_length_bounds(frame, out, words: int, ok: bool) -> None:
    code = "PAGE_LENGTH_OUT_OF_RANGE"
    issues = run(frame, lo.set_page_text(out, "p3", _words(words) + "."), code)
    if ok:
        assert issues == []
    else:
        hit = only(issues, code, Severity.DOWNGRADE_AFTER_RETRY, "p3")
        assert str(words) in hit.detail


def test_page_length_max_is_scaled_by_limit(out) -> None:
    f = make_frame("long", limits=make_limits(page_max_words=100))
    code = "PAGE_LENGTH_OUT_OF_RANGE"
    assert run(f, lo.set_page_text(out, "p3", _words(110) + "."), code) == []
    assert run(f, lo.set_page_text(out, "p3", _words(111) + "."), code)


@pytest.mark.parametrize(("field", "limit"), [("question", 15), ("hint", 20)])
def test_checkpoint_text_limits_flat_fields(frame, out, field: str, limit: int) -> None:
    code = "CHECKPOINT_TEXT_TOO_LONG"
    assert run(frame, lo.set_checkpoint_field(out, "k1", field, _words(limit)), code) == []
    bad = lo.set_checkpoint_field(out, "k1", field, _words(limit + 1))
    assert_one(run(frame, bad, code), code, "k1", field, str(limit), count=1)


@pytest.mark.parametrize(("field", "limit"), [("text", 12), ("feedback", 25)])
def test_checkpoint_text_limits_option_fields(frame, out, field: str, limit: int) -> None:
    code = "CHECKPOINT_TEXT_TOO_LONG"

    def with_option(n: int):
        opts = [o.model_copy() for o in _ps_options(out)]
        setattr(opts[1], field, _words(n))
        return lo.set_options(out, "k3", opts)

    assert run(frame, with_option(limit), code) == []
    assert_one(run(frame, with_option(limit + 1), code), code, "k3", str(limit), count=1)


def test_emotion_spoiled_by_page(frame, out) -> None:
    code = "EMOTION_SPOILED_BY_PAGE"
    out = lo.set_checkpoint_field(out, "k1", "answer", "angry")
    assert run(frame, out, code) == []
    bad = lo.set_page_text(out, "p2", "Bé giận lắm, mặt đỏ bừng.")
    hit = only(run(frame, bad, code), code, Severity.WARN, "k1")
    assert "giận" in hit.detail and "p2" in hit.detail
    # Case-insensitive whole word.
    assert run(frame, lo.set_page_text(out, "p2", "GIẬN lắm."), code)
    # Word of ANOTHER emotion than the answer: not reported.
    assert run(frame, lo.set_page_text(out, "p2", "Bé buồn lắm."), code) == []
    # Right word on a different page: not reported.
    assert run(frame, lo.set_page_text(out, "p3", "Bé giận lắm."), code) == []
    # Multi-word lexicon entry.
    out_h = lo.set_checkpoint_field(out, "k1", "answer", "happy")
    assert run(frame, lo.set_page_text(out_h, "p2", "Bé rất vui vẻ."), code)


def test_emotion_spoiler_covers_emotion_other_and_skips_invalid_answer(frame, out) -> None:
    code = "EMOTION_SPOILED_BY_PAGE"
    bad = lo.set_page_text(out, "p8", "Em sợ hãi.")
    bad = lo.set_checkpoint_field(bad, "k4", "answer", "scared")
    only(run(frame, bad, code), code, Severity.WARN, "k4")
    # An invalid answer is #7's business; this rule must not crash or report.
    bad = lo.set_checkpoint_field(bad, "k4", "answer", "furious")
    assert run(frame, bad, code) == []
    bad = lo.set_checkpoint_field(bad, "k4", "answer", None)
    assert run(frame, bad, code) == []


def test_tuc_matches_tuc_la_by_design(frame, out) -> None:
    # Whole-tieng matching: "tức" (angry) also hits inside "tức là". Accepted for a WARN rule;
    # pinned here so the team sees it and can reword the lexicon if it proves noisy.
    code = "EMOTION_SPOILED_BY_PAGE"
    out = lo.set_checkpoint_field(out, "k1", "answer", "angry")
    assert run(frame, lo.set_page_text(out, "p2", "Tức là bé chạy đi."), code)
    assert run(frame, lo.set_page_text(out, "p2", "Bé tứcc quá."), code) == []


def test_preachy_phrase_in_page_and_feedback(frame, out) -> None:
    code = "PREACHY_PHRASE"
    assert run(frame, out, code) == []
    bad = lo.set_page_text(out, "p3", "Đây là bài học cho bé.")
    hit = only(run(frame, bad, code), code, Severity.WARN, "p3")
    assert "bài học" in hit.detail
    opts = [o.model_copy() for o in _ps_options(out)]
    opts[0].feedback = "Con nên nói chậm lại."
    only(run(frame, lo.set_options(out, "k3", opts), code), code, Severity.WARN, "k3")
    # Whole-phrase, case-insensitive; a split phrase does not match.
    assert run(frame, lo.set_page_text(out, "p3", "BÀI HỌC hôm nay."), code)
    assert run(frame, lo.set_page_text(out, "p3", "bài tập học nhóm."), code) == []


def test_preachy_does_not_scan_questions(frame, out) -> None:
    # "Con nên làm gì?" is a normal question; only page text and feedback are judged.
    bad = lo.set_checkpoint_field(out, "k2", "question", "Con nên làm gì?")
    assert run(frame, bad, "PREACHY_PHRASE") == []


def test_sentence_too_long(frame, out) -> None:
    code = "PAGE_SENTENCE_TOO_LONG"
    assert run(frame, lo.set_page_text(out, "p3", _sentences(15, 15)), code) == []
    bad = lo.set_page_text(out, "p3", _sentences(10, 16))
    hit = only(run(frame, bad, code), code, Severity.DOWNGRADE_AFTER_RETRY, "p3")
    assert "p3" in hit.detail and "16" in hit.detail


def test_sentence_too_long_one_issue_per_page(frame, out) -> None:
    bad = lo.set_page_text(out, "p3", _sentences(16, 17))
    assert len(run(frame, bad, "PAGE_SENTENCE_TOO_LONG")) == 1


def test_dialogue_colon_is_one_sentence(frame, out) -> None:
    code = "PAGE_SENTENCE_TOO_LONG"
    # "{NV1} nói nhỏ:" is 3 words.
    assert run(frame, lo.set_page_text(out, "p3", "{NV1} nói nhỏ: " + _words(12) + "."), code) == []
    bad = lo.set_page_text(out, "p3", "{NV1} nói nhỏ: " + _words(13) + ".")
    assert run(frame, bad, code)  # 16 words, not split at ":"


def test_closing_quote_ends_sentence_for_length(frame, out) -> None:
    code = "PAGE_SENTENCE_TOO_LONG"
    text = '"' + _words(8) + '." ' + _words(8) + "."  # 8 + 8, not one 16-word sentence
    assert run(frame, lo.set_page_text(out, "p3", text), code) == []


def test_sentence_limit_uses_request_limit(out) -> None:
    f = make_frame("long", limits=make_limits(sentence_max_words=8))
    assert run(f, lo.set_page_text(out, "p3", _sentences(9)), "PAGE_SENTENCE_TOO_LONG")


def test_content_rule_details_bound_llm_ids(frame, out) -> None:
    bad = lo.add_unknown_page(out, LONG)
    bad = lo.set_page_text(bad, LONG, _words(90) + ".")
    for code in ("PAGE_LENGTH_OUT_OF_RANGE", "PAGE_SENTENCE_TOO_LONG"):
        issues = run(frame, bad, code)
        assert any(i.target_id == LONG for i in issues), code
        assert all(LONG[:41] not in i.detail for i in issues), code


def test_docs_sample_has_no_retry_issue() -> None:
    samples = Path(__file__).resolve().parents[2] / "docs" / "samples"
    frame = StoryGenerateRequest.model_validate_json(
        (samples / "story_request.json").read_text(encoding="utf-8")
    )
    output = LlmStoryOutput.model_validate_json(
        (samples / "story_llm_output.json").read_text(encoding="utf-8")
    )
    issues = validate(ValidationContext(frame=frame, output=output, attempt=1))
    assert [i for i in issues if i.severity is Severity.RETRY] == [], issues
