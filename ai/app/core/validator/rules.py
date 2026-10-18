"""Rule registry (spec 7.3, 7.4).

Checks #2-#21 are real. #1 and #22 stay
empty for good: the orchestrator builds those issues at the parse step (spec 3.11.8); the rules
exist so the docs/04 coverage test can count row 1.
"""

import re
from collections import Counter
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from app.core.text_utils import contains_phrase, count_words, split_sentences
from app.core.validator.content_rules import load_content_rules
from app.core.validator.context import ValidationContext
from app.core.validator.issues import Issue, Severity
from app.schemas.llm import LlmCheckpoint
from app.schemas.story import CheckpointFrame, CheckpointType, Emotion, ProblemSolvingRole

# Decision (Task 10): rule #8 also covers perspective - docs/03 lists `hint` for perspective -
# so a missing perspective hint is reported by #8 and #10 only judges `answer`.
_EMOTION = frozenset({CheckpointType.EMOTION_SELF, CheckpointType.EMOTION_OTHER})
_HINTED = _EMOTION | {CheckpointType.PERSPECTIVE}
_PERSPECTIVE = frozenset({CheckpointType.PERSPECTIVE})
_PROBLEM_SOLVING = frozenset({CheckpointType.PROBLEM_SOLVING})
_PS = _PROBLEM_SOLVING
_REFLECTION = frozenset({CheckpointType.REFLECTION})


@dataclass(frozen=True)
class Rule:
    code: str
    severity: Severity
    doc_row: str  # "docs04:11" (or "docs04:11+12", "docs03", "docs07")
    check: Callable[[ValidationContext], Iterable[Issue]]
    # Addition to spec 7.2: the checkpoint types this rule inspects, so a structural test can
    # assert every CheckpointType is covered by at least one rule.
    checkpoint_types: frozenset[CheckpointType] = field(default_factory=frozenset)


# ---- Checks #2-#14. Issue.detail is Vietnamese on purpose (retry prompt, spec 7.2) and names
# only ids, fields and types - never story text, so it cannot leak a forbidden term. ----

_PERSPECTIVE_OPTION_COUNT = 3
_TOKEN_RE = re.compile(r"\{NV\d+\}")


def _issue(code: str, target_id: str | None, detail: str) -> Issue:
    return Issue(code=code, target_id=target_id, detail=detail, severity=RULE_SEVERITY[code])


_ECHO_MAX = 40


def _q(value: object) -> str:
    """Quote an LLM-controlled value for a detail string, bounded so the retry prompt stays
    small (controller ruling: echoing is allowed, the LLM never sees real names, spec 3.1)."""
    text = str(value)
    return text if len(text) <= _ECHO_MAX else text[:_ECHO_MAX] + "…"


def _blank(value: str | None) -> bool:
    return value is None or not value.strip()


def _id_mismatches(
    expected: list[str], actual: list[str]
) -> tuple[list[str], list[str], list[str]]:
    """(missing, unknown, duplicated) ids, in a stable order."""
    counts = Counter(actual)
    known = set(expected)
    missing = [i for i in expected if i not in counts]
    unknown = sorted(i for i in counts if i not in known)
    duplicated = sorted(i for i, n in counts.items() if n > 1)
    return missing, unknown, duplicated


def _check_page_ids(ctx: ValidationContext) -> Iterable[Issue]:
    missing, unknown, dup = _id_mismatches(ctx.frame.pages, [p.page_id for p in ctx.output.pages])
    for i in missing:
        yield _issue("PAGE_IDS_MISMATCH", i, f"Thiếu trang '{i}' trong pages.")
    for i in unknown:
        yield _issue("PAGE_IDS_MISMATCH", i, f"Trang '{_q(i)}' không có trong khung, hãy bỏ đi.")
    for i in dup:
        yield _issue("PAGE_IDS_MISMATCH", i, f"Trang '{_q(i)}' xuất hiện nhiều lần, chỉ giữ một.")


def _paired_checkpoints(
    ctx: ValidationContext, types: frozenset[CheckpointType] | None = None
) -> Iterable[tuple[CheckpointFrame, LlmCheckpoint]]:
    """Frame checkpoint with its output twin (first by id), optionally filtered by the FRAME's
    type. Missing / duplicate ids and a changed type are #3's business."""
    by_id: dict[str, LlmCheckpoint] = {}
    for out_cp in ctx.output.checkpoints:
        by_id.setdefault(out_cp.checkpoint_id, out_cp)
    for frame_cp in ctx.frame.checkpoints:
        out_cp = by_id.get(frame_cp.id)
        if out_cp is not None and (types is None or frame_cp.type in types):
            yield frame_cp, out_cp


def _check_checkpoint_ids(ctx: ValidationContext) -> Iterable[Issue]:
    code = "CHECKPOINT_IDS_MISMATCH"
    missing, unknown, dup = _id_mismatches(
        [c.id for c in ctx.frame.checkpoints], [c.checkpoint_id for c in ctx.output.checkpoints]
    )
    for i in missing:
        yield _issue(code, i, f"Thiếu checkpoint '{i}' trong checkpoints.")
    for i in unknown:
        yield _issue(code, i, f"Checkpoint '{_q(i)}' không có trong khung, hãy bỏ đi.")
    for i in dup:
        yield _issue(code, i, f"Checkpoint '{_q(i)}' xuất hiện nhiều lần, chỉ giữ một.")
    # The frame decides the type; never silently re-type (CLAUDE.md).
    for frame_cp, out_cp in _paired_checkpoints(ctx):
        if out_cp.type != frame_cp.type.value:
            yield _issue(
                code,
                frame_cp.id,
                f"Checkpoint '{frame_cp.id}' phải có type '{frame_cp.type.value}', "
                f"không phải '{_q(out_cp.type)}'.",
            )


def _check_page_scene(ctx: ValidationContext) -> Iterable[Issue]:
    scene_ids = {s.scene_id for s in ctx.output.scenes}
    for page in ctx.output.pages:
        if page.scene_id not in scene_ids:
            yield _issue(
                "PAGE_SCENE_MISSING",
                page.page_id,
                f"Trang '{_q(page.page_id)}' trỏ tới scene_id '{_q(page.scene_id)}' "
                "không có trong scenes.",
            )


def _check_scene_count(ctx: ValidationContext) -> Iterable[Issue]:
    # Decision: count declared scenes, including ones no page uses - an unused scene would
    # still cost an image.
    count, limit = len(ctx.output.scenes), ctx.frame.limits.max_scenes
    if count > limit:
        yield _issue(
            "SCENE_COUNT_EXCEEDED", None, f"Có {count} cảnh trong scenes, tối đa {limit}. Gộp bớt."
        )


def _check_scene_description(ctx: ValidationContext) -> Iterable[Issue]:
    for scene in ctx.output.scenes:
        if _blank(scene.description):
            yield _issue(
                "SCENE_DESCRIPTION_MISSING",
                scene.scene_id,
                f"Cảnh '{_q(scene.scene_id)}' thiếu description.",
            )


def _check_emotion_answer(ctx: ValidationContext) -> Iterable[Issue]:
    valid = [e.value for e in Emotion]
    for frame_cp, cp in _paired_checkpoints(ctx, _EMOTION):
        if cp.answer not in valid:
            yield _issue(
                "EMOTION_ANSWER_INVALID",
                frame_cp.id,
                f"Checkpoint '{frame_cp.id}' ({frame_cp.type.value}) thiếu answer hoặc answer "
                f"không thuộc: {', '.join(valid)}.",
            )


def _check_hint(ctx: ValidationContext) -> Iterable[Issue]:
    for frame_cp, cp in _paired_checkpoints(ctx, _HINTED):
        if _blank(cp.hint):
            yield _issue(
                "EMOTION_HINT_MISSING",
                frame_cp.id,
                f"Checkpoint '{frame_cp.id}' ({frame_cp.type.value}) thiếu hint.",
            )


def _check_perspective_options(ctx: ValidationContext) -> Iterable[Issue]:
    code = "PERSPECTIVE_OPTIONS_INVALID"
    for frame_cp, cp in _paired_checkpoints(ctx, _PERSPECTIVE):
        cid = frame_cp.id
        if len(cp.options) != _PERSPECTIVE_OPTION_COUNT:
            yield _issue(
                code,
                cid,
                f"Checkpoint '{cid}' có {len(cp.options)} options, cần đúng "
                f"{_PERSPECTIVE_OPTION_COUNT}.",
            )
        ids = [o.option_id for o in cp.options]
        if any(_blank(i) for i in ids):
            yield _issue(code, cid, f"Checkpoint '{cid}' có phương án thiếu option_id.")
        for dup in sorted({i for i in ids if i and ids.count(i) > 1}):
            yield _issue(code, cid, f"Checkpoint '{cid}' có option_id '{_q(dup)}' bị trùng.")


def _check_perspective_answer(ctx: ValidationContext) -> Iterable[Issue]:
    code = "PERSPECTIVE_ANSWER_INVALID"
    for frame_cp, cp in _paired_checkpoints(ctx, _PERSPECTIVE):
        cid = frame_cp.id
        if _blank(cp.answer):
            yield _issue(code, cid, f"Checkpoint '{cid}' thiếu answer.")
        elif cp.answer not in {o.option_id for o in cp.options}:
            yield _issue(
                code,
                cid,
                f"Checkpoint '{cid}' có answer '{_q(cp.answer)}' không trùng option_id nào.",
            )


def _check_problem_solving_roles(ctx: ValidationContext) -> Iterable[Issue]:
    code = "PROBLEM_SOLVING_ROLES_INVALID"
    expected = [r.value for r in ProblemSolvingRole]
    for frame_cp, cp in _paired_checkpoints(ctx, _PROBLEM_SOLVING):
        cid = frame_cp.id
        roles = Counter(o.role for o in cp.options)
        for role in expected:
            if roles[role] == 0:
                yield _issue(code, cid, f"Checkpoint '{cid}' thiếu vai '{role}'.")
            elif roles[role] > 1:
                yield _issue(
                    code,
                    cid,
                    f"Checkpoint '{cid}' có {roles[role]} phương án cùng vai '{role}', "
                    "mỗi vai đúng một phương án.",
                )
        for role in roles:
            if role not in expected:
                shown = "(trống)" if role is None else f"'{_q(role)}'"
                yield _issue(
                    code,
                    cid,
                    f"Checkpoint '{cid}' có vai lạ {shown}; chỉ dùng: {', '.join(expected)}.",
                )


def _check_problem_solving_fields(ctx: ValidationContext) -> Iterable[Issue]:
    for frame_cp, cp in _paired_checkpoints(ctx, _PROBLEM_SOLVING):
        for n, opt in enumerate(cp.options, start=1):
            label = _q(opt.role) if opt.role else f"#{n}"
            for name in ("text", "feedback"):
                if _blank(getattr(opt, name)):
                    yield _issue(
                        "PROBLEM_SOLVING_FIELD_MISSING",
                        frame_cp.id,
                        f"Checkpoint '{frame_cp.id}', phương án '{label}' thiếu {name}.",
                    )


def _check_reflection_shape(ctx: ValidationContext) -> Iterable[Issue]:
    # Blank values are tolerated: schema-constrained output often fills unused optionals with "".
    for frame_cp, cp in _paired_checkpoints(ctx, _REFLECTION):
        extras = [
            name
            for name, present in (
                ("answer", not _blank(cp.answer)),
                ("options", bool(cp.options)),
                ("hint", not _blank(cp.hint)),
            )
            if present
        ]
        if extras:
            yield _issue(
                "REFLECTION_SHAPE_INVALID",
                frame_cp.id,
                f"Checkpoint '{frame_cp.id}' (reflection) chỉ có question, "
                f"hãy bỏ: {', '.join(extras)}.",
            )


def _scanned_texts(ctx: ValidationContext) -> Iterable[tuple[str, str, str]]:
    """(target id, field label, text) for every story text a token can appear in."""
    for page in ctx.output.pages:
        yield page.page_id, "text", page.text
    for cp in ctx.output.checkpoints:
        yield cp.checkpoint_id, "question", cp.question
        if cp.hint:
            yield cp.checkpoint_id, "hint", cp.hint
        for opt in cp.options:
            yield cp.checkpoint_id, "options[].text", opt.text
            if opt.feedback:
                yield cp.checkpoint_id, "options[].feedback", opt.feedback


def _check_unknown_token(ctx: ValidationContext) -> Iterable[Issue]:
    declared = {c.token for c in ctx.frame.characters}
    reported: set[tuple[str, str]] = set()
    for target_id, label, text in _scanned_texts(ctx):
        for token in _TOKEN_RE.findall(text):
            if token not in declared and (target_id, token) not in reported:
                reported.add((target_id, token))
                yield _issue(
                    "UNKNOWN_CHARACTER_TOKEN",
                    target_id,
                    f"'{_q(target_id)}' ({label}) dùng token {_q(token)} chưa khai báo; "
                    f"chỉ dùng: {', '.join(sorted(declared))}.",
                )


# ---- Checks #15-#21: content and length. Details echo ids and counts, plus keywords that come
# from the request or the YAML (not from the LLM); LLM-derived ids go through _q. ----

_PAGE_OVERSHOOT_NUM, _PAGE_OVERSHOOT_DEN = 11, 10  # docs/04 row 12: max + 10%, integer math


def _checkpoint_texts(ctx: ValidationContext) -> Iterable[tuple[str, str]]:
    """(target id, text) for the checkpoint text fields."""
    for cp in ctx.output.checkpoints:
        yield cp.checkpoint_id, cp.question
        if cp.hint:
            yield cp.checkpoint_id, cp.hint
        for opt in cp.options:
            yield cp.checkpoint_id, opt.text
            if opt.feedback:
                yield cp.checkpoint_id, opt.feedback


def _page_and_feedback_texts(ctx: ValidationContext) -> Iterable[tuple[str, str]]:
    """Narrative text only (pages and option feedback): questions may legitimately say
    "con nên làm gì?"."""
    for page in ctx.output.pages:
        yield page.page_id, page.text
    for cp in ctx.output.checkpoints:
        for opt in cp.options:
            if opt.feedback:
                yield cp.checkpoint_id, opt.feedback


def _blocked_keyword_issues(ctx: ValidationContext, level: str, code: str) -> Iterable[Issue]:
    # Unlike guards (real names: case-sensitive), blocked_keywords is a content-moderation list,
    # so matching ignores case; diacritics stay and NFC applies (contains_phrase).
    keywords = [k.keyword for k in ctx.frame.blocked_keywords if k.severity == level]
    seen: set[tuple[str, str]] = set()
    for target_id, text in [
        *((p.page_id, p.text) for p in ctx.output.pages),
        *_checkpoint_texts(ctx),
    ]:
        for keyword in keywords:
            if (target_id, keyword) not in seen and contains_phrase(text, keyword):
                seen.add((target_id, keyword))
                yield _issue(
                    code,
                    target_id,
                    f"'{_q(target_id)}' chứa từ khoá bị chặn '{_q(keyword)}', hãy diễn đạt khác.",
                )


def _check_blocked_block(ctx: ValidationContext) -> Iterable[Issue]:
    return _blocked_keyword_issues(ctx, "block", "BLOCKED_KEYWORD_BLOCK")


def _check_blocked_warn(ctx: ValidationContext) -> Iterable[Issue]:
    return _blocked_keyword_issues(ctx, "warn", "BLOCKED_KEYWORD_WARN")


def _check_page_length(ctx: ValidationContext) -> Iterable[Issue]:
    lim = ctx.frame.limits
    for page in ctx.output.pages:
        words = count_words(page.text)
        if words < lim.page_min_words:
            yield _issue(
                "PAGE_LENGTH_OUT_OF_RANGE",
                page.page_id,
                f"Trang '{_q(page.page_id)}' có {words} tiếng, tối thiểu {lim.page_min_words}.",
            )
        elif words * _PAGE_OVERSHOOT_DEN > lim.page_max_words * _PAGE_OVERSHOOT_NUM:
            yield _issue(
                "PAGE_LENGTH_OUT_OF_RANGE",
                page.page_id,
                f"Trang '{_q(page.page_id)}' có {words} tiếng, tối đa {lim.page_max_words}.",
            )


def _check_checkpoint_text_length(ctx: ValidationContext) -> Iterable[Issue]:
    lim = ctx.frame.limits
    for cp in ctx.output.checkpoints:
        fields: list[tuple[str, str | None, int]] = [
            ("question", cp.question, lim.question_max_words),
            ("hint", cp.hint, lim.hint_max_words),
        ]
        for opt in cp.options:
            fields.append(("options[].text", opt.text, lim.option_max_words))
            fields.append(("options[].feedback", opt.feedback, lim.feedback_max_words))
        for label, text, limit in fields:
            if text and (words := count_words(text)) > limit:
                yield _issue(
                    "CHECKPOINT_TEXT_TOO_LONG",
                    cp.checkpoint_id,
                    f"Checkpoint '{_q(cp.checkpoint_id)}', {label} có {words} tiếng, "
                    f"tối đa {limit}.",
                )


def _check_emotion_spoiled(ctx: ValidationContext) -> Iterable[Issue]:
    lexicon = load_content_rules().emotion_lexicon
    pages = {p.page_id: p.text for p in ctx.output.pages}
    for frame_cp, cp in _paired_checkpoints(ctx, _EMOTION):
        if cp.answer not in {e.value for e in Emotion}:
            continue  # #7 reports it
        text = pages.get(frame_cp.after)
        if text is None:
            continue
        for word in lexicon[Emotion(cp.answer)]:
            if contains_phrase(text, word):
                yield _issue(
                    "EMOTION_SPOILED_BY_PAGE",
                    frame_cp.id,
                    f"Trang '{frame_cp.after}' (ngay trước checkpoint '{frame_cp.id}') đã nói "
                    f"thẳng cảm xúc bằng từ '{word}'; câu hỏi cảm xúc mất ý nghĩa.",
                )
                break


def _check_preachy(ctx: ValidationContext) -> Iterable[Issue]:
    phrases = load_content_rules().preachy_phrases
    seen: set[tuple[str, str]] = set()
    for target_id, text in _page_and_feedback_texts(ctx):
        for phrase in phrases:
            if (target_id, phrase) not in seen and contains_phrase(text, phrase):
                seen.add((target_id, phrase))
                yield _issue(
                    "PREACHY_PHRASE",
                    target_id,
                    f"'{_q(target_id)}' có cụm giảng đạo lý '{phrase}'; hãy để câu chuyện tự nói.",
                )


def _check_sentence_length(ctx: ValidationContext) -> Iterable[Issue]:
    limit = ctx.frame.limits.sentence_max_words
    for page in ctx.output.pages:
        counts = [count_words(s) for s in split_sentences(page.text)]
        long = [n for n in counts if n > limit]
        if long:
            yield _issue(
                "PAGE_SENTENCE_TOO_LONG",
                page.page_id,
                f"Trang '{_q(page.page_id)}' có {len(long)} câu quá dài (dài nhất {max(long)} "
                f"tiếng), mỗi câu tối đa {limit}.",
            )


def _never(_ctx: ValidationContext) -> Iterable[Issue]:
    return ()


R, W, D = Severity.RETRY, Severity.WARN, Severity.DOWNGRADE_AFTER_RETRY

RULES: tuple[Rule, ...] = (
    Rule("OUTPUT_SCHEMA_INVALID", R, "docs04:1", _never),
    Rule("PAGE_IDS_MISMATCH", R, "docs04:2", _check_page_ids),
    Rule("CHECKPOINT_IDS_MISMATCH", R, "docs04:2", _check_checkpoint_ids),
    Rule("PAGE_SCENE_MISSING", R, "docs04:3", _check_page_scene),
    Rule("SCENE_COUNT_EXCEEDED", R, "docs04:3", _check_scene_count),
    Rule("SCENE_DESCRIPTION_MISSING", R, "docs04:3", _check_scene_description),
    Rule("EMOTION_ANSWER_INVALID", R, "docs04:4", _check_emotion_answer, _EMOTION),
    Rule("EMOTION_HINT_MISSING", R, "docs03", _check_hint, _HINTED),
    Rule("PERSPECTIVE_OPTIONS_INVALID", R, "docs04:5", _check_perspective_options, _PERSPECTIVE),
    Rule("PERSPECTIVE_ANSWER_INVALID", R, "docs04:5", _check_perspective_answer, _PERSPECTIVE),
    Rule(
        "PROBLEM_SOLVING_ROLES_INVALID", R, "docs04:6", _check_problem_solving_roles, _PS
    ),
    Rule(
        "PROBLEM_SOLVING_FIELD_MISSING", R, "docs04:6", _check_problem_solving_fields, _PS
    ),
    Rule("REFLECTION_SHAPE_INVALID", R, "docs03", _check_reflection_shape, _REFLECTION),
    Rule("UNKNOWN_CHARACTER_TOKEN", R, "docs04:7", _check_unknown_token),
    Rule("BLOCKED_KEYWORD_BLOCK", R, "docs04:9", _check_blocked_block),
    Rule("BLOCKED_KEYWORD_WARN", W, "docs04:10", _check_blocked_warn),
    Rule("PAGE_LENGTH_OUT_OF_RANGE", D, "docs04:11+12", _check_page_length),
    Rule("CHECKPOINT_TEXT_TOO_LONG", R, "docs04:13", _check_checkpoint_text_length),
    Rule("EMOTION_SPOILED_BY_PAGE", W, "docs04:14", _check_emotion_spoiled, _EMOTION),
    Rule("PREACHY_PHRASE", W, "docs07", _check_preachy),
    Rule("PAGE_SENTENCE_TOO_LONG", D, "docs03", _check_sentence_length),
    Rule("OUTPUT_TRUNCATED", R, "docs04:1", _never),
)

RULE_SEVERITY: dict[str, Severity] = {rule.code: rule.severity for rule in RULES}
RULES_BY_CODE: dict[str, Rule] = {rule.code: rule for rule in RULES}


def validate(ctx: ValidationContext) -> list[Issue]:
    """Run every rule; no early exit - the retry prompt needs all issues (spec 7.4)."""
    return [issue for rule in RULES for issue in rule.check(ctx)]
