from tests.conftest import TOKEN, payload


def test_tra_ve_dung_envelope(client):
    body = client.post("/v1/generate/story-page", json=payload(age=5), headers=TOKEN).json()

    assert body["status"] == "succeeded"
    assert body["provider"] == "mock"
    assert "text" in body["result"]
    assert len(body["result"]["choices"]) == 3
    # `usage` la bat buoc: khong co no Node khong tinh duoc credit.
    assert body["usage"]["inputTokens"] > 0
    assert isinstance(body["latencyMs"], int)


def test_narration_upload_va_tra_audioKey_theo_storagePrefix(client):
    body = client.post(
        "/v1/generate/narration", json=payload(text="ngu ngon nhe"), headers=TOKEN
    ).json()

    # Key phai nam duoi dung storagePrefix ma Node gui — Python khong tu dat duong dan.
    assert body["result"]["audioKey"] == "stories/test/pages/1/narration.wav"
    assert body["result"]["durationMs"] > 0


def test_payload_thieu_truong_bat_buoc_tra_invalid_input_chu_khong_phai_422(client):
    # Quan trong: FastAPI mac dinh tra 422 cho payload sai, nhung 422 trong
    # contract nghia la blocked_content. Handler phai ghi de thanh 400.
    response = client.post("/v1/generate/story-page", json={"jobId": "x"}, headers=TOKEN)
    body = response.json()
    assert response.status_code == 400
    assert body["errorKind"] == "invalid_input"
    assert body["retryable"] is False
