"""Prompts for portraits and scenes (docs/06). The drawing style comes from
prompts/image_style.v1.md; requests cannot change it.

Portraits are drawn on a plain background on purpose: a portrait is the reference image of every
scene, and FLUX.2 copies whatever room is behind the character into all of them (seen in the
2026-10-19 comparison run).
"""

from functools import lru_cache
from pathlib import Path

STYLE_FILE = Path(__file__).resolve().parents[1] / "prompts" / "image_style.v1.md"
NEGATIVE = "text, letters, words, watermark, logo, deformed hands, extra fingers, distorted face, scary, violent, blurry"


@lru_cache
def image_style() -> str:
    return STYLE_FILE.read_text(encoding="utf-8").strip()


def portrait_prompt(description: str) -> str:
    return (
        f"{image_style()}\n\nCharacter reference sheet of {description}. Full body, standing, front view, "
        "friendly calm expression, plain white background with nothing else, single character only."
    )


def scene_prompt(description: str, characters: list[str], *, referenced: int, dialect: str = "natural") -> str:
    """`characters`: appearance texts in reference order. The first `referenced` of them are given to
    the model as input_image_0..N-1; the rest are only described."""
    parts = [f"the character in image {i} is {c}" for i, c in enumerate(characters[:referenced])]
    parts += characters[referenced:]
    cast = ""
    if parts:
        cast = "Characters: " + "; ".join(parts) + "."
        if referenced:
            cast += " Keep their faces, hair and clothes exactly as in the reference images."
    setting = "A cozy Vietnamese everyday setting."
    if dialect == "tags":
        return f"{description} {cast} {setting} {image_style()}"
    return f"{image_style()}\n\nScene: {description} {setting}\n{cast}".strip()
