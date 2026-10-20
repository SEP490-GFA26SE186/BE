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


# Perspective may ask "why" about the scene in general (task-10 contract), so only
# emotion_other still needs to know whose feeling it asks about.
_NEEDS_TARGET = {CheckpointType.EMOTION_OTHER}
_EMOTION_TYPES = {CheckpointType.EMOTION_SELF, CheckpointType.EMOTION_OTHER}


class SubSkillIn(StrictModel):
    name: str
    description: str


class Topic(StrictModel):
    title: str
    competency: Competency
    guidance: str
    # Optional until Node sends them (task-10 contract); the prompt falls back to 5-8.
    age_min: PositiveInt | None = None
    age_max: PositiveInt | None = None
    sub_skills: list[SubSkillIn] = []

    @model_validator(mode="after")
    def _age_range_ordered(self) -> "Topic":
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError("cần age_min <= age_max")
        return self


class CharacterIn(StrictModel):
    token: Token
    description: str
    is_main: bool


class RoleGuide(StrictModel):
    """What each problem_solving option must be (Specialist template); roles stay fixed."""

    constructive: str
    avoidant: str
    impulsive: str


class CheckpointGuide(StrictModel):
    """Specialist-authored question template for one scored checkpoint (task-10 contract).

    The AI writes the question / options / page to it; it never carries scores or rationale
    (StrictModel rejects them). Type-specific fields are checked by the request validator.
    """

    sub_skill: str
    question_frame: str
    page_setup: str | None = None
    hint_guidance: str | None = None
    allowed_emotions: list[Emotion] | None = None  # emotion_* only
    correct_desc: str | None = None  # perspective only
    distractor_desc: str | None = None  # perspective only
    roles: RoleGuide | None = None  # problem_solving only


class CheckpointFrame(StrictModel):
    id: str
    type: CheckpointType
    after: str
    target: str | None = None
    guide: CheckpointGuide | None = None


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
            errors.extend(_guide_errors(cp))

        mains = sum(1 for c in self.characters if c.is_main)
        if mains != 1:
            errors.append(f"cần đúng một nhân vật is_main, đang có {mains}")

        if errors:
            raise ValueError("; ".join(errors))
        return self


def _guide_errors(cp: CheckpointFrame) -> list[str]:
    """A guide may only carry the fields of its checkpoint type (task-10 contract)."""
    g = cp.guide
    if g is None:
        return []
    kind = cp.type.value
    if cp.type is CheckpointType.REFLECTION:
        return [f"checkpoint '{cp.id}' kiểu reflection không có guide"]
    errors: list[str] = []
    if g.roles is not None and cp.type is not CheckpointType.PROBLEM_SOLVING:
        errors.append(f"checkpoint '{cp.id}' kiểu {kind}: guide.roles chỉ dùng cho problem_solving")
    if g.allowed_emotions is not None and cp.type not in _EMOTION_TYPES:
        errors.append(
            f"checkpoint '{cp.id}' kiểu {kind}: guide.allowed_emotions chỉ dùng cho emotion_self, "
            "emotion_other"
        )
    for name in ("correct_desc", "distractor_desc"):
        if getattr(g, name) is not None and cp.type is not CheckpointType.PERSPECTIVE:
            errors.append(f"checkpoint '{cp.id}' kiểu {kind}: guide.{name} chỉ dùng cho perspective")
    return errors


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
