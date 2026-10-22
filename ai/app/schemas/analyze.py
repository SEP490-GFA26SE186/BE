"""Request/response of POST /v1/story/analyze (family-story spec 5.3, A.2).

The parent's story (`situation`) arrives already tokenised (`{NVx}`); the AI finds the hard
moment in it (or writes a seed event) and picks 1-2 sub-skill codes. Node decides everything
else (catalog, needs, scoring).
"""

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ForceableRequest, StrictModel, Usage
from app.schemas.story import BlockedKeyword, CharacterIn, Competency, PositiveInt

MAX_NEEDS = 5
MAX_FORCED = 2


class CatalogSubSkill(StrictModel):
    code: str = Field(min_length=1)
    name: str
    description: str
    competency: Competency


class AnalyzeLimits(StrictModel):
    """No defaults on purpose: the caller sends every number (CLAUDE.md)."""

    moment_max_words: PositiveInt
    seed_event_max_words: PositiveInt


class StoryAnalyzeRequest(ForceableRequest):
    request_id: str
    situation: str = Field(min_length=1)
    characters: list[CharacterIn]
    age_min: PositiveInt
    age_max: PositiveInt
    catalog: list[CatalogSubSkill] = Field(min_length=1)
    needs: list[str] = []
    forced_sub_skills: list[str] = []
    limits: AnalyzeLimits
    forbidden_terms: list[str]
    blocked_keywords: list[BlockedKeyword]

    @model_validator(mode="after")
    def _check_references(self) -> "StoryAnalyzeRequest":
        # Messages are Vietnamese (returned to Node, spec 7.2) and name codes / tokens only.
        errors: list[str] = []

        def duplicates(values: list[str]) -> list[str]:
            return sorted({v for v in values if values.count(v) > 1})

        codes = [c.code for c in self.catalog]
        for d in duplicates(codes):
            errors.append(f"catalog: mã '{d}' bị trùng")
        for d in duplicates([c.token for c in self.characters]):
            errors.append(f"token '{d}' bị trùng")
        mains = sum(1 for c in self.characters if c.is_main)
        if mains != 1:
            errors.append(f"cần đúng một nhân vật is_main, đang có {mains}")
        if self.age_min > self.age_max:
            errors.append("cần age_min <= age_max")

        known = set(codes)
        for name, values, limit in (
            ("needs", self.needs, MAX_NEEDS),
            ("forced_sub_skills", self.forced_sub_skills, MAX_FORCED),
        ):
            if len(values) > limit:
                errors.append(f"{name} có {len(values)} mã, tối đa {limit}")
            for d in duplicates(values):
                errors.append(f"{name}: mã '{d}' bị trùng")
            for code in values:
                if code not in known:
                    errors.append(f"{name}: mã '{code}' không có trong catalog")

        if errors:
            raise ValueError("; ".join(errors))
        return self


class StoryAnalyzeResponse(BaseModel):
    request_id: str
    moment_summary: str | None
    seed_event: str | None
    sub_skill_codes: list[str]  # 1..2, the first one is the main sub-skill
    reasons: list[str]  # for logs / review only, never shown to the parent
    usage: Usage
    provider: str
    model: str | None
