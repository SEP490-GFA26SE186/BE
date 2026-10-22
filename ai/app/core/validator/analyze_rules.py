"""Validator of the analysis output (family-story spec 5.3, A.2).

Every issue is RETRY: the analysis is short, so there is nothing worth keeping from a wrong
answer. Issue.detail is Vietnamese (retry prompt) and echoes codes / tokens / counts only.
"""

import re

from app.core.text_utils import contains_phrase, count_words
from app.core.validator.issues import Issue, Severity
from app.schemas.analyze import StoryAnalyzeRequest
from app.schemas.llm import LlmAnalyzeOutput

MIN_CODES, MAX_CODES = 1, 2
_TOKEN_RE = re.compile(r"\{NV\d+\}")
_ECHO_MAX = 40


def _q(value: object) -> str:
    text = str(value)
    return text if len(text) <= _ECHO_MAX else text[:_ECHO_MAX] + "…"


def _issue(code: str, detail: str) -> Issue:
    return Issue(code=code, target_id=None, detail=detail, severity=Severity.RETRY)


def present(value: str | None) -> bool:
    return value is not None and bool(value.strip())


def allowed_codes(req: StoryAnalyzeRequest, has_moment: bool) -> tuple[str, list[str]]:
    """(list name, codes) the answer must pick from (A.2): forced -> exactly forced; a moment
    -> catalog; no moment -> needs (catalog when needs is empty)."""
    if req.forced_sub_skills:
        return "forced_sub_skills", list(req.forced_sub_skills)
    if has_moment or not req.needs:
        return "catalog", [c.code for c in req.catalog]
    return "needs", list(req.needs)


def _check_codes(req: StoryAnalyzeRequest, out: LlmAnalyzeOutput) -> list[Issue]:
    codes = out.sub_skill_codes
    issues: list[Issue] = []
    if not MIN_CODES <= len(codes) <= MAX_CODES:
        issues.append(_issue(
            "ANALYZE_CODE_COUNT",
            f"sub_skill_codes có {len(codes)} mã, cần {MIN_CODES}–{MAX_CODES} mã.",
        ))
    for dup in sorted({c for c in codes if codes.count(c) > 1}):
        issues.append(_issue("ANALYZE_CODE_COUNT", f"Mã '{_q(dup)}' bị lặp trong sub_skill_codes."))

    name, allowed = allowed_codes(req, present(out.moment_summary))
    if req.forced_sub_skills:
        if codes != allowed:
            issues.append(_issue(
                "ANALYZE_CODE_NOT_ALLOWED",
                f"Phụ huynh đã chọn kỹ năng: sub_skill_codes phải đúng {allowed}, theo đúng thứ tự.",
            ))
        return issues
    for code in codes:
        if code not in allowed:
            issues.append(_issue(
                "ANALYZE_CODE_NOT_ALLOWED",
                f"Mã '{_q(code)}' không thuộc danh sách {name}; chỉ chọn trong: "
                f"{', '.join(allowed)}.",
            ))
    return issues


def _check_moment_or_seed(out: LlmAnalyzeOutput) -> list[Issue]:
    has_moment, has_seed = present(out.moment_summary), present(out.seed_event)
    if has_moment == has_seed:
        state = "cả hai" if has_moment else "không trường nào"
        return [_issue(
            "ANALYZE_MOMENT_SEED_INVALID",
            f"Cần đúng một trong moment_summary hoặc seed_event có giá trị, đang có {state}; "
            "trường còn lại để null.",
        )]
    return []


def _texts(out: LlmAnalyzeOutput) -> list[tuple[str, str]]:
    texts = [("moment_summary", out.moment_summary), ("seed_event", out.seed_event)]
    return [(label, text) for label, text in texts if present(text)]


def _check_length(req: StoryAnalyzeRequest, out: LlmAnalyzeOutput) -> list[Issue]:
    limits = {
        "moment_summary": req.limits.moment_max_words,
        "seed_event": req.limits.seed_event_max_words,
    }
    issues: list[Issue] = []
    for label, text in _texts(out):
        words, limit = count_words(text), limits[label]
        if words > limit:
            issues.append(_issue(
                "ANALYZE_TEXT_TOO_LONG", f"{label} có {words} tiếng, tối đa {limit}."
            ))
    return issues


def _check_tokens(req: StoryAnalyzeRequest, out: LlmAnalyzeOutput) -> list[Issue]:
    declared = {c.token for c in req.characters}
    issues: list[Issue] = []
    for label, text in [*_texts(out), *(("reasons", r) for r in out.reasons)]:
        for token in sorted(set(_TOKEN_RE.findall(text)) - declared):
            issues.append(_issue(
                "UNKNOWN_CHARACTER_TOKEN",
                f"{label} dùng token {_q(token)} chưa khai báo; chỉ dùng: "
                f"{', '.join(sorted(declared))}.",
            ))
    return issues


def _check_blocked(req: StoryAnalyzeRequest, out: LlmAnalyzeOutput) -> list[Issue]:
    # Same matching as the story rule BLOCKED_KEYWORD_BLOCK; warn-level keywords are not
    # reported (the analysis response has no warnings list).
    keywords = [k.keyword for k in req.blocked_keywords if k.severity == "block"]
    return [
        _issue(
            "BLOCKED_KEYWORD_BLOCK",
            f"{label} chứa từ khoá bị chặn '{_q(keyword)}', hãy diễn đạt khác.",
        )
        for label, text in _texts(out)
        for keyword in keywords
        if contains_phrase(text, keyword)
    ]


def validate_analysis(req: StoryAnalyzeRequest, out: LlmAnalyzeOutput) -> list[Issue]:
    """Run every check; no early exit - the retry prompt needs all issues."""
    return [
        *_check_codes(req, out),
        *_check_moment_or_seed(out),
        *_check_length(req, out),
        *_check_tokens(req, out),
        *_check_blocked(req, out),
    ]
