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
