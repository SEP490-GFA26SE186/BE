"""Shape the LLM returns (spec 5.4): lists, flat checkpoint, optional fields.

Deliberately lax: the validator registry (core/validator/rules.py) enforces per-type
requirements so retry prompts can carry specific issues.
"""

from pydantic import BaseModel


class LlmPage(BaseModel):
    page_id: str
    scene_id: str
    text: str


class LlmScene(BaseModel):
    scene_id: str
    description: str


class LlmOption(BaseModel):
    option_id: str | None = None  # perspective: "o1"...
    role: str | None = None  # problem_solving: constructive|avoidant|impulsive
    text: str
    feedback: str | None = None  # problem_solving only


class LlmCheckpoint(BaseModel):
    checkpoint_id: str
    type: str
    question: str
    answer: str | None = None  # REQUIRED by type - enforced in validator/rules.py, not here
    hint: str | None = None
    options: list[LlmOption] = []


class LlmStoryOutput(BaseModel):
    pages: list[LlmPage]
    scenes: list[LlmScene]
    checkpoints: list[LlmCheckpoint]


class LlmAnalyzeOutput(BaseModel):
    """Shape the LLM returns for POST /v1/story/analyze (family-story spec 5.3).

    Lax like LlmStoryOutput: the analyze validator enforces the rules so a retry can name them.
    """

    moment_summary: str | None = None
    seed_event: str | None = None
    sub_skill_codes: list[str]
    reasons: list[str] = []
