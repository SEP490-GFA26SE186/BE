"""Story prompt rendering (spec 9.4, plan adjustment 2).

The prompt contains `{NV1}` literally, so it is rendered with `string.Template` (`$name`):
`str.format()` and f-strings would both blow up on the braces. The version comes from the
template's own front matter, never hard-coded here.
"""

from pathlib import Path
from string import Template

import yaml

from app.config import Settings
from app.core.validator import Issue, Severity
from app.schemas.story import CheckpointFrame, CheckpointType, StoryGenerateRequest

# story.v1.md stays in the repo as history; v2 writes each checkpoint to its Specialist guide.
_TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "prompts" / "story.v2.md"

# Vietnamese on purpose: prompt content (spec 7.2).
_NONE = "(không có)"
_RETRY_HEAD = "Bản trên có các lỗi sau, hãy sửa và trả lại TOÀN BỘ JSON:"
# Repeats CLAUDE.md ("page_id, checkpoint_id in = out"): a fix-up is when the model is most
# tempted to restructure (spec 8.2).
_RETRY_TAIL = "Giữ nguyên mọi page_id, checkpoint_id và kiểu điểm dừng."
# Product default (docs/00) when the topic carries no age range (old callers).
_DEFAULT_AGE_RANGE = "trẻ 5–8 tuổi"

# The v1 per-type page setup, kept for checkpoints that arrive WITHOUT a guide (callers older
# than the task-10 contract); a guided checkpoint gets its own `page_setup` instead.
_DEFAULT_PAGE_SETUP: dict[CheckpointType, str] = {
    CheckpointType.EMOTION_SELF: (
        "- Trang ngay trước điểm dừng emotion_self hoặc emotion_other không có hướng dẫn riêng: "
        "lời kể có dấu hiệu cảm xúc cụ thể\n"
        "  (mặt đỏ, tay nắm chặt, giọng run, mắt ngấn nước...) để câu gợi ý nhắc lại được. Nếu "
        'viết "{NV1} đang giận" thì câu hỏi trở nên vô nghĩa.'
    ),
    CheckpointType.PERSPECTIVE: (
        "- Trang ngay trước điểm dừng perspective không có hướng dẫn riêng: có một sự việc gây ra "
        "phản ứng của nhân vật khác."
    ),
    CheckpointType.PROBLEM_SOLVING: (
        "- Trang ngay trước điểm dừng problem_solving không có hướng dẫn riêng: cao trào, nhân "
        "vật chính đứng trước một lựa chọn."
    ),
}
_SETUP_KEY = {CheckpointType.EMOTION_OTHER: CheckpointType.EMOTION_SELF}


def _load(path: Path) -> tuple[str, Template]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        raise ValueError(f"{path.name}: missing front matter")
    front, sep, body = raw[len("---\n") :].partition("\n---\n")
    if not sep:
        raise ValueError(f"{path.name}: unterminated front matter")
    meta = yaml.safe_load(front) or {}
    version = meta.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError(f"{path.name}: front matter has no 'version'")
    return version, Template(body.lstrip("\n"))


PROMPT_VERSION, _TEMPLATE = _load(_TEMPLATE_PATH)


def _age_range(req: StoryGenerateRequest) -> str:
    lo, hi = req.topic.age_min, req.topic.age_max
    if lo is None or hi is None:
        return _DEFAULT_AGE_RANGE
    return f"trẻ {lo}–{hi} tuổi"


def _sub_skills(req: StoryGenerateRequest) -> str:
    if not req.topic.sub_skills:
        return _NONE
    return "; ".join(f"{s.name} ({s.description})" for s in req.topic.sub_skills)


def _checkpoint_block(cp: CheckpointFrame) -> str:
    # First line is exactly the v1 line, so an unguided checkpoint renders as before.
    head = f"- {cp.id}: kiểu {cp.type.value}, sau trang {cp.after}" + (
        f", hỏi về {cp.target}" if cp.target else ""
    )
    g = cp.guide
    if g is None:
        return head
    lines = [
        head,
        f"  - Kỹ năng con: {g.sub_skill}",
        f"  - Câu hỏi viết theo khung: {g.question_frame}",
    ]
    if g.page_setup:
        lines.append(f"  - Trang ngay trước phải ({cp.after}): {g.page_setup}")
    if g.hint_guidance:
        lines.append(f"  - Gợi ý (hint): {g.hint_guidance}")
    if g.allowed_emotions:
        allowed = ", ".join(e.value for e in g.allowed_emotions)
        lines.append(f"  - Cảm xúc được chọn làm answer: {allowed}")
    if g.correct_desc:
        lines.append(f"  - Phương án đúng: {g.correct_desc}")
    if g.distractor_desc:
        lines.append(f"  - Phương án nhiễu: {g.distractor_desc}")
    if g.roles:
        lines.append(f"  - Vai constructive: {g.roles.constructive}")
        lines.append(f"  - Vai avoidant: {g.roles.avoidant}")
        lines.append(f"  - Vai impulsive: {g.roles.impulsive}")
    return "\n".join(lines)


def _default_page_setup(req: StoryGenerateRequest) -> str:
    """v1 page-setup bullets for the unguided scored checkpoints, one per type, in v1 order."""
    needed = {
        _SETUP_KEY.get(cp.type, cp.type)
        for cp in req.checkpoints
        if cp.guide is None and cp.type is not CheckpointType.REFLECTION
    }
    return "".join(f"{text}\n" for t, text in _DEFAULT_PAGE_SETUP.items() if t in needed)


def render_story_prompt(req: StoryGenerateRequest, settings: Settings) -> str:
    """Render the first-turn prompt. `forbidden_terms` is deliberately NOT an input."""
    lim = req.limits
    characters = "\n".join(
        f"- {c.token}: {c.description}" + (" (nhân vật chính)" if c.is_main else "")
        for c in req.characters
    )
    checkpoints = "\n".join(_checkpoint_block(cp) for cp in req.checkpoints) or _NONE
    blocked = ", ".join(kw.keyword for kw in req.blocked_keywords) or _NONE
    # substitute() (not safe_substitute): a placeholder without a value is a bug, fail loudly.
    return _TEMPLATE.substitute(
        age_range=_age_range(req),
        sub_skills=_sub_skills(req),
        default_page_setup=_default_page_setup(req),
        topic_title=req.topic.title,
        competency=req.topic.competency.value,
        guidance=req.topic.guidance,
        tone=req.tone,
        situation=req.situation or _NONE,
        page_count=len(req.pages),
        page_ids=", ".join(req.pages),
        checkpoints=checkpoints,
        page_min_words=lim.page_min_words,
        page_max_words=lim.page_max_words,
        page_target_min_words=lim.page_target_min_words,
        page_target_max_words=lim.page_target_max_words,
        sentence_max_words=lim.sentence_max_words,
        question_max_words=lim.question_max_words,
        option_max_words=lim.option_max_words,
        hint_max_words=lim.hint_max_words,
        feedback_max_words=lim.feedback_max_words,
        characters=characters,
        max_scenes=lim.max_scenes,
        scene_description_max_words=settings.scene_description_max_words,
        blocked_keywords=blocked,
    )


def render_retry_turn(issues: list[Issue]) -> str:
    """The fix-up `user` turn of the retry (spec 8.2): every non-WARN issue's detail.

    Built from `Issue.detail` only (bounded by the rules' `_q`); like the first prompt it has
    no access to `forbidden_terms`, so it cannot carry a real name.
    """
    lines = [f"- {issue.detail}" for issue in issues if issue.severity is not Severity.WARN]
    return "\n".join([_RETRY_HEAD, *lines, _RETRY_TAIL])
