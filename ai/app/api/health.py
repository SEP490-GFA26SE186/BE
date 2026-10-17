from fastapi import APIRouter

from app.deps import SettingsDep

router = APIRouter(tags=["health"])


@router.get("/health")
@router.get("/ready", include_in_schema=False)
async def health(settings: SettingsDep) -> dict[str, str]:
    """Liveness + active providers. Never calls a provider (no quota use); no token needed."""
    has_supabase = bool(settings.supabase_url and settings.supabase_service_key)
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "image_profile_portrait": settings.image_profile_portrait,
        "image_profile_scene": settings.image_profile_scene,
        "tts_provider": settings.tts_provider,
        "storage_backend": "supabase" if has_supabase else "local",
    }
