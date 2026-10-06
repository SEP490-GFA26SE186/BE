from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration of ai/ (spec 4.4).

    The variable list is deliberate: there is no DATABASE_URL, REDIS_URL or JWT_SECRET.
    This service must never read the DB (see the env permission table in the root README).
    """

    # Shared with Node. Required, no default, so a container cannot silently run unauthenticated.
    internal_token: str

    llm_provider: Literal["mock", "gemini"] = "mock"
    tts_provider: Literal["mock"] = "mock"

    gemini_api_key: SecretStr | None = None
    gemini_text_model: str | None = None

    llm_timeout_seconds: float = 45
    llm_temperature: float | None = None  # empty env value = SDK default
    # Empty = not sent (model default). Gemini 3 docs strongly advise keeping the default 1.0;
    # set a value only for a model where a lower retry temperature is known to help (docs/01).
    llm_retry_temperature: float | None = None
    llm_thinking_budget: int = Field(default=0, ge=0)
    llm_truncation_retry_factor: float = Field(default=1.5, gt=1)
    # Measured on gemini-3.8-flash (Task 8 spike): 2.557 x ~1.1 margin, see docs/01.
    tokens_per_word: float = Field(default=2.8, gt=0)
    scene_description_max_words: int = 30

    # Reported by /health only; the real profile is chosen in M4b.
    image_profile_portrait: str = "mock"
    image_profile_scene: str = "mock"

    # Empty = LocalStorage (see app/storage/__init__.py).
    supabase_url: str | None = None
    supabase_service_key: SecretStr | None = None
    supabase_bucket: str = "story-assets"

    price_text_input_per_mtok_micros: int = 0
    price_text_output_per_mtok_micros: int = 0

    log_level: str = "INFO"

    # hide_input_in_errors: a model-level validation error would otherwise print the whole
    # input dict, including GEMINI_API_KEY.
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", env_ignore_empty=True, hide_input_in_errors=True
    )

    @model_validator(mode="after")
    def _gemini_needs_key_and_model(self) -> Self:
        if self.llm_provider == "gemini":
            missing = [
                name
                for name, value in (
                    ("GEMINI_API_KEY", self.gemini_api_key),
                    ("GEMINI_TEXT_MODEL", self.gemini_text_model),
                )
                if not value
            ]
            if missing:
                raise ValueError(f"LLM_PROVIDER=gemini requires: {', '.join(missing)}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
