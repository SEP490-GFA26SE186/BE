from fastapi import APIRouter

from app.deps import SettingsDep
from app.storage import storage_backend_name

router = APIRouter(tags=["health"])


@router.get("/health")
@router.get("/ready", include_in_schema=False)
async def health(settings: SettingsDep) -> dict[str, str]:
    """Liveness + active providers. Never calls a provider (no quota use); no token needed."""
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "image_profile_portrait": settings.image_profile_portrait,
        "image_profile_scene": settings.image_profile_scene,
        "tts_provider": settings.tts_provider,
        "tts_default_voice": settings.tts_default_voice,
        "storage_backend": storage_backend_name(settings),
    }
