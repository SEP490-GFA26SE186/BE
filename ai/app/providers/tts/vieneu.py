"""VieNeu-TTS v3 Turbo on CPU (spec 4.2). Real model only when TTS_PROVIDER=vieneu.

The model call is split from audio encoding so tests inject both (no model, no numpy):
- `engine`: `resolve(voice) -> preset | None` and `synthesize(text, voice) -> (samples,
  sample_rate)` (`VieneuEngine` wraps the library; heavy, synchronous, CPU-bound).
- `encode`: `(samples, sample_rate, fmt) -> bytes` (`encode_audio`, soundfile, no ffmpeg).

One synthesis at a time (spec 4.5): fp32 on this CPU handles one stream; two at once slow both
down. The lock is held until the model thread really finishes - on timeout the request fails
but the next one still waits for the busy thread instead of running beside it.
"""

import asyncio
import io
import logging
import time
from collections.abc import Callable, Sequence
from typing import Any, Protocol

from app.config import Settings
from app.core.tts_text import normalize_tts_text
from app.errors import AiError
from app.schemas.tts import TtsRequest

logger = logging.getLogger(__name__)

CONTENT_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav"}


class Engine(Protocol):
    model: str

    def resolve(self, voice: str) -> str | None: ...

    def synthesize(self, text: str, voice: str) -> tuple[Sequence[float], int]: ...


class VieneuEngine:
    """The `vieneu` library (extra `.[tts]`). Loading takes ~15 s with the model cached."""

    def __init__(self, precision: str) -> None:
        from vieneu import Vieneu  # imported here: the extra is optional

        self._tts = Vieneu(mode="v3turbo", precision=precision)
        self.model = f"vieneu-v3turbo-{precision}"

    def resolve(self, voice: str) -> str | None:
        # Canonical preset for a name or one of its aliases; None if unknown.
        return self._tts.resolve_voice_name(voice)

    def synthesize(self, text: str, voice: str) -> tuple[Sequence[float], int]:
        return self._tts.infer(text, voice=voice), self._tts.sample_rate


def encode_audio(samples: Any, sample_rate: int, fmt: str) -> bytes:
    """Mono MP3 / WAV via soundfile (libsndfile >= 1.1 writes MP3; no ffmpeg on the dev box)."""
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format=fmt.upper())
    return buf.getvalue()


class VieNeuTTSProvider:
    name = "vieneu"

    def __init__(
        self,
        settings: Settings,
        engine: Engine | None = None,
        encode: Callable[[Any, int, str], bytes] = encode_audio,
    ) -> None:
        self._engine = engine or VieneuEngine(settings.tts_vieneu_precision)
        self._encode = encode
        self._timeout = settings.tts_timeout_seconds
        self.audio_format = settings.tts_audio_format
        self.content_type = CONTENT_TYPES[self.audio_format]
        self.model = self._engine.model
        self._lock = asyncio.Lock()
        self.default_voice = self._resolve_or_fail(settings.tts_default_voice, startup=True)

    def _resolve_or_fail(self, voice: str, *, startup: bool = False) -> str:
        resolved = self._engine.resolve(voice)
        if resolved is None:
            if startup:
                raise RuntimeError(f"TTS_DEFAULT_VOICE '{voice}' is not a VieNeu preset voice")
            # No closest-match guessing (spec 4.1): a wrong voice is a caller bug.
            raise AiError.invalid_input("Giọng đọc không có trong danh sách giọng của hệ thống.")
        return resolved

    async def synthesize(self, req: TtsRequest) -> tuple[bytes, float]:
        voice = self._resolve_or_fail(req.voice_id) if req.voice_id.strip() else self.default_voice
        text = normalize_tts_text(req.text)

        await self._lock.acquire()
        started = time.monotonic()
        job = asyncio.ensure_future(asyncio.to_thread(self._engine.synthesize, text, voice))
        job.add_done_callback(lambda _: self._lock.release())
        try:
            samples, sample_rate = await asyncio.wait_for(asyncio.shield(job), self._timeout)
        except TimeoutError as error:
            raise AiError.timeout(f"Đọc giọng quá {self._timeout:g} giây.") from error
        except Exception as error:  # model failure: transient from the caller's view
            raise AiError.provider_error(f"VieNeu-TTS lỗi khi đọc: {type(error).__name__}") from error

        if len(samples) == 0:
            raise AiError.provider_error("VieNeu-TTS không trả audio.")
        duration = round(len(samples) / sample_rate, 2)
        audio = self._encode(samples, sample_rate, self.audio_format)
        # Never log the text (CLAUDE.md): only sizes, voice and timings.
        logger.info(
            "tts request=%s chars=%d voice=%s synth_s=%.1f audio_s=%.1f",
            req.request_id, len(text), voice, time.monotonic() - started, duration,
        )
        return audio, duration
