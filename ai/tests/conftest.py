import os
import socket

import pytest

# Set env BEFORE importing anything from `app` (Settings validates at construction).
os.environ["INTERNAL_TOKEN"] = "test-token"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["TTS_PROVIDER"] = "mock"
os.environ.pop("GEMINI_API_KEY", None)

# Even a stray un-overridden get_settings() must never read ai/.env (it holds the real key).
from app.config import Settings  # noqa: E402

Settings.model_config["env_file"] = None

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


class NetworkBlockedError(RuntimeError):
    """Raised when a test tries to reach a non-loopback address."""


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Forbid all non-loopback network access in tests.

    Loopback is allowed on purpose (spec 3.11.6): on Windows CPython emulates
    `socket.socketpair()` with a TCP connection to 127.0.0.1, and asyncio builds its
    self-pipe with it. Patching the whole `socket.socket` class, or blocking loopback,
    would break the event loop before any test body runs. AF_UNIX sockets are also allowed.
    """
    real_connect = socket.socket.connect
    real_getaddrinfo = socket.getaddrinfo

    def guarded_connect(self: socket.socket, address: object) -> None:
        if self.family == getattr(socket, "AF_UNIX", None):
            return real_connect(self, address)
        if isinstance(address, tuple) and address and address[0] in LOOPBACK_HOSTS:
            return real_connect(self, address)
        raise NetworkBlockedError(f"Network blocked in tests: connect to {address!r}")

    def guarded_getaddrinfo(host: object, *args: object, **kwargs: object):
        if host is None or host in LOOPBACK_HOSTS:
            return real_getaddrinfo(host, *args, **kwargs)
        raise NetworkBlockedError(f"Network blocked in tests: getaddrinfo for {host!r}")

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)


TOKEN = "test-token"


@pytest.fixture
def settings():
    """Settings with the env file disabled: tests must never read ai/.env."""
    from app.config import Settings

    return Settings(
        _env_file=None,
        internal_token=TOKEN,
        llm_provider="mock",
        tts_provider="mock",
    )


@pytest.fixture
def client(settings):
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import app

    app.dependency_overrides[get_settings] = lambda: settings
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()
