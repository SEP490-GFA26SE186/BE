from typing import Protocol

from app.schemas.tts import TtsRequest


class TTSProvider(Protocol):
    name: str
    model: str
    audio_format: str  # key extension: "mp3" | "wav"
    content_type: str

    async def synthesize(self, req: TtsRequest) -> tuple[bytes, float]:
        """Return (audio bytes, duration in seconds)."""
        ...
