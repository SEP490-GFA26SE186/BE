"""Request/response of POST /v1/story/generate (spec 5.2, 5.3, 5.5)."""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import ForceableRequest, OutputWarning, StrictModel, Usage

Token = Annotated[str, StringConstraints(pattern=r"^\{NV\d+\}$")]
PositiveInt = Annotated[int, Field(gt=0)]


class Competency(StrEnum):
    SELF_AWARENESS = "self_awareness"
    SELF_MANAGEMENT = "self_management"
    SOCIAL_AWARENESS = "social_awareness"
    RELATIONSHIP_SKILLS = "relationship_skills"
    RESPONSIBLE_DECISION_MAKING = "responsible_decision_making"


class CheckpointType(StrEnum):
    EMOTION_SELF = "emotion_self"
    EMOTION_OTHER = "emotion_other"
    PERSPECTIVE = "perspective"
    PROBLEM_SOLVING = "problem_solving"
    REFLECTION = "reflection"


class Emotion(StrEnum):
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    SCARED = "scared"
    NEUTRAL = "neutral"


class ProblemSolvingRole(StrEnum):
    CONSTRUCTIVE = "constructive"
    AVOIDANT = "avoidant"
    IMPULSIVE = "impulsive"


_NEEDS_TARGET = {CheckpointType.EMOTION_OTHER, CheckpointType.PERSPECTIVE}


class Topic(StrictModel):
    title: str
    competency: Competency
    guidance: str


class CharacterIn(StrictModel):
    token: Token
    description: str
    is_main: bool


class CheckpointFrame(StrictModel):
    id: str
    type: CheckpointType
    after: str
    target: str | None = None


class Limits(StrictModel):
    """No defaults on purpose: the caller sends every number (CLAUDE.md)."""

    page_min_words: PositiveInt
    page_max_words: PositiveInt
    # What the prompt asks the model to aim for; min/max stay the validator's hard bounds.
    # Told only "min to max", models wrote near the minimum (docs/01, 2026-10-15).
    page_target_min_words: PositiveInt
    page_target_max_words: PositiveInt
    sentence_max_words: PositiveInt
    question_max_words: PositiveInt
    option_max_words: PositiveInt
    hint_max_words: PositiveInt
    feedback_max_words: PositiveInt
    max_scenes: PositiveInt

    @model_validator(mode="after")
    def _page_target_inside_bounds(self) -> "Limits":
        if not (
            self.page_min_words
            <= self.page_target_min_words
            <= self.page_target_max_words
            <= self.page_max_words
        ):
            raise ValueError(
                "need page_min_words <= page_target_min_words <= page_target_max_words "
                "<= page_max_words"
            )
        return self


class BlockedKeyword(StrictModel):
    keyword: str
    severity: Literal["warn", "block"]


class StoryGenerateRequest(ForceableRequest):
    request_id: str
    topic: Topic
    characters: list[CharacterIn]
    situation: str | None = None
    tone: Literal["gentle", "playful"]
    pages: list[str] = Field(min_length=1)
    checkpoints: list[CheckpointFrame]
    limits: Limits
    forbidden_terms: list[str]
    blocked_keywords: list[BlockedKeyword]

    @model_validator(mode="after")
    def _check_references(self) -> "StoryGenerateRequest":
        # Referential integrity only (spec 5.3). Story-shape policy is NOT checked here.
        # Messages are Vietnamese (returned to Node, spec 7.2) and name ids, never text content.
        errors: list[str] = []

        def duplicates(values: list[str]) -> list[str]:
            return sorted({v for v in values if values.count(v) > 1})

        for d in duplicates(self.pages):
            errors.append(f"page_id '{d}' bị trùng")
        for d in duplicates([c.id for c in self.checkpoints]):
            errors.append(f"checkpoint id '{d}' bị trùng")
        for d in duplicates([c.token for c in self.characters]):
            errors.append(f"token '{d}' bị trùng")

        page_set = set(self.pages)
        seen_after: set[str] = set()
        tokens = {c.token for c in self.characters}
        for cp in self.checkpoints:
            if cp.after not in page_set:
                errors.append(f"checkpoint '{cp.id}': trang '{cp.after}' không có trong pages")
            elif cp.after in seen_after:
                errors.append(f"checkpoint '{cp.id}': trang '{cp.after}' đã có checkpoint khác")
            seen_after.add(cp.after)
            if cp.type in _NEEDS_TARGET and cp.target is None:
                errors.append(f"checkpoint '{cp.id}' kiểu {cp.type.value} thiếu target")
            if cp.target is not None and cp.target not in tokens:
                errors.append(f"checkpoint '{cp.id}': target '{cp.target}' không phải token đã khai")

        mains = sum(1 for c in self.characters if c.is_main)
        if mains != 1:
            errors.append(f"cần đúng một nhân vật is_main, đang có {mains}")

        if errors:
            raise ValueError("; ".join(errors))
        return self


# ---- Response ----


class PageOut(BaseModel):
    scene: str
    text: str


class EmotionCheckpointOut(BaseModel):
    type: Literal["emotion_self", "emotion_other"]
    question: str
    answer: Emotion
    hint: str


class PerspectiveCheckpointOut(BaseModel):
    type: Literal["perspective"]
    question: str
    options: dict[str, str]  # keyed by option_id
    answer: str  # an option_id
    hint: str


class ProblemSolvingOptionOut(BaseModel):
    text: str
    feedback: str


class ProblemSolvingCheckpointOut(BaseModel):
    type: Literal["problem_solving"]
    question: str
    options: dict[ProblemSolvingRole, ProblemSolvingOptionOut]  # keyed by role


class ReflectionCheckpointOut(BaseModel):
    type: Literal["reflection"]
    question: str


CheckpointOut = Annotated[
    EmotionCheckpointOut
    | PerspectiveCheckpointOut
    | ProblemSolvingCheckpointOut
    | ReflectionCheckpointOut,
    Field(discriminator="type"),
]


class StoryGenerateResponse(BaseModel):
    request_id: str
    pages: dict[str, PageOut]
    scenes: dict[str, str]
    checkpoints: dict[str, CheckpointOut]
    warnings: list[OutputWarning]
    prompt_version: str
    usage: Usage
