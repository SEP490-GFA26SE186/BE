"""Loader of app/content_rules.yaml (spec 7.3): emotion lexicon + preachy phrases."""

from dataclasses import dataclass
from functools import cache
from pathlib import Path

import yaml

from app.schemas.story import Emotion

CONTENT_RULES_PATH = Path(__file__).resolve().parents[2] / "content_rules.yaml"


@dataclass(frozen=True)
class ContentRules:
    emotion_lexicon: dict[Emotion, list[str]]
    preachy_phrases: list[str]


def _word_list(value: object, what: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(w, str) and w.strip() for w in value):
        raise ValueError(f"content_rules: {what} must be a list of non-empty strings")
    return value


def load_content_rules_from(path: Path) -> ContentRules:
    """Parse and validate a rules file; a missing key or unknown emotion fails at load."""
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("content_rules: top level must be a mapping")
    for key in ("emotion_lexicon", "preachy_phrases"):
        if key not in data:
            raise ValueError(f"content_rules: missing key '{key}'")
    raw = data["emotion_lexicon"]
    if not isinstance(raw, dict):
        raise ValueError("content_rules: emotion_lexicon must be a mapping")
    valid = {e.value for e in Emotion}
    unknown = sorted(set(raw) - valid)
    if unknown:
        raise ValueError(f"content_rules: unknown emotion(s) in emotion_lexicon: {unknown}")
    absent = sorted(valid - set(raw))
    if absent:
        raise ValueError(f"content_rules: emotion_lexicon lacks emotion(s): {absent}")
    lexicon = {Emotion(k): _word_list(v, f"emotion_lexicon.{k}") for k, v in raw.items()}
    return ContentRules(
        emotion_lexicon=lexicon,
        preachy_phrases=_word_list(data["preachy_phrases"], "preachy_phrases"),
    )


@cache
def load_content_rules() -> ContentRules:
    return load_content_rules_from(CONTENT_RULES_PATH)
