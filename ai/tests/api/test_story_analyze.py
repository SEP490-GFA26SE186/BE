"""POST /v1/story/analyze and the family block of /v1/story/generate (family-story spec A.2)."""

import json
from pathlib import Path

import pytest

from app.core.validator.analyze_rules import validate_analysis
from app.schemas.analyze import StoryAnalyzeRequest
from app.schemas.llm import LlmAnalyzeOutput
from tests.conftest import TOKEN

H = {"X-Internal-Token": TOKEN}
URL = "/v1/story/analyze"
SAMPLES = Path(__file__).resolve().parents[2] / "docs" / "samples"


def _body(**over):
    body = json.loads((SAMPLES / "story_analyze_request.json").read_text(encoding="utf-8"))
    body.update(over)
    return body


def test_mock_moment_picks_first_catalog_code(client) -> None:
    r = client.post(URL, json=_body(), headers=H)
    assert r.status_code == 200, r.text
    b = r.json()
    assert set(b) == {"request_id", "moment_summary", "seed_event", "sub_skill_codes",
                      "reasons", "usage", "provider", "model"}
    assert b["moment_summary"] and b["seed_event"] is None
    assert b["sub_skill_codes"] == ["SM_CALM"]
    assert b["provider"] == "mock" and b["usage"]["attempts"] == 1


def test_mock_without_moment_seeds_first_need(client) -> None:
    r = client.post(URL, json=_body(situation="{NV1} và {NV2} cùng xếp lego ở phòng khách."),
                    headers=H)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["moment_summary"] is None and b["seed_event"]
    assert b["sub_skill_codes"] == ["SA_EMPATHY"]


def test_mock_honors_forced_sub_skills(client) -> None:
    r = client.post(URL, json=_body(forced_sub_skills=["RS_SHARE", "SM_CALM"]), headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["sub_skill_codes"] == ["RS_SHARE", "SM_CALM"]


def test_force_invalid_output_once_retries(client) -> None:
    r = client.post(URL, json=_body(__force="INVALID_OUTPUT_ONCE"), headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["usage"]["attempts"] == 2


def test_force_output_invalid(client) -> None:
    r = client.post(URL, json=_body(__force="OUTPUT_INVALID"), headers=H)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "OUTPUT_INVALID"


def test_request_rejects_need_outside_catalog(client) -> None:
    r = client.post(URL, json=_body(needs=["NOPE"]), headers=H)
    assert r.status_code == 422
    assert "NOPE" in r.json()["error"]["message"]


def test_forbidden_term_in_situation(client) -> None:
    r = client.post(URL, json=_body(situation="Bin giận vì em làm đổ tháp lego."), headers=H)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "FORBIDDEN_TERM_DETECTED"


def _req(**over) -> StoryAnalyzeRequest:
    return StoryAnalyzeRequest.model_validate(_body(**over))


def _codes(issues) -> list[str]:
    return [i.code for i in issues]


def test_validator_rejects_code_outside_list() -> None:
    req = _req()
    # A moment picks from the catalog; no moment picks from needs only.
    out = LlmAnalyzeOutput(moment_summary="{NV1} giận em", sub_skill_codes=["XX"])
    assert _codes(validate_analysis(req, out)) == ["ANALYZE_CODE_NOT_ALLOWED"]
    out = LlmAnalyzeOutput(seed_event="{NV2} làm rơi xe", sub_skill_codes=["SM_CALM"])
    assert _codes(validate_analysis(req, out)) == ["ANALYZE_CODE_NOT_ALLOWED"]
    forced = _req(forced_sub_skills=["RS_SHARE"])
    out = LlmAnalyzeOutput(moment_summary="{NV1} giận em", sub_skill_codes=["SM_CALM"])
    assert _codes(validate_analysis(forced, out)) == ["ANALYZE_CODE_NOT_ALLOWED"]


@pytest.mark.parametrize(
    ("moment", "seed"), [("{NV1} giận em", "{NV2} làm rơi xe"), (None, None)]
)
def test_validator_needs_exactly_one_of_moment_and_seed(moment, seed) -> None:
    out = LlmAnalyzeOutput(moment_summary=moment, seed_event=seed, sub_skill_codes=["SM_CALM"])
    assert "ANALYZE_MOMENT_SEED_INVALID" in _codes(validate_analysis(_req(), out))


def test_validator_length_tokens_and_count() -> None:
    req = _req(limits={"moment_max_words": 3, "seed_event_max_words": 30})
    out = LlmAnalyzeOutput(
        moment_summary="{NV1} giận {NV9} vì tháp đổ",
        sub_skill_codes=["SM_CALM", "SA_EMPATHY", "RS_SHARE"],
    )
    codes = _codes(validate_analysis(req, out))
    assert {"ANALYZE_TEXT_TOO_LONG", "UNKNOWN_CHARACTER_TOKEN", "ANALYZE_CODE_COUNT"} <= set(codes)


# ---- /v1/story/generate with a family block ----

GENERATE = "/v1/story/generate"


def _family_body(**over):
    body = json.loads((SAMPLES / "story_request.json").read_text(encoding="utf-8"))
    body["topic"] = None
    body["age_min"] = body["age_max"] = 6
    body["family"] = {
        "moment": "{NV1} giận khi {NV2} làm đổ tháp lego",
        "seed_event": None,
        "anchor_page": body["checkpoints"][1]["after"],
        "sub_skills": [{"name": "Bình tĩnh lại", "description": "Trẻ hạ nhiệt khi giận."}],
    }
    body.update(over)
    return body


def test_generate_family_ok(client) -> None:
    r = client.post(GENERATE, json=_family_body(), headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["prompt_version"] == "story.v3"


def test_generate_family_prompt_sections(settings) -> None:
    from app.core.prompt import render_story_prompt
    from app.schemas.story import StoryGenerateRequest

    req = StoryGenerateRequest.model_validate(_family_body())
    prompt = render_story_prompt(req, settings)
    anchor = req.family.anchor_page
    assert f"Trang {anchor} (ngay trước điểm dừng {req.checkpoints[1].id})" in prompt
    assert "Khoảnh khắc chính" in prompt and "Tình tiết thêm" not in prompt
    assert "Luật ưu tiên" in prompt and "trẻ 6 tuổi" in prompt
    assert "Bài học:" not in prompt
    assert "$" not in prompt


@pytest.mark.parametrize(
    "over",
    [
        {"topic": None, "family": None},  # neither
        {"topic": {"title": "x", "competency": "self_management", "guidance": "y"}},  # both
    ],
)
def test_generate_needs_exactly_one_of_topic_and_family(client, over) -> None:
    body = _family_body() if "family" not in over else _family_body(**over)
    if "family" not in over:
        body.update(over)
    r = client.post(GENERATE, json=body, headers=H)
    assert r.status_code == 422
    assert "topic hoặc family" in r.json()["error"]["message"]


def test_generate_anchor_page_must_be_a_page(client) -> None:
    body = _family_body()
    body["family"]["anchor_page"] = "p99"
    r = client.post(GENERATE, json=body, headers=H)
    assert r.status_code == 422
    assert "anchor_page" in r.json()["error"]["message"]
