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

    # claude = Anthropic API (key or `ant auth login` profile); claude_code = the logged-in
    # `claude` CLI driven by claude-agent-sdk, DEV ONLY (README "Claude").
    llm_provider: Literal["mock", "gemini", "claude", "claude_code"] = "mock"
    tts_provider: Literal["mock", "vieneu"] = "mock"
    # vieneu (spec 4.4). Node always sends voice_id (platform_settings tts.voice); the default
    # only serves manual calls and scripts. Must be a preset name or alias - checked at startup.
    tts_default_voice: str = "Kim Thanh"
    # int8 is ~3x faster but the library warns of distortion on CPUs without VNNI (5500U).
    tts_vieneu_precision: Literal["fp32", "int8"] = "fp32"
    # 51-word page: 17.4 s on the 5500U natively (spike), 31-38 s inside Docker Desktop (WSL2 VM,
    # measured 2026-10-18; thread count and onnxruntime 1.30 vs 1.31 made no difference). A 70-word
    # page ~45 s in Docker -> 120 s. Node's AI_TIMEOUT_MS_NARRATION must stay above this.
    tts_timeout_seconds: float = Field(default=120, gt=0)
    tts_audio_format: Literal["mp3", "wav"] = "mp3"

    gemini_api_key: SecretStr | None = None
    gemini_text_model: str | None = None

    # Optional: empty = the SDK's own credential chain (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
    # in the process env, then the active `ant auth login` profile). Unused by claude_code.
    anthropic_api_key: SecretStr | None = None
    # API model id for claude; a model id or CLI alias ("sonnet") for claude_code.
    llm_claude_model: str | None = None
    # Empty = not sent (model default). Each model accepts a different subset (docs/01).
    llm_claude_thinking: Literal["disabled", "adaptive", "between_tools"] | None = None
    llm_claude_effort: Literal["low", "medium", "high", "xhigh", "max"] | None = None
    # claude_code only: empty = the SDK looks for `claude` itself (bundled, then PATH).
    llm_claude_cli_path: str | None = None

    # 20-page story 90.5 s per call on Claude via the CLI, thinking on (docs/01, 2026-10-16) -
    # a temporary safety margin until the API with thinking off is measured. Node's
    # AI_TIMEOUT_MS_STORY_TEXT (320 s) must stay > 2 x this + overhead (README, §3.8).
    llm_timeout_seconds: float = 150
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

    # Storage backend by credentials (app/storage/__init__.py): Cloudinary if all three
    # CLOUDINARY_* are set, else Supabase, else LocalStorage.
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: SecretStr | None = None
    cloudinary_folder: str = "storyweaver"
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

    @model_validator(mode="after")
    def _claude_rules(self) -> Self:
        if self.llm_provider not in ("claude", "claude_code"):
            return self
        provider = f"LLM_PROVIDER={self.llm_provider}"
        if not self.llm_claude_model:
            raise ValueError(f"{provider} requires: LLM_CLAUDE_MODEL")
        # Current Claude models reject non-default sampling and anthropic 1.x dropped the
        # argument; failing here beats a 400 on the first story.
        sampling = [
            name
            for name, value in (
                ("LLM_TEMPERATURE", self.llm_temperature),
                ("LLM_RETRY_TEMPERATURE", self.llm_retry_temperature),
            )
            if value is not None
        ]
        if sampling:
            raise ValueError(f"{provider} does not support: {', '.join(sampling)} (leave empty)")
        if self.llm_provider == "claude_code" and self.llm_claude_thinking == "between_tools":
            raise ValueError(
                "LLM_PROVIDER=claude_code: LLM_CLAUDE_THINKING=between_tools is API-only"
            )
        return self

    @property
    def llm_model(self) -> str:
        """Model of the active LLM provider, as /health and the scripts report it."""
        if self.llm_provider == "gemini":
            return self.gemini_text_model or ""
        if self.llm_provider in ("claude", "claude_code"):
            return self.llm_claude_model or ""
        return "mock-v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
