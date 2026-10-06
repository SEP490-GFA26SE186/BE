from typing import Protocol

from app.schemas.tts import TtsRequest


class TTSProvider(Protocol):
    name: str
    model: str

    async def synthesize(self, req: TtsRequest) -> tuple[bytes, float]:
        """Return (audio bytes, duration in seconds)."""
        ...
