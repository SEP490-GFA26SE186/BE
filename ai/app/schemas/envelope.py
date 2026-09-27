from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.errors import ErrorKind


class _CamelModel(BaseModel):
    """Node gui/nhan camelCase, Python viet snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GenerateRequest(_CamelModel):
    """Phong bi request dung chung cho MOI endpoint sinh noi dung."""

    job_id: str
    idempotency_key: str

    # Duong dan tren Storage, do Node quyet dinh. Python coi day la chuoi
    # OPAQUE: khong parse, khong doan trong do co story id hay khong. Nho vay
    # schema DB doi kieu gi thi service nay cung khong phai sua.
    storage_prefix: str

    # CO Y de long: shape cua `input` thuoc quyen so huu cua Node va se duoc
    # chot khi schema DB chot. Khi do, tung endpoint se khai bao mot Pydantic
    # model rieng cho `input` — transport, error handling, storage va Docker
    # deu khong phai sua theo.
    input: dict[str, Any] = Field(default_factory=dict)


class Usage(_CamelModel):
    """So lieu de Node tinh credit. Day la su that tu provider, khong phai tu DB."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    output_units: int | None = None


class GenerateResponse(_CamelModel):
    status: Literal["succeeded"] = "succeeded"
    provider: str
    model: str | None = None
    result: dict[str, Any]
    usage: Usage
    latency_ms: int


class ErrorResponse(_CamelModel):
    """Than response khi that bai. Node doc `errorKind` de quyet dinh retry."""

    status: Literal["failed"] = "failed"
    error_kind: ErrorKind
    message: str
    # Thong tin phu tro, chi de doc log — Node khong dua vao truong nay.
    retryable: bool
