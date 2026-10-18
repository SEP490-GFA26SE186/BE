"""Structural tests of the validator registry (spec 7.3, 10.4)."""

import unicodedata
from dataclasses import replace

import pytest

from app.core.validator import (
    RULES,
    RULES_BY_CODE,
    Issue,
    Severity,
    ValidationContext,
    load_content_rules,
    validate,
)
from app.core.validator import rules as rules_module
from app.core.validator.content_rules import load_content_rules_from
from app.schemas.story import CheckpointType, Emotion
from tests.fixtures import llm_outputs as lo
from tests.fixtures.frames import make_frame
from tests.fixtures.llm_outputs import valid_output

DOCS04_ROWS = {f"docs04:{n}" for n in range(1, 15)}
DOCS04_ROWS_INTENTIONALLY_SKIPPED = {
    "docs04:8": "Chốt chặn tên thật chỉ chạy trên request, không quét output (spec 3.1).",
}

S = Severity
EXPECTED = [
    ("OUTPUT_SCHEMA_INVALID", S.RETRY),
    ("PAGE_IDS_MISMATCH", S.RETRY),
    ("CHECKPOINT_IDS_MISMATCH", S.RETRY),
    ("PAGE_SCENE_MISSING", S.RETRY),
    ("SCENE_COUNT_EXCEEDED", S.RETRY),
    ("SCENE_DESCRIPTION_MISSING", S.RETRY),
    ("EMOTION_ANSWER_INVALID", S.RETRY),
    ("EMOTION_HINT_MISSING", S.RETRY),
    ("PERSPECTIVE_OPTIONS_INVALID", S.RETRY),
    ("PERSPECTIVE_ANSWER_INVALID", S.RETRY),
    ("PROBLEM_SOLVING_ROLES_INVALID", S.RETRY),
    ("PROBLEM_SOLVING_FIELD_MISSING", S.RETRY),
    ("REFLECTION_SHAPE_INVALID", S.RETRY),
    ("UNKNOWN_CHARACTER_TOKEN", S.RETRY),
    ("BLOCKED_KEYWORD_BLOCK", S.RETRY),
    ("BLOCKED_KEYWORD_WARN", S.WARN),
    ("PAGE_LENGTH_OUT_OF_RANGE", S.DOWNGRADE_AFTER_RETRY),
    ("CHECKPOINT_TEXT_TOO_LONG", S.RETRY),
    ("EMOTION_SPOILED_BY_PAGE", S.WARN),
    ("PREACHY_PHRASE", S.WARN),
    ("PAGE_SENTENCE_TOO_LONG", S.DOWNGRADE_AFTER_RETRY),
    ("OUTPUT_TRUNCATED", S.RETRY),
]


def test_all_docs04_rows_covered() -> None:
    covered: set[str] = set()
    for rule in RULES:
        # "docs04:11+12" covers each listed row.
        head, _, tail = rule.doc_row.partition(":")
        if head == "docs04":
            covered.update(f"docs04:{n}" for n in tail.split("+"))
    assert DOCS04_ROWS - covered - set(DOCS04_ROWS_INTENTIONALLY_SKIPPED) == set()
    assert "docs04:8" not in covered  # skipped on purpose, not covered by accident
    # Row 1 is covered by the two parse-stage rules even though they never self-check.
    assert {r.code for r in RULES if r.doc_row == "docs04:1"} == {
        "OUTPUT_SCHEMA_INVALID",
        "OUTPUT_TRUNCATED",
    }


def test_all_checkpoint_types_covered() -> None:
    declared = set().union(*(rule.checkpoint_types for rule in RULES))
    assert declared == set(CheckpointType)


def test_rule_codes_unique() -> None:
    codes = [r.code for r in RULES]
    assert len(codes) == len(set(codes))
    assert set(RULES_BY_CODE) == set(codes)


def test_registry_matches_spec_table() -> None:
    assert len(RULES) == 22
    assert [(r.code, r.severity) for r in RULES] == EXPECTED


@pytest.mark.parametrize("code", ["OUTPUT_SCHEMA_INVALID", "OUTPUT_TRUNCATED"])
def test_parse_stage_rules_never_self_check(code: str) -> None:
    frame = make_frame("medium")
    for attempt in (1, 2):
        ctx = ValidationContext(frame=frame, output=valid_output(frame), attempt=attempt)
        assert list(RULES_BY_CODE[code].check(ctx)) == []
    broken = lo.drop_page(valid_output(frame), "p1")
    ctx = ValidationContext(frame=frame, output=broken, attempt=1)
    assert list(RULES_BY_CODE[code].check(ctx)) == []


@pytest.mark.parametrize("length", ["short", "medium", "long"])
def test_valid_output_passes_every_rule(length: str) -> None:
    frame = make_frame(length)
    ctx = ValidationContext(frame=frame, output=valid_output(frame), attempt=1)
    assert validate(ctx) == []


def test_validate_runs_every_rule_without_early_exit(monkeypatch: pytest.MonkeyPatch) -> None:
    frame = make_frame("short")
    ctx = ValidationContext(frame=frame, output=valid_output(frame), attempt=1)

    def fake(code: str):
        def check(_ctx: ValidationContext):
            return [Issue(code=code, target_id=None, detail="x", severity=Severity.RETRY)]

        return check

    monkeypatch.setattr(
        rules_module, "RULES", tuple(replace(r, check=fake(r.code)) for r in RULES)
    )
    assert [i.code for i in rules_module.validate(ctx)] == [r.code for r in RULES]


def test_content_rules_loaded() -> None:
    rules = load_content_rules()
    assert set(rules.emotion_lexicon) == set(Emotion)
    assert all(rules.emotion_lexicon[e] for e in Emotion)
    assert {"giận", "tức", "bực", "cáu", "nổi giận"} <= set(rules.emotion_lexicon[Emotion.ANGRY])
    assert rules.preachy_phrases
    assert load_content_rules() is rules  # cached


def test_content_rules_reject_missing_key(tmp_path) -> None:
    path = tmp_path / "missing.yaml"
    path.write_text("preachy_phrases: [a]\n", encoding="utf-8")
    with pytest.raises(ValueError, match="emotion_lexicon"):
        load_content_rules_from(path)


def test_content_rules_reject_unknown_emotion(tmp_path) -> None:
    path = tmp_path / "unknown.yaml"
    path.write_text(
        "emotion_lexicon: {happy: [a], sad: [a], angry: [a], scared: [a], neutral: [a], "
        "bored: [a]}\npreachy_phrases: [a]\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="bored"):
        load_content_rules_from(path)


def test_mock_text_avoids_lexicon_and_preachy_words() -> None:
    rules = load_content_rules()
    out = valid_output(make_frame("long"))
    texts = [p.text for p in out.pages]
    for cp in out.checkpoints:
        texts += [cp.question, cp.hint or ""]
        for opt in cp.options:
            texts += [opt.text, opt.feedback or ""]
    normalized = unicodedata.normalize("NFC", " ".join(texts)).casefold()
    for mark in ".,?!:;":
        normalized = normalized.replace(mark, " ")
    blob = f" {' '.join(normalized.split())} "
    banned = [w for ws in rules.emotion_lexicon.values() for w in ws] + rules.preachy_phrases
    for word in banned:
        assert f" {unicodedata.normalize('NFC', word).casefold()} " not in blob, word


def test_corruption_helpers_change_one_thing_and_copy() -> None:
    base = valid_output(make_frame("short"))
    snapshot = base.model_dump()
    assert [p.page_id for p in lo.drop_page(base, "p1").pages] == ["p2", "p3", "p4", "p5", "p6"]
    assert [p.page_id for p in lo.duplicate_page(base, "p1").pages].count("p1") == 2
    assert lo.add_unknown_page(base).pages[-1].page_id == "p99"
    assert lo.set_page_text(base, "p1", "x").pages[0].text == "x"
    assert lo.set_scene_of_page(base, "p1", "s9").pages[0].scene_id == "s9"
    assert len(lo.add_scenes(base, 2).scenes) == len(base.scenes) + 2
    assert lo.set_checkpoint_field(base, "k1", "hint", None).checkpoints[0].hint is None
    assert lo.set_options(base, "k2", []).checkpoints[1].options == []
    assert base.model_dump() == snapshot  # originals untouched
