import pytest

from app.config import Settings
from app.deps import get_storage_dep, get_tts_provider
from app.providers.tts.vieneu import VieNeuTTSProvider
from app.storage.local import LocalStorage
from tests.conftest import TOKEN
from tests.providers.test_tts_vieneu import FakeEngine, fake_encode

H = {"X-Internal-Token": TOKEN}


@pytest.fixture
def c(client, tmp_path):
    from app.main import app

    provider = VieNeuTTSProvider(Settings(tts_provider="vieneu"), FakeEngine(), fake_encode)
    app.dependency_overrides[get_storage_dep] = lambda: LocalStorage(str(tmp_path))
    app.dependency_overrides[get_tts_provider] = lambda: provider
    return client


def _req(**over):
    body = {"request_id": "t1", "storage_prefix": "stories/s1/audio", "text": "Xin chào", "voice_id": ""}
    return {**body, **over}


def test_vieneu_key_is_mp3(c, tmp_path) -> None:
    r = c.post("/v1/tts/synthesize", json=_req(), headers=H)
    assert r.status_code == 200
    b = r.json()
    assert b["audio_key"] == "stories/s1/audio/t1-1.mp3"
    assert (tmp_path / b["audio_key"]).read_bytes() == b"mp3:48000@48000"
    assert b["duration_seconds"] == 1.0
    assert b["usage"]["provider"] == "vieneu"
    assert b["usage"]["units"] == 1
    assert b["usage"]["estimated_cost_micros"] == 0


@pytest.mark.parametrize("over", [{"voice_id": "Giọng Lạ"}, {"text": "  \u200b "}])
def test_vieneu_bad_input_is_422(c, over) -> None:
    r = c.post("/v1/tts/synthesize", json=_req(**over), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert r.json()["error"]["retryable"] is False


def test_force_rejected_on_real_provider(c) -> None:
    r = c.post("/v1/tts/synthesize", json={"__force": "TIMEOUT", **_req()}, headers=H)
    assert r.status_code == 422
