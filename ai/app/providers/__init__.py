from app.errors import AiError
from app.schemas.common import ForceCode


def raise_forced(force: ForceCode | None) -> None:
    """Mock-only: turn a `__force` flag into the matching AiError (spec 4.3).

    Image / TTS have no retry loop, so INVALID_OUTPUT_ONCE ends as INVALID_INPUT.
    Messages are Vietnamese on purpose: they go back to Node (spec 7.2).
    """
    if force is None:
        return
    if force == ForceCode.SAFETY_BLOCKED:
        raise AiError.safety_blocked("Mock: nội dung bị chặn bởi bộ lọc an toàn.")
    if force == ForceCode.PROVIDER_ERROR:
        raise AiError.provider_error("Mock: lỗi provider giả lập.")
    if force == ForceCode.TIMEOUT:
        raise AiError.timeout("Mock: provider quá thời gian giả lập.")
    if force == ForceCode.OUTPUT_INVALID:
        raise AiError.output_invalid("Mock: output không hợp lệ giả lập.")
    raise AiError.invalid_input("Mock: INVALID_OUTPUT_ONCE giả lập.")
