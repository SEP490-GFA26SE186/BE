import asyncio
from typing import Any

from app.errors import AiError
from app.providers.base import AudioResult, Provider, TextResult
from app.schemas.envelope import Usage

# Header WAV 44 byte cho file rong — du de chung minh duong upload Storage chay
# that ma khong can engine TTS.
_EMPTY_WAV = (
    b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"
    b"\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
)


def _check_forced_error(payload: dict[str, Any]) -> None:
    """Cho phep Node chu dong kich tung nhanh loi.

    Day la ly do chinh mock provider ton tai. Nho co `__force`, nguoi lam Node
    test duoc nhanh "khong retry, khong tru credit" va nhanh "retry co backoff"
    ngay hom nay — khong can API key Gemini, va khong phai co tinh viet prompt
    ban de choc bo loc noi dung.

    Cho nay CHI hoat dong o mock provider vi no nam trong file nay.
    """
    forced = payload.get("__force")
    if forced is None:
        return
    match forced:
        case "blocked":
            raise AiError.blocked("mock: bi chan boi __force")
        case "throttled":
            raise AiError.throttled("mock: qua tai boi __force")
        case "timeout":
            raise AiError.timeout("mock: timeout boi __force")
        case "provider_error":
            raise AiError.provider_error("mock: loi provider boi __force")
        case _:
            raise AiError.invalid_input(f"__force khong hop le: {forced!r}")


class MockProvider(Provider):
    """Provider mac dinh. Tra du lieu gia nhung DUNG CAU TRUC envelope.

    Nho no, phia Node chay duoc full luong end-to-end (tao job -> queue ->
    worker -> HTTP -> co file tren Storage) truoc khi co bat ky prompt that
    hay API key nao. Khong co mock thi Node bi chan cho AI — dung cai ma viec
    tach source nay can tranh.
    """

    name = "mock"
    model = "mock-v1"

    async def generate_story_page(self, payload: dict[str, Any]) -> TextResult:
        _check_forced_error(payload)
        await asyncio.sleep(0.01)
        return TextResult(
            result={
                "text": "Mock: Bo Gau dung truoc hai con duong trong rung.",
                "choices": [
                    {"key": "A", "text": "Giup ban Tho tim duong ve nha"},
                    {"key": "B", "text": "Di tiep mot minh cho nhanh"},
                    {"key": "C", "text": "Quay lai goi them ban"},
                ],
            },
            usage=Usage(input_tokens=128, output_tokens=96),
        )

    async def synthesize_narration(self, payload: dict[str, Any]) -> AudioResult:
        _check_forced_error(payload)
        await asyncio.sleep(0.01)
        text = str(payload.get("text", ""))
        return AudioResult(
            audio=_EMPTY_WAV,
            extension="wav",
            result={"durationMs": max(len(text) * 60, 1000)},
            usage=Usage(output_units=1, input_tokens=len(text)),
        )
