import pytest

from app.deps import get_storage_dep
from app.storage.local import LocalStorage
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}


@pytest.fixture
def root(tmp_path):
    r = tmp_path / "root"
    r.mkdir()
    return r


@pytest.fixture
def c(client, root):
    from app.main import app

    app.dependency_overrides[get_storage_dep] = lambda: LocalStorage(str(root))
    return client


def _portrait(prefix="a/b"):
    return {
        "request_id": "r1",
        "storage_prefix": prefix,
        "description": "gấu",
        "forbidden_terms": [],
    }


def _files(root):
    return [p for p in root.rglob("*") if p.is_file()]


@pytest.mark.parametrize("prefix", ["a/../b", "/abs", "a\\b"])
def test_dirty_prefix_rejected(c, root, prefix) -> None:
    r = c.post("/v1/images/portrait", json=_portrait(prefix), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert list(root.iterdir()) == []


def test_portrait_key_traversal_rejected(c, root, tmp_path) -> None:
    (tmp_path / "secret").write_bytes(b"top secret")  # outside the storage root
    body = {
        "request_id": "r2",
        "storage_prefix": "s",
        "scene_description": "x",
        "characters": [{"description": "y", "portrait_key": "../../secret"}],
        "forbidden_terms": [],
    }
    r = c.post("/v1/images/scene", json=body, headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert _files(root) == []
    assert (tmp_path / "secret").read_bytes() == b"top secret"


def test_retry_gives_same_keys_and_files(c, root) -> None:
    r1 = c.post("/v1/images/portrait", json=_portrait(), headers=H).json()
    r2 = c.post("/v1/images/portrait", json=_portrait(), headers=H).json()
    assert r1["portrait_keys"] == r2["portrait_keys"]
    assert len(list((root / "a" / "b").iterdir())) == 2


def test_trailing_slash_prefix(c) -> None:
    r = c.post("/v1/images/portrait", json=_portrait("a/b/"), headers=H)
    assert r.status_code == 200
    for k in r.json()["portrait_keys"]:
        assert "//" not in k


def test_factory_fallback_local() -> None:
    from app.config import Settings
    from app.storage import get_storage

    s = Settings(_env_file=None, internal_token="t")
    assert get_storage(s).backend == "local"
