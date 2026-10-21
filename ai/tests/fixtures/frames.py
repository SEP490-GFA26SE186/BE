"""Story request frames for tests. `make_frame` builds a valid StoryGenerateRequest."""

import copy
from typing import Any

from app.schemas.story import StoryGenerateRequest

# Default limits from docs/03.
_LIMITS: dict[str, int] = {
    "page_min_words": 20,
    "page_max_words": 70,
    "page_target_min_words": 40,
    "page_target_max_words": 60,
    "sentence_max_words": 15,
    "question_max_words": 15,
    "option_max_words": 12,
    "hint_max_words": 20,
    "feedback_max_words": 25,
    "max_scenes": 4,
}

# docs/03 table: (total pages, [(type, after page number)]).
_FRAMES: dict[str, tuple[int, list[tuple[str, int]]]] = {
    "short": (
        6,
        [("emotion_self", 2), ("perspective", 3), ("problem_solving", 4), ("reflection", 6)],
    ),
    "medium": (
        8,
        [("emotion_self", 2), ("perspective", 4), ("problem_solving", 5), ("reflection", 8)],
    ),
    "long": (
        10,
        [
            ("emotion_self", 2),
            ("perspective", 4),
            ("problem_solving", 6),
            ("emotion_other", 8),
            ("reflection", 10),
        ],
    ),
}

_NEEDS_TARGET = {"perspective": "{NV2}", "emotion_other": "{NV2}"}

# Specialist-authored question templates as Node sends them (task-10 contract): only the
# fields of that checkpoint type, never scores or rationale.
_GUIDE_COMMON = {
    "emotion_self": {
        "sub_skill": "Nhận ra dấu hiệu cơn giận",
        "question_frame": "Hỏi trẻ nhân vật chính đang thấy thế nào khi bị lấy mất đồ chơi.",
        "page_setup": "Tả mặt đỏ, tay nắm chặt, không gọi tên cảm xúc.",
        "hint_guidance": "Nhắc lại dấu hiệu trên mặt và tay nhân vật.",
        "allowed_emotions": ["angry", "sad"],
    },
    "emotion_other": {
        "sub_skill": "Nhận ra dấu hiệu cơn giận",
        "question_frame": "Hỏi trẻ em nhỏ đang thấy thế nào khi bị giành đồ.",
        "page_setup": "Tả mắt ngấn nước, giọng run.",
        "hint_guidance": "Nhắc lại đôi mắt và giọng nói của em.",
        "allowed_emotions": ["sad", "scared"],
    },
    "perspective": {
        "sub_skill": "Dừng lại trước khi phản ứng",
        "question_frame": "Hỏi vì sao em nhỏ lại chạy đi tìm mẹ.",
        "page_setup": "Một việc xảy ra khiến em nhỏ phản ứng.",
        "hint_guidance": "Nhắc lại việc vừa xảy ra trước đó.",
        "correct_desc": "Lý do đúng gắn với việc vừa xảy ra.",
        "distractor_desc": "Lý do nghe hợp lý nhưng không khớp truyện.",
    },
    "problem_solving": {
        "sub_skill": "Dừng lại trước khi phản ứng",
        "question_frame": "Hỏi nếu là nhân vật chính, con sẽ làm gì khi đang rất bực.",
        "page_setup": "Cao trào: nhân vật chính đứng trước lựa chọn.",
        "roles": {
            "constructive": "Hít thở sâu rồi nói điều mình muốn.",
            "avoidant": "Bỏ đi chỗ khác, không nói gì.",
            "impulsive": "Giật lại đồ chơi ngay.",
        },
    },
}

SUB_SKILLS = [
    {"name": "Nhận ra dấu hiệu cơn giận", "description": "Trẻ nhận ra cơ thể báo hiệu cơn giận."},
    {"name": "Dừng lại trước khi phản ứng", "description": "Trẻ biết dừng và hít thở."},
]


def make_guide(cp_type: str, **overrides: Any) -> dict[str, Any]:
    return {**copy.deepcopy(_GUIDE_COMMON[cp_type]), **overrides}


def make_limits(**overrides: int) -> dict[str, int]:
    return {**_LIMITS, **overrides}


def make_frame(
    length: str = "medium",
    *,
    pages: int | None = None,
    checkpoints: list[tuple[str, int]] | None = None,
    guides: bool = False,
    **overrides: Any,
) -> StoryGenerateRequest:
    """`short` / `medium` / `long` follow docs/03. `custom` takes `pages=N` and any
    `checkpoints=[(type, after_page_number), ...]`. `guides=True` attaches a Specialist guide
    to every scored checkpoint and an age range + sub-skills to the topic (task-10 contract)."""
    if length == "custom":
        total = pages if pages is not None else 8
        cps = checkpoints or []
    else:
        total, cps = _FRAMES[length]
    payload: dict[str, Any] = {
        "request_id": f"req-{length}",
        "topic": {
            "title": "Con hay nổi giận",
            "competency": "self_management",
            "guidance": "Giúp trẻ nhận ra dấu hiệu của cơn giận và chọn cách hạ nhiệt.",
        },
        "characters": [
            {"token": "{NV1}", "description": "bé trai 6 tuổi, áo xanh", "is_main": True},
            {"token": "{NV2}", "description": "em trai 4 tuổi", "is_main": False},
            {"token": "{NV3}", "description": "mẹ", "is_main": False},
        ],
        "situation": "{NV1} hay giành xe ô tô đỏ với {NV2}.",
        "tone": "gentle",
        "pages": [f"p{i}" for i in range(1, total + 1)],
        "checkpoints": [
            {
                "id": f"k{i}",
                "type": t,
                "after": f"p{after}",
                **({"target": _NEEDS_TARGET[t]} if t in _NEEDS_TARGET else {}),
                **({"guide": make_guide(t)} if guides and t != "reflection" else {}),
            }
            for i, (t, after) in enumerate(cps, start=1)
        ],
        "limits": make_limits(),
        "forbidden_terms": ["An", "Bin"],
        "blocked_keywords": [],
    }
    if guides:
        payload["topic"].update(age_min=6, age_max=9, sub_skills=SUB_SKILLS)
    payload.update(overrides)
    return StoryGenerateRequest.model_validate(payload)
