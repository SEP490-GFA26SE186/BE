import pytest

from app.deps import get_image_provider, get_storage_dep
from app.storage.local import LocalStorage
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}
PNG_SIG = b"\x89PNG\r\n\x1a\n"


@pytest.fixture
def c(client, tmp_path):
    from app.main import app

    app.dependency_overrides[get_storage_dep] = lambda: LocalStorage(str(tmp_path))
    return client


def _portrait(**over):
    body = {
        "request_id": "req1",
        "storage_prefix": "stories/s1/portraits",
        "description": "Một chú gấu nâu",
        "forbidden_terms": ["Nguyễn Văn An"],
    }
    body.update(over)
    return body


def _scene(**over):
    body = {
        "request_id": "req2",
        "storage_prefix": "stories/s1/scenes",
        "scene_description": "Khu rừng buổi sáng",
        "characters": [{"description": "gấu"}],
        "forbidden_terms": ["Nguyễn Văn An"],
    }
    body.update(over)
    return body


def _files(tmp_path):
    return [p for p in tmp_path.rglob("*") if p.is_file()]


def test_portrait_ok(c, tmp_path) -> None:
    r = c.post("/v1/images/portrait", json=_portrait(), headers=H)
    assert r.status_code == 200
    b = r.json()
    assert b["request_id"] == "req1"
    assert b["portrait_keys"] == [
        "stories/s1/portraits/req1-1.png",
        "stories/s1/portraits/req1-2.png",
    ]
    for k in b["portrait_keys"]:
        # Deliberate deviation (spec 9.6): the mock image is PNG, not WebP.
        assert (tmp_path / k).read_bytes().startswith(PNG_SIG)
    assert b["usage"]["units"] == 2
    assert b["usage"]["provider"] == "mock"


def test_scene_with_reference(c, tmp_path) -> None:
    c.post("/v1/images/portrait", json=_portrait(), headers=H)
    r = c.post(
        "/v1/images/scene",
        json=_scene(
            characters=[{"description": "gấu", "portrait_key": "stories/s1/portraits/req1-1.png"}]
        ),
        headers=H,
    )
    assert r.status_code == 200
    b = r.json()
    assert b["image_key"] == "stories/s1/scenes/req2-1.png"
    assert b["reference_used"] is True
    assert (tmp_path / b["image_key"]).read_bytes().startswith(PNG_SIG)


def test_scene_without_reference(c) -> None:
    r = c.post("/v1/images/scene", json=_scene(), headers=H)
    assert r.status_code == 200
    assert r.json()["reference_used"] is False


def test_scene_missing_portrait_key(c, tmp_path) -> None:
    r = c.post(
        "/v1/images/scene",
        json=_scene(characters=[{"description": "gấu", "portrait_key": "no/such.png"}]),
        headers=H,
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert _files(tmp_path) == []


def test_portrait_forbidden_term(c, tmp_path) -> None:
    r = c.post(
        "/v1/images/portrait",
        json=_portrait(description="Bé Nguyễn Văn An đang cười"),
        headers=H,
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "FORBIDDEN_TERM_DETECTED"
    assert _files(tmp_path) == []


@pytest.mark.parametrize(
    "over",
    [
        {"scene_description": "Nguyễn Văn An ở rừng"},
        {"characters": [{"description": "Nguyễn Văn An"}]},
    ],
)
def test_scene_forbidden_term(c, tmp_path, over) -> None:
    r = c.post("/v1/images/scene", json=_scene(**over), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "FORBIDDEN_TERM_DETECTED"
    assert _files(tmp_path) == []


FORCE_CASES = [
    ("SAFETY_BLOCKED", 422, "SAFETY_BLOCKED", False),
    ("PROVIDER_ERROR", 502, "PROVIDER_ERROR", True),
    ("TIMEOUT", 504, "TIMEOUT", True),
    ("OUTPUT_INVALID", 502, "OUTPUT_INVALID", False),
    ("INVALID_OUTPUT_ONCE", 422, "INVALID_INPUT", False),
]


@pytest.mark.parametrize("force,status,code,retryable", FORCE_CASES)
@pytest.mark.parametrize("path", ["portrait", "scene"])
def test_force(c, tmp_path, path, force, status, code, retryable) -> None:
    body = {"__force": force, **(_portrait() if path == "portrait" else _scene())}
    r = c.post(f"/v1/images/{path}", json=body, headers=H)
    assert r.status_code == status
    b = r.json()
    assert b["error"]["code"] == code
    assert b["error"]["retryable"] is retryable
    assert "usage" not in b
    assert _files(tmp_path) == []


def test_force_rejected_when_provider_not_mock(c, tmp_path) -> None:
    from app.main import app

    class Real:
        name = "gemini"
        model = "x"

    app.dependency_overrides[get_image_provider] = lambda: Real()
    r = c.post("/v1/images/portrait", json={"__force": "TIMEOUT", **_portrait()}, headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert _files(tmp_path) == []


def test_requires_token(client) -> None:
    r = client.post("/v1/images/portrait", json=_portrait())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
