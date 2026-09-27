from tests.conftest import TOKEN, payload


def test_health_khong_can_token(client):
    assert client.get("/health").status_code == 200


def test_thieu_token_bi_tu_choi_va_khong_retryable(client):
    response = client.post("/v1/generate/story-page", json=payload())
    body = response.json()
    assert response.status_code == 400
    assert body["errorKind"] == "invalid_input"
    assert body["retryable"] is False


def test_token_sai_bi_tu_choi(client):
    response = client.post(
        "/v1/generate/story-page", json=payload(), headers={"X-Internal-Token": "sai"}
    )
    assert response.json()["errorKind"] == "invalid_input"


def test_token_dung_thi_qua(client):
    response = client.post("/v1/generate/story-page", json=payload(), headers=TOKEN)
    assert response.status_code == 200
