import struct

from app.core.text_utils import count_words
from app.providers import raise_forced
from app.schemas.tts import TtsRequest

# Empty WAV: 44-byte header, zero data bytes (PCM, mono, 16 kHz, 16-bit).
_EMPTY_WAV = (
    b"RIFF"
    + struct.pack("<I", 36)
    + b"WAVEfmt "
    + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
    + b"data"
    + struct.pack("<I", 0)
)


def _fake_duration_seconds(text: str) -> float:
    # Fake estimate: ~0.4 s per word, never below 1 s. Not a real speech-rate model.
    return max(1.0, round(count_words(text) * 0.4, 1))


class MockTTSProvider:
    name = "mock"
    model = "mock-tts-v1"

    async def synthesize(self, req: TtsRequest) -> tuple[bytes, float]:
        raise_forced(req.force_)
        return _EMPTY_WAV, _fake_duration_seconds(req.text)
