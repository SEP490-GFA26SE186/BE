"""Image profile settings: real profiles need credentials, a commercial license and an explicit
IMAGE_SAFETY=human_review (no classifier exists; docs/01 2026-10-19)."""

import pytest
from pydantic import ValidationError

from app.config import Settings

BASE = {"internal_token": "t"}
CF = {"cloudflare_account_id": "acc", "cloudflare_api_token": "tok"}


def make(**kw):
    return Settings(_env_file=None, **BASE, **kw)


def test_mock_is_default_and_needs_nothing():
    s = make()
    assert (s.image_profile_portrait, s.image_profile_scene) == ("mock", "mock")


def test_real_profile_needs_human_review_credentials_and_both_real():
    real = {"image_profile_portrait": "cf-flux-2-klein-4b", "image_profile_scene": "cf-flux-2-klein-4b"}
    with pytest.raises(ValidationError, match="IMAGE_SAFETY=human_review"):
        make(**real, **CF)
    with pytest.raises(ValidationError, match="CLOUDFLARE_ACCOUNT_ID"):
        make(**real, image_safety="human_review")
    with pytest.raises(ValidationError, match="both be mock or both real"):
        make(image_profile_portrait="mock", image_profile_scene="cf-flux-2-klein-4b", image_safety="human_review", **CF)
    assert make(**real, image_safety="human_review", **CF).image_profile_scene == "cf-flux-2-klein-4b"


def test_unknown_and_non_commercial_profiles_are_rejected():
    with pytest.raises(ValidationError, match="unknown image profile"):
        make(image_profile_portrait="nope", image_profile_scene="nope", image_safety="human_review", **CF)
    with pytest.raises(ValidationError, match="non-commercial"):
        make(image_profile_portrait="cf-flux-2-dev", image_profile_scene="cf-flux-2-dev", image_safety="human_review", **CF)
