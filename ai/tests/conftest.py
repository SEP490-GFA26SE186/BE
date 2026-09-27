import os

import pytest

# Dat env TRUOC khi import app (Settings validate luc khoi tao).
os.environ.setdefault("INTERNAL_TOKEN", "test-token")
os.environ.setdefault("AI_PROVIDER", "mock")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

TOKEN = {"X-Internal-Token": "test-token"}


def payload(**input_overrides: object) -> dict[str, object]:
    return {
        "jobId": "ai:story-page:1",
        "idempotencyKey": "sp_test_1",
        "storagePrefix": "stories/test/pages/1",
        "input": dict(input_overrides),
    }


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)
