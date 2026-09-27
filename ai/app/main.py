import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api import health
from app.api.v1 import narration, story_page
from app.errors import AiError, ErrorKind, STATUS_BY_KIND
from app.schemas.envelope import ErrorResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

app = FastAPI(
    title="StoryWeaver AI — inference service",
    version="0.1.0",
    description=(
        "Service sinh noi dung AI. Stateless: khong DB, khong Redis, khong biet "
        "gi ve user hay credit. Chi Node goi qua network noi bo."
    ),
)

app.include_router(health.router)
app.include_router(story_page.router)
app.include_router(narration.router)


def _error_response(kind: ErrorKind, message: str) -> JSONResponse:
    body = ErrorResponse(
        error_kind=kind,
        message=message,
        retryable=kind not in {ErrorKind.BLOCKED_CONTENT, ErrorKind.INVALID_INPUT},
    )
    return JSONResponse(
        status_code=STATUS_BY_KIND[kind],
        content=body.model_dump(by_alias=True),
    )


@app.exception_handler(AiError)
async def handle_ai_error(_: Request, error: AiError) -> JSONResponse:
    """Doi AiError thanh response theo bang loi — DUY NHAT mot cho.

    Endpoint khong tu dat status code. Neu de moi endpoint tu quyet dinh thi
    contract se lech dan theo thoi gian, dung kieu bug ma sang thang 11 khong
    ai muon di tim.
    """
    logger.warning("AiError %s: %s", error.kind, error.message)
    return _error_response(error.kind, error.message)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    """GHI DE handler mac dinh cua FastAPI — day la cho de sai rat de bo lot.

    Mac dinh FastAPI tra HTTP 422 cho payload sai, nhung 422 trong contract cua
    minh CO NGHIA LA `blocked_content`. Va than response mac dinh khong co
    truong `errorKind`, nen Node se coi la `provider_error` roi RETRY 3 lan mot
    payload khong bao gio dung duoc.
    """
    return _error_response(ErrorKind.INVALID_INPUT, f"Payload khong hop le: {error.errors()}")


@app.exception_handler(NotImplementedError)
async def handle_not_implemented(_: Request, error: NotImplementedError) -> JSONResponse:
    """Provider chua hien thuc (vd. AI_PROVIDER=gemini o giai doan nay).

    Tra invalid_input de Node KHONG retry: thu lai 3 lan mot provider chua viet
    xong chi lam nhieu log.
    """
    return _error_response(ErrorKind.INVALID_INPUT, str(error))


@app.exception_handler(Exception)
async def handle_unexpected(_: Request, error: Exception) -> JSONResponse:
    """Luoi an toan: loi khong luong truoc van phai co `errorKind`.

    Neu de FastAPI tra HTML 500 mac dinh, Node se khong doc duoc errorKind.
    Mac dinh la provider_error (retryable) — hop ly vi loi la thi co the la tam thoi.
    """
    logger.exception("Loi khong luong truoc: %s", error)
    return _error_response(ErrorKind.PROVIDER_ERROR, f"Loi noi bo: {error}")
