"""Shared wire models."""

from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints


class StrictModel(BaseModel):
    """Base of every request model and nested model: unknown fields are errors (spec 3.5)."""

    model_config = ConfigDict(extra="forbid")


class ForceCode(StrEnum):
    SAFETY_BLOCKED = "SAFETY_BLOCKED"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    TIMEOUT = "TIMEOUT"
    OUTPUT_INVALID = "OUTPUT_INVALID"
    INVALID_OUTPUT_ONCE = "INVALID_OUTPUT_ONCE"


class ForceableRequest(StrictModel):
    """Top-level request base carrying the mock-only `__force` flag (spec 4.3).

    Pydantic treats names starting with `_` as private, hence `force_` + alias.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    force_: ForceCode | None = Field(default=None, alias="__force")


def _no_dotdot_segment(value: str) -> str:
    if ".." in value.split("/"):
        raise ValueError("path must not contain a '..' segment")
    if value.startswith("/"):
        raise ValueError("path must not start with '/'")
    return value


def _not_dot_id(value: str) -> str:
    if value in {".", ".."}:
        raise ValueError("id must not be '.' or '..'")
    return value


# Used to build file paths (write and read), so it is validated (spec 5.6). The pattern
# already excludes backslash, spaces and '?'.
StorageKey = Annotated[
    str,
    StringConstraints(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9/_\-.]+$"),
    AfterValidator(_no_dotdot_segment),
]

FileSafeId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_\-.]+$"),
    AfterValidator(_not_dot_id),
]


class Usage(BaseModel):
    provider: str
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    units: int = 0  # number of images / seconds of audio
    estimated_cost_micros: int = 0
    latency_ms: int
    attempts: int = 1


class OutputWarning(BaseModel):
    """Renamed from spec's `Warning` (shadows the builtin); the wire shape is unchanged."""

    code: str
    target_id: str | None = None
    detail: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool


class ErrorBody(BaseModel):
    """Error wire body. `usage` sits beside `error`, never inside it (spec 4.3)."""

    error: ErrorDetail
    usage: Usage | None = None

    def to_wire(self) -> dict[str, object]:
        # The `usage` key must be absent (not null) when there is none.
        exclude = {"usage"} if self.usage is None else None
        return self.model_dump(mode="json", exclude=exclude)
