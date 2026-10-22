"""Story prompt rendering (spec 9.4, plan adjustment 2).

The prompt contains `{NV1}` literally, so it is rendered with `string.Template` (`$name`):
`str.format()` and f-strings would both blow up on the braces. The version comes from the
template's own front matter, never hard-coded here.
"""

from pathlib import Path
from string import Template

import yaml

from app.config import Settings
from app.schemas.analyze import StoryAnalyzeRequest
from app.core.validator import Issue, Severity
from app.schemas.story import CheckpointFrame, CheckpointType, StoryGenerateRequest, SubSkillIn

# One prompt for every AI story (family-story spec 6.2). story.v1.md / story.v2.md stay in the
# repo as history; v3 renders the topic, real-story and family sections only when present.
_PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"
_TEMPLATE_PATH = _PROMPTS_DIR / "story.v3.md"

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
        "- Trang ngay trước điểm dừng emotion_self hoặc emotion_other không có dòng "
        '"Trang ngay trước phải": lời kể có dấu hiệu cảm xúc cụ thể\n'
        "  (mặt đỏ, tay nắm chặt, giọng run, mắt ngấn nước...) để câu gợi ý nhắc lại được. Nếu "
        'viết "{NV1} đang giận" thì câu hỏi trở nên vô nghĩa.'
    ),
    CheckpointType.PERSPECTIVE: (
        "- Trang ngay trước điểm dừng perspective không có dòng "
        '"Trang ngay trước phải": có một sự việc gây ra phản ứng của nhân vật khác.'
    ),
    CheckpointType.PROBLEM_SOLVING: (
        "- Trang ngay trước điểm dừng problem_solving không có dòng "
        '"Trang ngay trước phải": cao trào, nhân vật chính đứng trước một lựa chọn.'
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


def age_range(age_min: int | None, age_max: int | None) -> str | None:
    if age_min is None or age_max is None:
        return None
    if age_min == age_max:
        return f"trẻ {age_min} tuổi"
    return f"trẻ {age_min}–{age_max} tuổi"


def _age_range(req: StoryGenerateRequest) -> str:
    # Top-level age (from the child, family-story spec 5.2) wins over the topic's.
    return (
        age_range(req.age_min, req.age_max)
        or (req.topic and age_range(req.topic.age_min, req.topic.age_max))
        or _DEFAULT_AGE_RANGE
    )


def _sub_skill_list(sub_skills: list[SubSkillIn]) -> str:
    if not sub_skills:
        return _NONE
    return "; ".join(f"{s.name} ({s.description})" for s in sub_skills)


# Vietnamese on purpose: prompt content. Kept identical to the v2 lines so topic stories read
# as before.
_REAL_STORY_RULE = (
    "Giữ đúng diễn biến chính của chuyện thật (ai làm gì, theo thứ tự nào) để trẻ nhận ra chuyện "
    "của\nmình; viết lại bằng lời kể cho trẻ, không chép nguyên văn. Chỉ được làm nhẹ chi tiết "
    "nguy hiểm hoặc\nđáng sợ (bị thương nặng, máu, đánh nhau); khi làm nhẹ, giữ lại hành động và "
    "cảm xúc của nhân vật."
)
_PRIORITY_RULE = (
    "Luật ưu tiên: điểm dừng chấm điểm luôn đúng hướng dẫn của chuyên gia; lời kể quyết định bối "
    "cảnh, nhân vật, diễn biến."
)


def _topic_section(req: StoryGenerateRequest) -> str:
    t = req.topic
    if t is None:
        return ""
    return (
        f"Bài học: {t.title}\n"
        f"Năng lực CASEL: {t.competency.value}\n"
        f"Hướng dẫn của chuyên gia: {t.guidance}\n"
        f"Kỹ năng con của bài học: {_sub_skill_list(t.sub_skills)}\n"
    )


def _situation_section(req: StoryGenerateRequest) -> str:
    if not req.situation or not req.situation.strip():
        return ""
    return f"Chuyện thật phụ huynh kể: {req.situation}\n\n{_REAL_STORY_RULE}\n"


def _family_section(req: StoryGenerateRequest) -> str:
    f = req.family
    if f is None:
        return ""
    after = next((cp.id for cp in req.checkpoints if cp.after == f.anchor_page), None)
    place = f.anchor_page + (f" (ngay trước điểm dừng {after})" if after else "")
    lines = [""]
    if f.sub_skills:
        lines.append(f"Kỹ năng con bé tập trong truyện này: {_sub_skill_list(f.sub_skills)}")
    if f.moment:
        lines.append(
            f'Khoảnh khắc chính: "{f.moment}". Trang {place} phải là khoảnh khắc này; các điểm '
            "dừng khác xoay quanh diễn biến trước và sau nó."
        )
    if f.seed_event:
        lines.append(
            f'Tình tiết thêm: "{f.seed_event}". Đưa tình tiết này vào chuyện; trang {place} là '
            "lúc tình tiết xảy ra; phần còn lại giữ diễn biến phụ huynh kể."
        )
    lines.append(_PRIORITY_RULE)
    return "\n".join(lines) + "\n"


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
        f"  - Khung câu hỏi: {g.question_frame}",
    ]
    if g.page_setup:
        lines.append(f"  - Trang ngay trước phải ({cp.after}): {g.page_setup}")
    if g.hint_guidance:
        lines.append(f"  - Hướng gợi ý (hint): {g.hint_guidance}")
    if g.allowed_emotions:
        allowed = ", ".join(e.value for e in g.allowed_emotions)
        lines.append(f"  - Cảm xúc được chọn làm answer: {allowed}")
    if g.correct_desc:
        lines.append(f"  - Mô tả phương án đúng: {g.correct_desc}")
    if g.distractor_desc:
        lines.append(f"  - Mô tả phương án nhiễu: {g.distractor_desc}")
    if g.roles:
        lines.append(f"  - Mô tả vai constructive: {g.roles.constructive}")
        lines.append(f"  - Mô tả vai avoidant: {g.roles.avoidant}")
        lines.append(f"  - Mô tả vai impulsive: {g.roles.impulsive}")
    return "\n".join(lines)


def _default_page_setup(req: StoryGenerateRequest) -> str:
    """v1 page-setup bullets for scored checkpoints with no `page_setup` of their own (no guide,
    or a guide that left it out), one per type, in v1 order."""
    needed = {
        _SETUP_KEY.get(cp.type, cp.type)
        for cp in req.checkpoints
        if (cp.guide is None or not cp.guide.page_setup)
        and cp.type is not CheckpointType.REFLECTION
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
        default_page_setup=_default_page_setup(req),
        topic_section=_topic_section(req),
        situation_section=_situation_section(req),
        family_section=_family_section(req),
        tone=req.tone,
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


# ---- Analysis prompt (family-story spec 5.3) ----

ANALYZE_PROMPT_VERSION, _ANALYZE_TEMPLATE = _load(_PROMPTS_DIR / "analyze.v1.md")

# Vietnamese on purpose: prompt content.
_ANALYZE_RETRY_TAIL = "Chỉ dùng mã trong danh sách được phép và các token đã cho."
_CODE_RULES_FORCED = (
    '   - Phụ huynh đã chọn kỹ năng: sub_skill_codes phải đúng các mã ở mục "Kỹ năng phụ huynh '
    'đã chọn", theo đúng thứ tự đó.\n'
    "   - Lời kể có khoảnh khắc hợp với kỹ năng chính: giữ moment_summary, seed_event là null.\n"
    "   - Không có khoảnh khắc hợp: moment_summary là null, viết seed_event cho kỹ năng chính."
)
_CODE_RULES_MOMENT = (
    "   - Có khoảnh khắc: chọn trong danh mục dùng được kỹ năng khớp khoảnh khắc nhất."
)
_CODE_RULES_NEED = (
    "   - Không có khoảnh khắc: chọn trong danh sách bé đang cần kỹ năng gieo tự nhiên nhất vào "
    "chuyện, rồi viết seed_event."
)
_CODE_RULES_NO_NEED = (
    "   - Không có khoảnh khắc: chọn trong danh mục dùng được kỹ năng gieo tự nhiên nhất vào "
    "chuyện, rồi viết seed_event."
)


def _analyze_code_rules(req: StoryAnalyzeRequest) -> str:
    if req.forced_sub_skills:
        return _CODE_RULES_FORCED
    return "\n".join([_CODE_RULES_MOMENT, _CODE_RULES_NEED if req.needs else _CODE_RULES_NO_NEED])


def render_analyze_prompt(req: StoryAnalyzeRequest) -> str:
    """First-turn analysis prompt. `forbidden_terms` is deliberately NOT an input."""
    characters = "\n".join(
        f"- {c.token}: {c.description}" + (" (nhân vật chính)" if c.is_main else "")
        for c in req.characters
    )
    catalog = "\n".join(
        f"- {c.code}: {c.name} — {c.description} ({c.competency.value})" for c in req.catalog
    )
    forced = (
        "# Kỹ năng phụ huynh đã chọn\n\n" + ", ".join(req.forced_sub_skills) + "\n\n"
        if req.forced_sub_skills
        else ""
    )
    return _ANALYZE_TEMPLATE.substitute(
        age_range=age_range(req.age_min, req.age_max),
        situation=req.situation,
        characters=characters,
        catalog=catalog,
        needs=", ".join(req.needs) or _NONE,
        forced_section=forced,
        code_rules=_analyze_code_rules(req),
        moment_max_words=req.limits.moment_max_words,
        seed_event_max_words=req.limits.seed_event_max_words,
        blocked_keywords=", ".join(kw.keyword for kw in req.blocked_keywords) or _NONE,
    )


def render_analyze_retry_turn(issues: list[Issue]) -> str:
    """Fix-up `user` turn of the analysis retry; built from `Issue.detail` only."""
    lines = [f"- {issue.detail}" for issue in issues]
    return "\n".join([_RETRY_HEAD, *lines, _ANALYZE_RETRY_TAIL])
