import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api import health
from app.api.v1 import images, story, tts
from app.config import get_settings
from app.errors import NON_RETRYABLE, STATUS_BY_CODE, AiError, ErrorCode
from app.providers.llm.claude import ClaudeLLMProvider
from app.providers.llm.claude_code import ClaudeCodeLLMProvider
from app.providers.llm.gemini import GeminiLLMProvider
from app.schemas.common import ErrorBody, ErrorDetail, Usage

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")


def _error_response(code: ErrorCode, message: str, usage: Usage | None = None) -> JSONResponse:
    """The single place that builds an error response from (code, message, usage)."""
    body = ErrorBody(
        error=ErrorDetail(code=code, message=message, retryable=code not in NON_RETRYABLE),
        usage=usage,
    )
    return JSONResponse(status_code=STATUS_BY_CODE[code], content=body.to_wire())


async def handle_ai_error(_: Request, error: AiError) -> JSONResponse:
    """Turn AiError into a response, in ONE place.

    Endpoints never set a status code themselves; if each did, the contract would drift.
    Logged at WARNING with code + message only (no request content).
    """
    logger.warning("AiError %s: %s", error.code, error.message)
    return _error_response(error.code, error.message, error.usage)


async def handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    """OVERRIDE FastAPI's default handler; easy to miss.

    The default returns 422 with a body that has no `error.code`, so Node treats it as
    PROVIDER_ERROR (retryable) and retries a payload that can never succeed. We return
    INVALID_INPUT. Only `loc` + `msg` are kept: Pydantic's `input` would echo request
    content (names, story text) into the response and logs.
    """
    parts = [
        f"{'.'.join(str(p) for p in e.get('loc', ()))}: {e.get('msg', '')}"
        for e in error.errors()
    ]
    # Vietnamese on purpose: the message goes back to Node (spec 7.2).
    return _error_response(ErrorCode.INVALID_INPUT, "Payload không hợp lệ: " + "; ".join(parts))


async def handle_not_implemented(_: Request, error: NotImplementedError) -> JSONResponse:
    """A provider not implemented yet. INVALID_INPUT so Node does not retry it."""
    return _error_response(ErrorCode.INVALID_INPUT, str(error))


async def handle_unexpected(_: Request, error: Exception) -> JSONResponse:
    """Safety net: an unforeseen error must still carry `error.code`.

    Default is PROVIDER_ERROR (retryable): it may well be transient. The message is
    generic; the exception detail goes to the log only.
    """
    logger.exception("Unexpected error: %s", type(error).__name__)
    return _error_response(ErrorCode.PROVIDER_ERROR, "Lỗi nội bộ của dịch vụ AI")


def install_error_handlers(app: FastAPI) -> None:
    """Register the four handlers (spec 4.1) on `app`."""
    app.add_exception_handler(AiError, handle_ai_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(NotImplementedError, handle_not_implemented)
    app.add_exception_handler(Exception, handle_unexpected)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Fail at startup, not on the first request, when the real LLM provider is unusable.

    Mock (the default, and all of pytest) does nothing here. The verified provider is kept on
    `app.state` and shared by every request.
    """
    settings = app.dependency_overrides.get(get_settings, get_settings)()
    real_providers = {
        "gemini": GeminiLLMProvider,
        "claude": ClaudeLLMProvider,
        "claude_code": ClaudeCodeLLMProvider,
    }
    provider_cls = real_providers.get(settings.llm_provider)
    if provider_cls is not None:
        provider = provider_cls(settings)
        await provider.verify_model()
        app.state.llm_provider = provider
        logger.info("%s model check ok: %s", settings.llm_provider, settings.llm_model)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="StoryWeaver AI — inference service",
    version="0.1.0",
    description=(
        "AI content generation service. Stateless: no DB, no Redis, knows nothing "
        "about users or credits. Only Node calls it over the internal network."
    ),
)
install_error_handlers(app)
app.include_router(health.router)
app.include_router(story.router)
app.include_router(images.router)
app.include_router(tts.router)
