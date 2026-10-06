import logging
from functools import lru_cache
from typing import Protocol

from app.config import Settings

logger = logging.getLogger(__name__)


class Storage(Protocol):
    @property
    def backend(self) -> str: ...

    async def upload(self, key: str, data: bytes, content_type: str) -> str: ...

    async def download(self, key: str) -> bytes:
        """Missing key -> AiError.invalid_input; network / 5xx -> PROVIDER_ERROR."""
        ...


def build_key(prefix: str, request_id: str, n: int, ext: str) -> str:
    """Deterministic key (spec 5.6): a re-run of the same job overwrites, never orphans."""
    return f"{prefix.rstrip('/')}/{request_id}-{n}.{ext}"


@lru_cache
def _make_storage(url: str | None, service_key: str | None, bucket: str) -> Storage:
    if url and service_key:
        from app.storage.supabase import SupabaseStorage

        return SupabaseStorage(url, service_key, bucket)

    from app.storage.local import LocalStorage

    logger.warning(
        "SUPABASE_URL/SUPABASE_SERVICE_KEY chua duoc dat — dung LocalStorage. "
        "File se nam trong container va MAT khi container bi xoa."
    )
    return LocalStorage()


def get_storage(settings: Settings) -> Storage:
    """Pick the backend from the credentials in `settings` (cached per credential set)."""
    key = settings.supabase_service_key
    return _make_storage(
        settings.supabase_url,
        key.get_secret_value() if key else None,  # SecretStr: unwrap at the boundary
        settings.supabase_bucket,
    )
