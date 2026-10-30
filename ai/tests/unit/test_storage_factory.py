from app.config import Settings
from app.storage import get_storage
from app.storage.cloudinary import CloudinaryStorage
from app.storage.local import LocalStorage


def test_get_storage_unwraps_cloudinary_secret() -> None:
    s = Settings(
        _env_file=None,
        internal_token="t",
        cloudinary_cloud_name="c",
        cloudinary_api_key="k",
        cloudinary_api_secret="real-secret-123",
    )
    assert isinstance(get_storage(s), CloudinaryStorage)


def test_get_storage_falls_back_to_local() -> None:
    s = Settings(_env_file=None, internal_token="t")
    assert isinstance(get_storage(s), LocalStorage)
