from functools import lru_cache

from app.config import get_settings
from app.providers.base import Provider


@lru_cache
def get_provider() -> Provider:
    """Chon provider theo AI_PROVIDER, doc mot lan luc khoi dong."""
    settings = get_settings()
    if settings.ai_provider == "gemini":
        from app.providers.gemini import GeminiProvider

        return GeminiProvider()

    from app.providers.mock import MockProvider

    return MockProvider()
