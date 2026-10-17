from typing import Annotated

from fastapi import Depends, Header, Request

from app.config import Settings, get_settings
from app.errors import AiError
from app.providers.image.base import ImageProvider
from app.providers.image.mock import MockImageProvider
from app.providers.llm.base import LLMProvider
from app.providers.llm.claude import ClaudeLLMProvider
from app.providers.llm.claude_code import ClaudeCodeLLMProvider
from app.providers.llm.gemini import GeminiLLMProvider
from app.providers.llm.mock import MockLLMProvider
from app.providers.tts.base import TTSProvider
from app.providers.tts.mock import MockTTSProvider
from app.schemas.common import ForceCode
from app.storage import Storage, get_storage

SettingsDep = Annotated[Settings, Depends(get_settings)]


async def verify_internal_token(
    settings: SettingsDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Chi Node trong network noi bo duoc goi service nay.

    Khong dung JWT cua user: ai/ khong biet gi ve user. Trong
    docker-compose, container `ai` dung `expose` chu khong `ports`, nen day la
    lop thu hai chu khong phai lop duy nhat.

    That bai tra ve INVALID_INPUT (khong retryable) thay vi mot loai loi tam
    thoi: token sai thi thu lai 3 lan van sai, va do la loi cau hinh.
    """
    if not x_internal_token or x_internal_token != settings.internal_token:
        raise AiError.invalid_input("X-Internal-Token thiếu hoặc không đúng")


InternalAuth = Depends(verify_internal_token)


def get_storage_dep(settings: SettingsDep) -> Storage:
    return get_storage(settings)


def get_image_provider() -> ImageProvider:
    # Only the mock exists until M4.
    return MockImageProvider()


def build_llm_provider(settings: Settings) -> LLMProvider:
    """The real (non-mock) provider named by LLM_PROVIDER."""
    if settings.llm_provider == "claude":
        return ClaudeLLMProvider(settings)
    if settings.llm_provider == "claude_code":
        return ClaudeCodeLLMProvider(settings)
    return GeminiLLMProvider(settings)


def get_llm_provider(request: Request, settings: SettingsDep) -> LLMProvider:
    """One shared real provider per app (kept on `app.state`).

    `lifespan` creates and verifies it. The lazy branch only serves apps run without
    lifespan. The SDK client must live as long as the app: a garbage-collected async
    client closes its shared connection (seen in the Task 8 script), and building one per
    request would also waste connections.
    """
    if settings.llm_provider == "mock":
        return MockLLMProvider()
    state = request.app.state
    provider = getattr(state, "llm_provider", None)
    if provider is None:
        provider = build_llm_provider(settings)
        state.llm_provider = provider
    return provider


def get_tts_provider() -> TTSProvider:
    # Only the mock exists until M5.
    return MockTTSProvider()


def reject_force_unless_mock(force: ForceCode | None, provider_name: str) -> None:
    """`__force` is a test hook of the mock providers (spec 4.3, 3.11.7)."""
    if force is not None and provider_name != "mock":
        raise AiError.invalid_input("__force chỉ dùng được khi provider là mock.")
