from enum import StrEnum

from app.schemas.common import Usage


class ErrorCode(StrEnum):
    INVALID_INPUT = "INVALID_INPUT"
    FORBIDDEN_TERM_DETECTED = "FORBIDDEN_TERM_DETECTED"
    SAFETY_BLOCKED = "SAFETY_BLOCKED"
    OUTPUT_INVALID = "OUTPUT_INVALID"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    TIMEOUT = "TIMEOUT"


# HTTP status per code (spec 4.3). INVALID_INPUT is 422, so the RequestValidationError
# handler in main.py must be overridden: FastAPI's default 422 body has no `error.code`.
STATUS_BY_CODE: dict[ErrorCode, int] = {
    ErrorCode.INVALID_INPUT: 422,
    ErrorCode.FORBIDDEN_TERM_DETECTED: 422,
    ErrorCode.SAFETY_BLOCKED: 422,
    ErrorCode.OUTPUT_INVALID: 502,
    ErrorCode.PROVIDER_ERROR: 502,
    ErrorCode.TIMEOUT: 504,
}

# Codes Node will NOT retry. Must match NON_RETRYABLE_ERROR_CODES in
# api/src/clients/aiClient.js; tests compare against a hand-written copy.
NON_RETRYABLE: frozenset[ErrorCode] = frozenset(
    {
        ErrorCode.INVALID_INPUT,
        ErrorCode.FORBIDDEN_TERM_DETECTED,
        ErrorCode.SAFETY_BLOCKED,
        ErrorCode.OUTPUT_INVALID,
    }
)


class AiError(Exception):
    """The only error an endpoint may raise.

    Endpoints never pick an HTTP status; the single handler in main.py turns this into a
    response. `usage` is set once at least one LLM call returned a response (spec 3.11.3).
    `call_tokens` = (input, output) tokens of a blocked response: the provider sets it,
    the orchestrator adds it to the usage.
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        usage: Usage | None = None,
        call_tokens: tuple[int, int] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.usage = usage
        self.call_tokens = call_tokens

    @property
    def status_code(self) -> int:
        return STATUS_BY_CODE[self.code]

    @property
    def retryable(self) -> bool:
        return self.code not in NON_RETRYABLE

    @classmethod
    def invalid_input(cls, message: str, *, usage: Usage | None = None) -> "AiError":
        return cls(ErrorCode.INVALID_INPUT, message, usage=usage)

    @classmethod
    def forbidden_term(cls, message: str, *, usage: Usage | None = None) -> "AiError":
        return cls(ErrorCode.FORBIDDEN_TERM_DETECTED, message, usage=usage)

    @classmethod
    def safety_blocked(
        cls,
        message: str,
        *,
        usage: Usage | None = None,
        call_tokens: tuple[int, int] | None = None,
    ) -> "AiError":
        return cls(ErrorCode.SAFETY_BLOCKED, message, usage=usage, call_tokens=call_tokens)

    @classmethod
    def output_invalid(
        cls,
        message: str,
        *,
        usage: Usage | None = None,
        call_tokens: tuple[int, int] | None = None,
    ) -> "AiError":
        return cls(ErrorCode.OUTPUT_INVALID, message, usage=usage, call_tokens=call_tokens)

    @classmethod
    def provider_error(cls, message: str, *, usage: Usage | None = None) -> "AiError":
        return cls(ErrorCode.PROVIDER_ERROR, message, usage=usage)

    @classmethod
    def timeout(cls, message: str, *, usage: Usage | None = None) -> "AiError":
        return cls(ErrorCode.TIMEOUT, message, usage=usage)
