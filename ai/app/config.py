from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cau hinh cua ai/.

    Chu y danh sach bien nay CO Y NGHIA VE BIEN: khong he co DATABASE_URL hay
    JWT_SECRET. Service nay khong duoc phep doc DB — xem bang phan quyen env
    trong README o root repo.
    """

    # Token dung chung voi Node. Bat buoc — khong co gia tri mac dinh, de
    # container khong the vo tinh chay o che do khong xac thuc.
    internal_token: str

    ai_provider: Literal["mock", "gemini"] = "mock"
    gemini_api_key: str | None = None

    # Chi can quyen Storage. Neu de trong, storage se dung backend local (xem
    # app/storage/__init__.py) de `docker compose up` van chay duoc truoc khi
    # co credential that.
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    supabase_bucket: str = "story-assets"

    # Node cat o 12s; day cat o 10s de con cho serialize + upload.
    provider_timeout_seconds: float = 10.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
