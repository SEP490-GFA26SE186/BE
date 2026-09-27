from enum import StrEnum


class ErrorKind(StrEnum):
    """Phan loai loi — quyet dinh worker ben Node co retry hay khong.

    Nguon su that cua bang nay la docs/contracts/ai-service.md. Phia Node,
    tap hop khong-retry duoc khai bao o src/clients/aiClient.js
    (NON_RETRYABLE_ERROR_KINDS). Hai ben phai khop nhau.
    """

    BLOCKED_CONTENT = "blocked_content"
    INVALID_INPUT = "invalid_input"
    PROVIDER_THROTTLED = "provider_throttled"
    PROVIDER_ERROR = "provider_error"
    TIMEOUT = "timeout"


# HTTP status cho tung loai loi. `blocked_content` dung 422 va `invalid_input`
# dung 400 — day la ly do vi sao handler cua RequestValidationError phai duoc
# ghi de o main.py: mac dinh FastAPI tra 422 cho payload sai, se bi doc lam
# "noi dung bi chan".
STATUS_BY_KIND: dict[ErrorKind, int] = {
    ErrorKind.BLOCKED_CONTENT: 422,
    ErrorKind.INVALID_INPUT: 400,
    ErrorKind.PROVIDER_THROTTLED: 429,
    ErrorKind.PROVIDER_ERROR: 500,
    ErrorKind.TIMEOUT: 504,
}

# Loai loi ma Node se KHONG retry. Giu o day de test doi chieu duoc voi Node.
NON_RETRYABLE: frozenset[ErrorKind] = frozenset(
    {ErrorKind.BLOCKED_CONTENT, ErrorKind.INVALID_INPUT}
)


class AiError(Exception):
    """Loi duy nhat ma endpoint duoc phep raise.

    Endpoint KHONG tu dat HTTP status code. Viec doi AiError thanh response do
    exception handler o main.py lam, de bang loi chi ton tai o mot cho.
    """

    def __init__(self, kind: ErrorKind, message: str) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message

    @property
    def status_code(self) -> int:
        return STATUS_BY_KIND[self.kind]

    @property
    def retryable(self) -> bool:
        return self.kind not in NON_RETRYABLE

    @classmethod
    def blocked(cls, message: str = "Noi dung bi bo loc an toan chan") -> "AiError":
        return cls(ErrorKind.BLOCKED_CONTENT, message)

    @classmethod
    def invalid_input(cls, message: str) -> "AiError":
        return cls(ErrorKind.INVALID_INPUT, message)

    @classmethod
    def throttled(cls, message: str = "Provider dang qua tai") -> "AiError":
        return cls(ErrorKind.PROVIDER_THROTTLED, message)

    @classmethod
    def provider_error(cls, message: str) -> "AiError":
        return cls(ErrorKind.PROVIDER_ERROR, message)

    @classmethod
    def timeout(cls, message: str = "Provider khong tra loi kip") -> "AiError":
        return cls(ErrorKind.TIMEOUT, message)
