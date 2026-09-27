import logging
from functools import lru_cache
from typing import Protocol

from app.config import get_settings

logger = logging.getLogger(__name__)


class Storage(Protocol):
    @property
    def backend(self) -> str: ...

    async def upload(self, key: str, data: bytes, content_type: str) -> str: ...


@lru_cache
def get_storage() -> Storage:
    """Chon backend Storage theo credential co san."""
    settings = get_settings()
    if settings.supabase_url and settings.supabase_service_key:
        from app.storage.supabase import SupabaseStorage

        return SupabaseStorage(
            settings.supabase_url, settings.supabase_service_key, settings.supabase_bucket
        )

    from app.storage.local import LocalStorage

    logger.warning(
        "SUPABASE_URL/SUPABASE_SERVICE_KEY chua duoc dat — dung LocalStorage. "
        "File se nam trong container va MAT khi container bi xoa."
    )
    return LocalStorage()
