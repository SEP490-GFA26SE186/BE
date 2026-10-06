import pytest

from app.deps import get_storage_dep
from app.storage.local import LocalStorage
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}


@pytest.fixture
def c(client, tmp_path):
    from app.main import app

    app.dependency_overrides[get_storage_dep] = lambda: LocalStorage(str(tmp_path))
    return client


def _req(**over):
    body = {
        "request_id": "t1",
        "storage_prefix": "stories/s1/audio",
        "text": "Xin chào các bạn nhỏ",
        "voice_id": "vi-female-1",
    }
    body.update(over)
    return body


def test_tts_ok(c, tmp_path) -> None:
    r = c.post("/v1/tts/synthesize", json=_req(), headers=H)
    assert r.status_code == 200
    b = r.json()
    # Deliberate deviation (spec 9.6): the mock audio is WAV, not AAC.
    assert b["audio_key"] == "stories/s1/audio/t1-1.wav"
    assert b["duration_seconds"] > 0
    data = (tmp_path / b["audio_key"]).read_bytes()
    assert len(data) == 44
    assert data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    assert b["usage"]["provider"] == "mock"
    assert b["usage"]["units"] >= b["duration_seconds"]


def test_tts_real_name_is_allowed(c) -> None:
    # TTS is exempt from the real-name guard (spec 5.6).
    r = c.post("/v1/tts/synthesize", json=_req(text="Nguyễn Văn An đi học"), headers=H)
    assert r.status_code == 200


@pytest.mark.parametrize(
    "force,status,code,retryable",
    [
        ("SAFETY_BLOCKED", 422, "SAFETY_BLOCKED", False),
        ("PROVIDER_ERROR", 502, "PROVIDER_ERROR", True),
        ("TIMEOUT", 504, "TIMEOUT", True),
        ("OUTPUT_INVALID", 502, "OUTPUT_INVALID", False),
        ("INVALID_OUTPUT_ONCE", 422, "INVALID_INPUT", False),
    ],
)
def test_tts_force(c, tmp_path, force, status, code, retryable) -> None:
    r = c.post("/v1/tts/synthesize", json={"__force": force, **_req()}, headers=H)
    assert r.status_code == status
    b = r.json()
    assert b["error"]["code"] == code
    assert b["error"]["retryable"] is retryable
    assert "usage" not in b
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []
