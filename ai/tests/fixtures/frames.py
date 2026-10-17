"""Story request frames for tests. `make_frame` builds a valid StoryGenerateRequest."""

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


def make_limits(**overrides: int) -> dict[str, int]:
    return {**_LIMITS, **overrides}


def make_frame(
    length: str = "medium",
    *,
    pages: int | None = None,
    checkpoints: list[tuple[str, int]] | None = None,
    **overrides: Any,
) -> StoryGenerateRequest:
    """`short` / `medium` / `long` follow docs/03. `custom` takes `pages=N` and any
    `checkpoints=[(type, after_page_number), ...]`."""
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
            }
            for i, (t, after) in enumerate(cps, start=1)
        ],
        "limits": make_limits(),
        "forbidden_terms": ["An", "Bin"],
        "blocked_keywords": [],
    }
    payload.update(overrides)
    return StoryGenerateRequest.model_validate(payload)
