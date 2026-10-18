import asyncio
import logging
import threading

import pytest

from app.config import Settings
from app.errors import AiError, ErrorCode
from app.providers.tts.vieneu import VieNeuTTSProvider
from app.schemas.tts import TtsRequest

PRESETS = {"Kim Thanh": "Kim Thanh", "kimthanh": "Kim Thanh", "Hải Đăng": "Hải Đăng"}
SECRET_TEXT = "Bé Nguyễn Văn An đi học"


class FakeEngine:
    model = "fake-vieneu"

    def __init__(self, delay: float = 0.0, fail: bool = False, samples: int = 48_000) -> None:
        self.delay, self.fail, self.samples = delay, fail, samples
        self.calls: list[tuple[str, str]] = []
        self.active = 0
        self.max_active = 0
        self._guard = threading.Lock()

    def resolve(self, voice: str) -> str | None:
        return PRESETS.get(voice)

    def synthesize(self, text: str, voice: str):
        with self._guard:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            threading.Event().wait(self.delay)
            if self.fail:
                raise RuntimeError("onnx exploded")
            self.calls.append((text, voice))
            return [0.0] * self.samples, 48_000
        finally:
            with self._guard:
                self.active -= 1


def fake_encode(samples, sample_rate, fmt):
    return f"{fmt}:{len(samples)}@{sample_rate}".encode()


def _provider(engine: FakeEngine, **settings) -> VieNeuTTSProvider:
    return VieNeuTTSProvider(Settings(tts_provider="vieneu", **settings), engine, fake_encode)


def _req(**over) -> TtsRequest:
    body = {"request_id": "t1", "storage_prefix": "s/a", "text": "Xin chào", "voice_id": "Kim Thanh"}
    return TtsRequest(**{**body, **over})


async def test_synthesize_mp3_and_duration() -> None:
    engine = FakeEngine(samples=96_000)
    p = _provider(engine)
    audio, duration = await p.synthesize(_req(text="  Xin   chào  "))
    assert audio == b"mp3:96000@48000"
    assert duration == 2.0
    assert engine.calls == [("Xin chào", "Kim Thanh")]  # normalised text reaches the model
    assert (p.audio_format, p.content_type) == ("mp3", "audio/mpeg")


async def test_empty_voice_uses_default_and_alias_resolves() -> None:
    engine = FakeEngine()
    p = _provider(engine, tts_default_voice="kimthanh")
    await p.synthesize(_req(voice_id=""))
    await p.synthesize(_req(voice_id="Hải Đăng"))
    assert [v for _, v in engine.calls] == ["Kim Thanh", "Hải Đăng"]


async def test_unknown_voice_is_invalid_input() -> None:
    with pytest.raises(AiError) as ei:
        await _provider(FakeEngine()).synthesize(_req(voice_id="Giọng Lạ"))
    assert ei.value.code == ErrorCode.INVALID_INPUT


def test_unknown_default_voice_fails_startup() -> None:
    with pytest.raises(RuntimeError, match="TTS_DEFAULT_VOICE"):
        _provider(FakeEngine(), tts_default_voice="Không Có")


async def test_model_error_is_retryable_provider_error() -> None:
    with pytest.raises(AiError) as ei:
        await _provider(FakeEngine(fail=True)).synthesize(_req())
    assert ei.value.code == ErrorCode.PROVIDER_ERROR


async def test_empty_audio_is_provider_error() -> None:
    with pytest.raises(AiError) as ei:
        await _provider(FakeEngine(samples=0)).synthesize(_req())
    assert ei.value.code == ErrorCode.PROVIDER_ERROR


async def test_one_synthesis_at_a_time() -> None:
    engine = FakeEngine(delay=0.05)
    p = _provider(engine)
    await asyncio.gather(*(p.synthesize(_req(request_id=f"r{i}")) for i in range(4)))
    assert engine.max_active == 1
    assert len(engine.calls) == 4


async def test_timeout_keeps_lock_until_thread_finishes() -> None:
    engine = FakeEngine(delay=0.3)
    p = _provider(engine, tts_timeout_seconds=0.05)
    with pytest.raises(AiError) as ei:
        await p.synthesize(_req(request_id="slow"))
    assert ei.value.code == ErrorCode.TIMEOUT
    # The timed-out thread is still running: the next call must wait, never run beside it.
    second = asyncio.create_task(_provider_call(p))
    await asyncio.sleep(0.1)
    assert engine.max_active == 1 and not second.done()
    p._timeout = 5
    await second
    assert engine.max_active == 1


async def _provider_call(p: VieNeuTTSProvider) -> None:
    p._timeout = 5
    await p.synthesize(_req(request_id="next"))


async def test_text_is_never_logged(caplog) -> None:
    caplog.set_level(logging.DEBUG)
    await _provider(FakeEngine()).synthesize(_req(text=SECRET_TEXT))
    assert "Nguyễn" not in caplog.text
    assert "request=t1" in caplog.text
