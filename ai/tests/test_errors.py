import pytest

from tests.conftest import TOKEN, payload


@pytest.mark.parametrize(
    ("forced", "status", "kind", "retryable"),
    [
        ("blocked", 422, "blocked_content", False),
        ("throttled", 429, "provider_throttled", True),
        ("timeout", 504, "timeout", True),
        ("provider_error", 500, "provider_error", True),
    ],
)
def test_force_kich_dung_nhanh_loi(client, forced, status, kind, retryable):
    """`__force` cho phia Node test tung nhanh retry ma khong can provider that."""
    response = client.post(
        "/v1/generate/story-page", json=payload(__force=forced), headers=TOKEN
    )
    body = response.json()
    assert response.status_code == status
    assert body["errorKind"] == kind
    assert body["retryable"] is retryable
    assert body["status"] == "failed"


def test_force_khong_hop_le_la_invalid_input(client):
    response = client.post(
        "/v1/generate/story-page", json=payload(__force="khong-ton-tai"), headers=TOKEN
    )
    assert response.json()["errorKind"] == "invalid_input"


def test_narration_cung_ap_dung_force(client):
    response = client.post(
        "/v1/generate/narration", json=payload(text="x", __force="blocked"), headers=TOKEN
    )
    assert response.status_code == 422
    assert response.json()["errorKind"] == "blocked_content"
