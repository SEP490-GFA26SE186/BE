from pathlib import Path

import pytest

from app.core.story import estimate_max_output_tokens, request_max_output_tokens
from app.schemas.story import StoryGenerateRequest
from tests.fixtures.frames import make_frame, make_limits

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "story_request.json"


def _sample() -> StoryGenerateRequest:
    return StoryGenerateRequest.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


@pytest.fixture
def settings(settings):
    # The hand arithmetic below is written for 2.0; the default itself is checked in
    # test_config.py.
    return settings.model_copy(update={"tokens_per_word": 2.0})


def test_sample_by_hand(settings) -> None:
    assert settings.tokens_per_word == 2.0
    assert settings.scene_description_max_words == 30
    # Spec 8.1 table, sample limits: page 70, question 15, option 12, hint 20, feedback 25,
    # max_scenes 4 (scenes counted at their upper bound, limits.max_scenes).
    #   8 pages x 70                           = 560
    #   k1 emotion_self:    15 + 20 + 1        =  36
    #   k2 perspective:     15 + 20 + 3 x 12   =  71
    #   k3 problem_solving: 15 + 3 x (12 + 25) = 126
    #   k4 reflection:      15                 =  15
    #   4 scenes x 30                          = 120
    #   total words                            = 928
    #   928 x 2.0 x 1.3 = 2412.8 -> ceil       = 2413
    assert estimate_max_output_tokens(_sample(), settings) == 2413


def test_longer_frames_need_more(settings) -> None:
    short, medium, long_ = (
        estimate_max_output_tokens(make_frame(n), settings) for n in ("short", "medium", "long")
    )
    assert long_ > medium > short


def test_scene_description_setting_changes_result(settings) -> None:
    base = estimate_max_output_tokens(_sample(), settings)
    bigger = settings.model_copy(update={"scene_description_max_words": 40})
    # 4 scenes x 10 more words x 2.0 x 1.3 = +104
    assert estimate_max_output_tokens(_sample(), bigger) == base + 104


def test_exact_integer_is_not_bumped_by_float_noise(settings) -> None:
    # 1 page x 50 words, 1 scene x 0 words -> 50 x 2.0 x 1.3; in floats that is
    # 130.00000000000003, and a naive ceil would give 131.
    frame = make_frame("custom", pages=1, limits=make_limits(page_max_words=50, max_scenes=1))
    s = settings.model_copy(update={"scene_description_max_words": 0})
    assert estimate_max_output_tokens(frame, s) == 130


def test_request_cap_adds_thinking_budget(settings) -> None:
    assert request_max_output_tokens(2413, settings) == 2413
    s = settings.model_copy(update={"llm_thinking_budget": 1024})
    assert request_max_output_tokens(2413, s) == 2413 + 1024
