from app.config import Settings
from app.storage import get_storage
from app.storage.local import LocalStorage
from app.storage.supabase import SupabaseStorage


def test_get_storage_unwraps_supabase_secret() -> None:
    s = Settings(
        _env_file=None,
        internal_token="t",
        supabase_url="https://x.supabase.co",
        supabase_service_key="real-key-123",
        supabase_bucket="b",
    )
    storage = get_storage(s)
    assert isinstance(storage, SupabaseStorage)
    assert storage._key == "real-key-123"


def test_get_storage_falls_back_to_local() -> None:
    s = Settings(_env_file=None, internal_token="t")
    assert isinstance(get_storage(s), LocalStorage)
