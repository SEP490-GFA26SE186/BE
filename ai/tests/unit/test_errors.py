import pytest

from app.errors import NON_RETRYABLE, STATUS_BY_CODE, AiError, ErrorCode

# Must match NON_RETRYABLE_ERROR_CODES in api/src/clients/aiClient.js
NODE_NON_RETRYABLE = {
    "INVALID_INPUT",
    "FORBIDDEN_TERM_DETECTED",
    "SAFETY_BLOCKED",
    "OUTPUT_INVALID",
}


def test_non_retryable_matches_node_list() -> None:
    assert {c.value for c in NON_RETRYABLE} == NODE_NON_RETRYABLE


@pytest.mark.parametrize(
    ("code", "status"),
    [
        ("INVALID_INPUT", 422),
        ("FORBIDDEN_TERM_DETECTED", 422),
        ("SAFETY_BLOCKED", 422),
        ("OUTPUT_INVALID", 502),
        ("PROVIDER_ERROR", 502),
        ("TIMEOUT", 504),
    ],
)
def test_http_status_per_code(code: str, status: int) -> None:
    assert STATUS_BY_CODE[ErrorCode(code)] == status
    assert len(STATUS_BY_CODE) == 6


def test_ai_error_properties_and_constructors() -> None:
    e = AiError.output_invalid("x", call_tokens=(3, 4))
    assert e.status_code == 502 and e.retryable is False
    assert e.call_tokens == (3, 4) and e.usage is None
    assert AiError.provider_error("x").retryable is True
    assert AiError.timeout("x").status_code == 504
    assert AiError.invalid_input("x").code is ErrorCode.INVALID_INPUT
    assert AiError.forbidden_term("x").code is ErrorCode.FORBIDDEN_TERM_DETECTED
    assert AiError.safety_blocked("x").code is ErrorCode.SAFETY_BLOCKED
