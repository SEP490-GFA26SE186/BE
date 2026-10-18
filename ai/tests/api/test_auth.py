from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.deps import InternalAuth
from app.main import install_error_handlers
from tests.conftest import TOKEN


def _protected_client(settings) -> TestClient:
    # No protected route exists on the real app until Task 4+, so mount a probe route.
    probe = FastAPI()
    install_error_handlers(probe)
    probe.dependency_overrides[get_settings] = lambda: settings

    @probe.get("/probe", dependencies=[InternalAuth])
    async def probe_route() -> dict[str, bool]:
        return {"ok": True}

    return TestClient(probe, raise_server_exceptions=False)


def _assert_invalid_input(r) -> None:
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["code"] == "INVALID_INPUT"
    assert body["error"]["retryable"] is False


def test_missing_token(settings) -> None:
    _assert_invalid_input(_protected_client(settings).get("/probe"))


def test_wrong_token(settings) -> None:
    _assert_invalid_input(
        _protected_client(settings).get("/probe", headers={"X-Internal-Token": "nope"})
    )


def test_correct_token(settings) -> None:
    r = _protected_client(settings).get("/probe", headers={"X-Internal-Token": TOKEN})
    assert r.status_code == 200


def test_health_needs_no_token(client) -> None:
    assert client.get("/health").status_code == 200
