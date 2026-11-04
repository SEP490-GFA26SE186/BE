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
def _make_storage(cloudinary: tuple[str, str, str, str] | None = None) -> Storage:
    if cloudinary:
        from app.storage.cloudinary import CloudinaryStorage

        return CloudinaryStorage(*cloudinary)

    from app.storage.local import LocalStorage

    logger.warning(
        "CLOUDINARY_* chua duoc dat — dung LocalStorage. "
        "File se nam trong container va MAT khi container bi xoa."
    )
    return LocalStorage()


def storage_backend_name(settings: Settings) -> str:
    """Backend `get_storage` would pick, without building it (for /health)."""
    return "cloudinary" if _cloudinary_credentials(settings) else "local"


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
    return _make_storage(_cloudinary_credentials(settings))
