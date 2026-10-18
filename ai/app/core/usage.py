"""Usage accumulated across LLM calls of one request (spec 8.3)."""

from app.config import Settings
from app.schemas.common import Usage


def estimate_cost_micros(input_tokens: int, output_tokens: int, settings: Settings) -> int:
    """Spec 8.3: prices are micro-units per million tokens, integer division per side."""
    return (
        input_tokens * settings.price_text_input_per_mtok_micros // 1_000_000
        + output_tokens * settings.price_text_output_per_mtok_micros // 1_000_000
    )


class UsageAccumulator:
    """Sums every call, not just the last: retries cost real money (spec 8.3).

    `attempts` counts every call that STARTED (including one that failed on the network);
    tokens only come from calls that returned a response.
    """

    def __init__(self) -> None:
        self.attempts = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self._responses = 0

    def start_call(self) -> None:
        self.attempts += 1

    def add_response(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self._responses += 1

    @property
    def has_response(self) -> bool:
        """At least one call returned a response: error bodies then carry usage (3.11.3)."""
        return self._responses > 0

    def to_usage(
        self, provider: str, model: str | None, latency_ms: int, settings: Settings
    ) -> Usage:
        return Usage(
            provider=provider,
            model=model,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            units=0,
            estimated_cost_micros=estimate_cost_micros(
                self.input_tokens, self.output_tokens, settings
            ),
            latency_ms=latency_ms,
            attempts=self.attempts,
        )
