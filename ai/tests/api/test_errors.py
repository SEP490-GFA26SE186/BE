import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.errors import AiError
from app.main import install_error_handlers
from app.schemas.common import Usage

MARKER = "SECRET-MARKER-VALUE"


class Body(BaseModel):
    n: int


@pytest.fixture
def probe() -> TestClient:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/no-usage")
    async def no_usage() -> None:
        raise AiError.output_invalid("bad")

    @app.get("/with-usage")
    async def with_usage() -> None:
        raise AiError.output_invalid(
            "bad", usage=Usage(provider="mock", model=None, latency_ms=5, attempts=2)
        )

    @app.get("/not-impl")
    async def not_impl() -> None:
        raise NotImplementedError("nope")

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("kaboom")

    @app.post("/body")
    async def body(b: Body) -> None:
        return None

    return TestClient(app, raise_server_exceptions=False)


def test_no_usage_key_absent(probe: TestClient) -> None:
    r = probe.get("/no-usage")
    assert r.status_code == 502
    assert set(r.json()) == {"error"}
    assert set(r.json()["error"]) == {"code", "message", "retryable"}


def test_usage_sits_beside_error(probe: TestClient) -> None:
    body = probe.get("/with-usage").json()
    assert set(body) == {"error", "usage"}
    assert set(body["error"]) == {"code", "message", "retryable"}
    assert body["usage"]["attempts"] == 2


def test_not_implemented_is_invalid_input(probe: TestClient) -> None:
    r = probe.get("/not-impl")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"


def test_unexpected_is_retryable_provider_error(probe: TestClient) -> None:
    r = probe.get("/boom")
    assert r.status_code == 502
    err = r.json()["error"]
    assert err["code"] == "PROVIDER_ERROR" and err["retryable"] is True


def test_validation_error_does_not_echo_input(probe: TestClient) -> None:
    r = probe.post("/body", json={"n": MARKER})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_INPUT"
    assert MARKER not in r.text
