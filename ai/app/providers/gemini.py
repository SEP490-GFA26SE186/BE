from typing import Any

from app.providers.base import AudioResult, Provider, TextResult


class GeminiProvider(Provider):
    """CHUA HIEN THUC — cho cho provider that.

    Khi cam Gemini vao, CHI file nay phai thay doi: endpoint, phan loai loi,
    storage, queue va Docker deu khong biet provider nao dang chay.

    Viec can lam o day:
      - goi Gemini 2.5 Flash cho generate_story_page, doc token usage tu response
      - goi engine TTS cho synthesize_narration
      - map loi cua provider sang AiError: 429 -> throttled, safety block ->
        blocked, het gio -> timeout. Dung de loi provider lot ra nguyen dang,
        vi khi do Node se mac dinh coi la retryable.
    """

    name = "gemini"
    model = "gemini-2.5-flash"

    async def generate_story_page(self, payload: dict[str, Any]) -> TextResult:
        raise NotImplementedError(
            "GeminiProvider chua hien thuc. Dat AI_PROVIDER=mock de chay sườn."
        )

    async def synthesize_narration(self, payload: dict[str, Any]) -> AudioResult:
        raise NotImplementedError(
            "GeminiProvider chua hien thuc. Dat AI_PROVIDER=mock de chay sườn."
        )
