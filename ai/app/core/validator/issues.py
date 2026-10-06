"""Severity and Issue (spec 7.1, 7.2)."""

from dataclasses import dataclass
from enum import StrEnum


class Severity(StrEnum):
    RETRY = "retry"  # wrong: retry
    WARN = "warn"  # accept, record in warnings
    DOWNGRADE_AFTER_RETRY = "downgrade"  # attempt 1: retry; attempt 2: accept + warning


@dataclass(frozen=True)
class Issue:
    code: str  # machine id, SCREAMING_SNAKE
    target_id: str | None  # "p3" | "k1" | "s2" | None
    # Vietnamese on purpose: goes into the retry prompt and into warnings[].detail for the
    # Moderator, so it is content, not a log (spec 7.2 - deliberate exception to English logs).
    detail: str
    severity: Severity
