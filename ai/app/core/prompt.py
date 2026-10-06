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
from app.schemas.story import StoryGenerateRequest

_TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "prompts" / "story.v1.md"

# Vietnamese on purpose: prompt content (spec 7.2).
_NONE = "(không có)"
_RETRY_HEAD = "Bản trên có các lỗi sau, hãy sửa và trả lại TOÀN BỘ JSON:"
# Repeats CLAUDE.md ("page_id, checkpoint_id in = out"): a fix-up is when the model is most
# tempted to restructure (spec 8.2).
_RETRY_TAIL = "Giữ nguyên mọi page_id, checkpoint_id và kiểu điểm dừng."


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


def render_story_prompt(req: StoryGenerateRequest, settings: Settings) -> str:
    """Render the first-turn prompt. `forbidden_terms` is deliberately NOT an input."""
    lim = req.limits
    characters = "\n".join(
        f"- {c.token}: {c.description}" + (" (nhân vật chính)" if c.is_main else "")
        for c in req.characters
    )
    checkpoints = (
        "\n".join(
            f"- {cp.id}: kiểu {cp.type.value}, sau trang {cp.after}"
            + (f", hỏi về {cp.target}" if cp.target else "")
            for cp in req.checkpoints
        )
        or _NONE
    )
    blocked = ", ".join(kw.keyword for kw in req.blocked_keywords) or _NONE
    # substitute() (not safe_substitute): a placeholder without a value is a bug, fail loudly.
    return _TEMPLATE.substitute(
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
