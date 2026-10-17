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
def _make_storage(
    url: str | None,
    service_key: str | None,
    bucket: str,
    cloudinary: tuple[str, str, str, str] | None = None,
) -> Storage:
    if cloudinary:
        from app.storage.cloudinary import CloudinaryStorage

        return CloudinaryStorage(*cloudinary)

    if url and service_key:
        from app.storage.supabase import SupabaseStorage

        return SupabaseStorage(url, service_key, bucket)

    from app.storage.local import LocalStorage

    logger.warning(
        "CLOUDINARY_* / SUPABASE_URL+SUPABASE_SERVICE_KEY chua duoc dat — dung LocalStorage. "
        "File se nam trong container va MAT khi container bi xoa."
    )
    return LocalStorage()


def storage_backend_name(settings: Settings) -> str:
    """Backend `get_storage` would pick, without building it (for /health)."""
    if _cloudinary_credentials(settings):
        return "cloudinary"
    return "supabase" if settings.supabase_url and settings.supabase_service_key else "local"


def _cloudinary_credentials(settings: Settings) -> tuple[str, str, str, str] | None:
    secret = settings.cloudinary_api_secret
    if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and secret):
        return None
    return (
        settings.cloudinary_cloud_name,
        settings.cloudinary_api_key,
        secret.get_secret_value(),  # SecretStr: unwrap at the boundary
        settings.cloudinary_folder,
    )


def get_storage(settings: Settings) -> Storage:
    """Pick the backend from the credentials in `settings` (cached per credential set)."""
    key = settings.supabase_service_key
    return _make_storage(
        settings.supabase_url,
        key.get_secret_value() if key else None,  # SecretStr: unwrap at the boundary
        settings.supabase_bucket,
        _cloudinary_credentials(settings),
    )
