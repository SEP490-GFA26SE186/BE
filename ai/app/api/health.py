from fastapi import APIRouter

from app.config import get_settings
from app.storage import get_storage

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness. KHONG goi provider — de healthcheck cua Docker khong tieu quota."""
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, object]:
    """Readiness: da du cau hinh de xu ly job that chua?"""
    settings = get_settings()
    storage = get_storage()
    provider_ready = settings.ai_provider == "mock" or bool(settings.gemini_api_key)
    return {
        "status": "ok" if provider_ready else "degraded",
        "provider": settings.ai_provider,
        "providerConfigured": provider_ready,
        "storageBackend": storage.backend,
    }
