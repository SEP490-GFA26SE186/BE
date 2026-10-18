KEYS = {
    "status",
    "llm_provider",
    "llm_model",
    "image_profile_portrait",
    "image_profile_scene",
    "tts_provider",
    "tts_default_voice",
    "storage_backend",
}


def test_health_body(client) -> None:
    body = client.get("/health").json()
    assert set(body) == KEYS
    assert body["status"] == "ok"
    assert body["llm_provider"] == "mock"
    assert body["llm_model"] == "mock-v1"
    assert body["storage_backend"] == "local"


def test_ready_is_alias(client) -> None:
    assert client.get("/ready").json() == client.get("/health").json()
