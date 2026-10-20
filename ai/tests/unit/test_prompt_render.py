from pathlib import Path

from app.core.prompt import PROMPT_VERSION, render_story_prompt
from app.schemas.story import StoryGenerateRequest

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "story_request.json"


def _sample() -> StoryGenerateRequest:
    return StoryGenerateRequest.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


def test_prompt_version_from_front_matter() -> None:
    assert PROMPT_VERSION == "story.v2"


def test_render_sample(settings) -> None:
    req = _sample()
    prompt = render_story_prompt(req, settings)
    assert "{NV1}" in prompt  # the literal token survives (no str.format / f-string)
    assert str(req.limits.page_max_words) in prompt
    assert "$" not in prompt  # every placeholder substituted
    assert "version: story.v2" not in prompt  # front matter is not sent to the model
    for page_id in req.pages:
        assert page_id in prompt
    for cp in req.checkpoints:
        assert cp.id in prompt


def test_render_never_contains_forbidden_terms(settings) -> None:
    # Real names never reach the LLM: forbidden_terms is not a prompt input.
    prompt = render_story_prompt(_sample(), settings)
    assert "Bin" not in prompt


# ---- Task 6: real prompt content -------------------------------------------------------------

import re  # noqa: E402

from tests.fixtures.frames import make_frame, make_limits  # noqa: E402

_ODD_LIMITS = make_limits(
    page_min_words=23,
    page_max_words=91,
    page_target_min_words=53,
    page_target_max_words=71,
    sentence_max_words=37,
    question_max_words=31,
    option_max_words=29,
    hint_max_words=43,
    feedback_max_words=47,
    max_scenes=3,
)


def test_render_lists_every_checkpoint_with_type_after_and_target(settings) -> None:
    req = make_frame("long")
    prompt = render_story_prompt(req, settings)
    lines = [ln for ln in prompt.splitlines() if ln.startswith("- k")]
    assert len(lines) == len(req.checkpoints) == 5
    for cp in req.checkpoints:
        line = next(ln for ln in lines if ln.startswith(f"- {cp.id}:"))
        assert cp.type.value in line
        assert cp.after in line
        if cp.target:
            assert cp.target in line


def test_render_limits_come_from_request(settings) -> None:
    default = render_story_prompt(make_frame("medium"), settings)
    odd = render_story_prompt(make_frame("medium", limits=_ODD_LIMITS), settings)
    assert default != odd
    for n in (23, 91, 53, 71, 37, 31, 29, 43, 47):
        assert re.search(rf"\b{n}\b", odd)
    # None of the docs/03 defaults is hard-coded in the template text.
    for n in (70, 60, 40, 15, 12, 20, 25):
        assert not re.search(rf"\b{n}\b", odd), n


def test_render_has_no_hardcoded_model_names(settings) -> None:
    prompt = render_story_prompt(make_frame("long", limits=_ODD_LIMITS), settings).lower()
    for name in ("gemini", "gpt", "claude", "flash", "imagen"):
        assert name not in prompt


def test_render_keeps_ids_instruction(settings) -> None:
    prompt = render_story_prompt(make_frame("medium"), settings)
    assert "Giữ nguyên" in prompt
    assert "page_id" in prompt and "checkpoint_id" in prompt


def test_render_does_not_ask_for_answer_or_hint_on_wrong_types(settings) -> None:
    prompt = render_story_prompt(make_frame("long"), settings)
    section = prompt.split("# Điểm dừng theo kiểu", 1)[1].split("\n# ", 1)[0]
    bullets = section.split("\n- ")  # each bullet spans several lines
    ps = next(b for b in bullets if b.startswith("problem_solving"))
    assert "hint" not in ps and "answer" not in ps
    refl = next(b for b in bullets if b.startswith("reflection"))
    assert "answer" not in refl and "options" not in refl


def test_render_json_section_names_every_llm_field(settings) -> None:
    prompt = render_story_prompt(make_frame("long"), settings)
    section = prompt.split("# Định dạng JSON", 1)[1]
    for name in (
        "pages", "scenes", "checkpoints", "page_id", "scene_id", "text", "description",
        "checkpoint_id", "type", "question", "answer", "hint", "options",
        "option_id", "role", "feedback",
        "constructive", "avoidant", "impulsive", "o1", "o2", "o3",
        "happy", "sad", "angry", "scared", "neutral",
    ):  # fmt: skip
        assert name in section, name


# ---- retry turn (spec 8.2) ----

from app.core.prompt import render_retry_turn  # noqa: E402
from app.core.validator import Issue, Severity  # noqa: E402


def test_retry_turn_lists_non_warn_details_and_reminds_ids() -> None:
    issues = [
        Issue("EMOTION_ANSWER_INVALID", "k1", "chi tiết RETRY k1", Severity.RETRY),
        Issue("PREACHY_PHRASE", "p5", "chi tiết WARN p5", Severity.WARN),
        Issue(
            "PAGE_LENGTH_OUT_OF_RANGE", "p3", "chi tiết DOWNGRADE p3",
            Severity.DOWNGRADE_AFTER_RETRY,
        ),
    ]
    turn = render_retry_turn(issues)
    lines = turn.splitlines()
    assert "TOÀN BỘ JSON" in lines[0]
    assert "- chi tiết RETRY k1" in lines
    assert "- chi tiết DOWNGRADE p3" in lines
    assert "chi tiết WARN p5" not in turn
    assert lines[-1] == "Giữ nguyên mọi page_id, checkpoint_id và kiểu điểm dừng."


def test_render_states_the_page_target_as_the_aim(settings) -> None:
    # Measured 2026-10-15: told only "20 to 70", models wrote ~31-35 words a page.
    prompt = render_story_prompt(make_frame("medium", limits=_ODD_LIMITS), settings)
    length_line = next(ln for ln in prompt.splitlines() if "53" in ln and "71" in ln)
    assert "nhắm" in length_line.lower()


def test_render_keeps_the_parent_story_main_events(settings) -> None:
    # Decided 2026-10-15: keep what the parent told (the child should recognise it), soften
    # only dangerous or frightening details - no more "inspiration only".
    prompt = render_story_prompt(make_frame("medium"), settings)
    assert "làm cảm hứng" not in prompt
    assert "diễn biến chính" in prompt


# ---- Task 11: story.v2 follows the Specialist guide of each checkpoint ----


def test_render_guided_checkpoints_follow_their_guide(settings) -> None:
    req = make_frame("long", guides=True)
    prompt = render_story_prompt(req, settings)
    assert "$" not in prompt
    for cp in req.checkpoints:
        if cp.guide is None:
            continue
        assert cp.guide.question_frame in prompt
        assert cp.guide.page_setup in prompt
        assert cp.guide.sub_skill in prompt
    ps = next(cp for cp in req.checkpoints if cp.type.value == "problem_solving")
    for text in (ps.guide.roles.constructive, ps.guide.roles.avoidant, ps.guide.roles.impulsive):
        assert text in prompt
    persp = next(cp for cp in req.checkpoints if cp.type.value == "perspective")
    assert persp.guide.correct_desc in prompt and persp.guide.distractor_desc in prompt
    emo = next(cp for cp in req.checkpoints if cp.type.value == "emotion_other")
    block = prompt.split(f"- {emo.id}:", 1)[1].split("\n- k", 1)[0]
    assert "sad, scared" in block
    assert emo.guide.hint_guidance in block


def test_render_uses_topic_age_range(settings) -> None:
    prompt = render_story_prompt(make_frame("medium", guides=True), settings)
    assert "6–9 tuổi" in prompt
    assert "5–8" not in prompt


def test_render_falls_back_to_default_age_range(settings) -> None:
    prompt = render_story_prompt(make_frame("medium"), settings)
    assert "trẻ 5–8 tuổi" in prompt


def test_render_lists_sub_skills(settings) -> None:
    from tests.fixtures.frames import SUB_SKILLS

    prompt = render_story_prompt(make_frame("medium", guides=True), settings)
    line = next(ln for ln in prompt.splitlines() if ln.startswith("Kỹ năng con"))
    assert SUB_SKILLS[0]["name"] in prompt and SUB_SKILLS[1]["description"] in prompt
    assert line  # header present
    assert "Kỹ năng con của bài học: (không có)" in render_story_prompt(
        make_frame("medium"), settings
    )


def test_render_unguided_checkpoint_line_is_unchanged_from_v1(settings) -> None:
    prompt = render_story_prompt(make_frame("long"), settings)
    assert "- k2: kiểu perspective, sau trang p4, hỏi về {NV2}" in prompt.splitlines()
    # Old callers keep the v1 per-type page setup as a default.
    assert "Trang ngay trước điểm dừng problem_solving" in prompt


def test_render_fully_guided_frame_drops_the_v1_default_setup(settings) -> None:
    prompt = render_story_prompt(make_frame("long", guides=True), settings)
    assert "Trang ngay trước điểm dừng problem_solving" not in prompt
    # Rule kept for every frame: after problem_solving the story heads to making up.
    assert "làm lành" in prompt


def test_render_v2_keeps_seven_principles(settings) -> None:
    prompt = render_story_prompt(make_frame("medium", guides=True), settings)
    assert "# Bảy nguyên tắc nội dung" in prompt
    for n in range(1, 8):
        assert f"\n{n}. " in prompt


# ---- Task 11 fix round 1 ----


def test_render_tells_the_model_never_to_copy_the_guide(settings) -> None:
    prompt = render_story_prompt(make_frame("long", guides=True), settings)
    assert "KHÔNG chép hướng dẫn của chuyên gia" in prompt
    assert "MÔ TẢ Ý ĐỊNH" in prompt
    assert "đúng ý mô tả" in prompt
    assert "theo đúng mô tả" not in prompt and "làm đúng mô tả" not in prompt
    for label in (
        "Mô tả phương án đúng:", "Mô tả phương án nhiễu:", "Mô tả vai constructive:",
        "Mô tả vai avoidant:", "Mô tả vai impulsive:",
    ):  # fmt: skip
        assert label in prompt, label


def test_render_guide_without_page_setup_gets_the_type_default(settings) -> None:
    from tests.fixtures.frames import make_guide

    req = make_frame("long", guides=True)
    payload = req.model_dump(mode="json", by_alias=True)
    ps = next(c for c in payload["checkpoints"] if c["type"] == "problem_solving")
    ps["guide"] = make_guide("problem_solving", page_setup=None)
    prompt = render_story_prompt(StoryGenerateRequest.model_validate(payload), settings)
    assert "Trang ngay trước điểm dừng problem_solving" in prompt
    # The guided types that do carry a page_setup do not get the default.
    assert "Trang ngay trước điểm dừng perspective" not in prompt
