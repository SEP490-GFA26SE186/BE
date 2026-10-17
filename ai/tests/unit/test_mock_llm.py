import json
import re

import pytest

from app.core.text_utils import count_words
from app.errors import AiError, ErrorCode
from app.providers.llm.base import StoryLLMCall, Turn
from app.providers.llm.mock import MockLLMProvider, build_valid_output
from app.schemas.llm import LlmStoryOutput
from app.schemas.story import Emotion, ProblemSolvingRole
from tests.fixtures.frames import make_frame, make_limits
from tests.fixtures.llm_outputs import valid_output

TOKEN_RE = re.compile(r"\{NV\d+\}")

CUSTOM_20 = [
    ("emotion_self", 2),
    ("perspective", 5),
    ("emotion_other", 8),
    ("problem_solving", 11),
    ("perspective", 15),
    ("reflection", 20),
]

# Stand-in until content_rules.yaml exists (Task 9): the spec 7.3 examples.
EMOTION_WORDS = [
    "vui", "thích", "sung sướng", "buồn", "tủi", "giận", "tức", "bực", "cáu", "nổi giận",
    "sợ", "hoảng", "bình thường",
]
PREACHY = ["bài học", "con phải nhớ", "phải biết", "ngoan hơn"]


def _frames():
    return [
        make_frame("short"),
        make_frame("medium"),
        make_frame("long"),
        make_frame("custom", pages=20, checkpoints=CUSTOM_20),
    ]


def _words(text: str) -> int:
    return count_words(text)


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"[.!?…]", text) if s.strip()]


def _plain(text: str) -> str:
    return " " + " ".join(re.sub(r"[.,!?:…]", " ", text.lower()).split()) + " "


def _all_texts(out: LlmStoryOutput) -> list[str]:
    texts = [p.text for p in out.pages] + [s.description for s in out.scenes]
    for c in out.checkpoints:
        texts += [c.question, c.hint or ""]
        for o in c.options:
            texts += [o.text, o.feedback or ""]
    return texts


@pytest.mark.parametrize("frame", _frames(), ids=["short", "medium", "long", "custom20"])
def test_build_valid_output_fits_frame(frame) -> None:
    out = build_valid_output(frame)
    lim = frame.limits

    assert [p.page_id for p in out.pages] == frame.pages
    assert [c.checkpoint_id for c in out.checkpoints] == [c.id for c in frame.checkpoints]
    assert [c.type for c in out.checkpoints] == [c.type.value for c in frame.checkpoints]

    scene_ids = [s.scene_id for s in out.scenes]
    assert 1 <= len(scene_ids) <= lim.max_scenes
    assert len(set(scene_ids)) == len(scene_ids)
    assert all(s.description.strip() for s in out.scenes)
    # Every declared scene is used, and pages are grouped into consecutive runs.
    page_scenes = [p.scene_id for p in out.pages]
    assert set(page_scenes) == set(scene_ids)
    runs = [s for i, s in enumerate(page_scenes) if i == 0 or s != page_scenes[i - 1]]
    assert len(runs) == len(set(runs))

    for p in out.pages:
        assert lim.page_min_words <= _words(p.text) <= lim.page_max_words, p.page_id
        for sentence in _sentences(p.text):
            assert _words(sentence) <= lim.sentence_max_words

    for c in out.checkpoints:
        assert c.question and _words(c.question) <= lim.question_max_words
        if c.type in ("emotion_self", "emotion_other"):
            assert c.answer in {e.value for e in Emotion}
            assert c.hint and _words(c.hint) <= lim.hint_max_words
            assert c.options == []
        elif c.type == "perspective":
            assert [o.option_id for o in c.options] == ["o1", "o2", "o3"]
            assert c.answer in {"o1", "o2", "o3"}
            assert c.hint and _words(c.hint) <= lim.hint_max_words
            for o in c.options:
                assert o.role is None and o.feedback is None
                assert o.text and _words(o.text) <= lim.option_max_words
        elif c.type == "problem_solving":
            assert c.answer is None and c.hint is None
            assert sorted(o.role for o in c.options) == sorted(r.value for r in ProblemSolvingRole)
            for o in c.options:
                assert o.option_id is None
                assert o.text and o.feedback
                assert _words(o.text) <= lim.option_max_words
                assert _words(o.feedback) <= lim.feedback_max_words
        else:
            assert c.type == "reflection"
            assert c.answer is None and c.hint is None and c.options == []

    declared = {ch.token for ch in frame.characters}
    for text in _all_texts(out):
        assert set(TOKEN_RE.findall(text)) <= declared
        plain = _plain(text)
        for word in EMOTION_WORDS + PREACHY:
            assert f" {word} " not in plain, (word, text)


def test_build_valid_output_respects_tight_limits() -> None:
    frame = make_frame(
        "medium",
        limits=make_limits(
            page_min_words=5,
            page_max_words=8,
            page_target_min_words=6,
            page_target_max_words=7,
            sentence_max_words=3,
            question_max_words=2,
            option_max_words=1,
            hint_max_words=1,
            feedback_max_words=2,
            max_scenes=1,
        ),
    )
    out = build_valid_output(frame)
    assert len(out.scenes) == 1
    for p in out.pages:
        assert 5 <= _words(p.text) <= 8
        assert all(_words(s) <= 3 for s in _sentences(p.text))
    for c in out.checkpoints:
        assert 1 <= _words(c.question) <= 2
        for o in c.options:
            assert _words(o.text) == 1
            assert o.feedback is None or 1 <= _words(o.feedback) <= 2


def test_build_valid_output_avoids_blocked_keywords() -> None:
    frame = make_frame(
        "medium",
        blocked_keywords=[
            {"keyword": "nhà", "severity": "block"},
            {"keyword": "chơi", "severity": "warn"},
        ],
    )
    out = build_valid_output(frame)
    for text in _all_texts(out):
        assert " nhà " not in _plain(text) and " chơi " not in _plain(text), text


def test_fixture_is_the_shared_builder() -> None:
    frame = make_frame("long")
    assert valid_output(frame) == build_valid_output(frame)


def _call(frame, contents=None) -> StoryLLMCall:
    return StoryLLMCall(
        frame=frame,
        contents=contents or [Turn(role="user", text="prompt")],
        response_schema=LlmStoryOutput,
        max_output_tokens=1000,
        temperature=None,
    )


def _retry_turns(first_text: str) -> list[Turn]:
    return [Turn("user", "prompt"), Turn("model", first_text), Turn("user", "fix it")]


def _forced(force: str, length: str = "medium"):
    return make_frame(length, **{"__force": force})


async def test_mock_happy_path() -> None:
    llm = MockLLMProvider()
    assert (llm.name, llm.model) == ("mock", "mock-v1")
    frame = make_frame("medium")
    result = await llm.generate_story(_call(frame))
    assert result.finish_reason == "STOP"
    assert result.input_tokens > 0 and result.output_tokens > 0
    assert LlmStoryOutput.model_validate_json(result.text) == build_valid_output(frame)


async def test_mock_tokens_are_deterministic() -> None:
    llm = MockLLMProvider()
    frame = make_frame("medium")
    a = await llm.generate_story(_call(frame))
    b = await llm.generate_story(_call(frame))
    assert (a.input_tokens, a.output_tokens) == (b.input_tokens, b.output_tokens)
    longer = await llm.generate_story(_call(make_frame("long")))
    assert longer.output_tokens > a.output_tokens


async def test_force_safety_blocked_carries_call_tokens() -> None:
    with pytest.raises(AiError) as info:
        await MockLLMProvider().generate_story(_call(_forced("SAFETY_BLOCKED")))
    assert info.value.code == ErrorCode.SAFETY_BLOCKED
    assert info.value.call_tokens is not None
    assert info.value.call_tokens[0] > 0


@pytest.mark.parametrize(
    "force,code", [("PROVIDER_ERROR", ErrorCode.PROVIDER_ERROR), ("TIMEOUT", ErrorCode.TIMEOUT)]
)
async def test_force_provider_errors_without_tokens(force, code) -> None:
    with pytest.raises(AiError) as info:
        await MockLLMProvider().generate_story(_call(_forced(force)))
    assert info.value.code == code
    assert info.value.call_tokens is None


def _unparseable(text: str) -> bool:
    try:
        json.loads(text)
    except ValueError:
        return True
    return False


async def test_force_output_invalid_every_call() -> None:
    frame = _forced("OUTPUT_INVALID")
    llm = MockLLMProvider()
    first = await llm.generate_story(_call(frame))
    second = await llm.generate_story(_call(frame, _retry_turns(first.text)))
    for r in (first, second):
        assert r.finish_reason == "STOP"
        assert _unparseable(r.text)
        assert r.input_tokens > 0 and r.output_tokens > 0


async def test_force_invalid_output_once() -> None:
    frame = _forced("INVALID_OUTPUT_ONCE")
    llm = MockLLMProvider()
    first = await llm.generate_story(_call(frame))
    assert first.finish_reason == "STOP"
    assert _unparseable(first.text)
    # The retry carries a `model` turn: counted from contents, not from instance state.
    second = await llm.generate_story(_call(frame, _retry_turns(first.text)))
    assert LlmStoryOutput.model_validate_json(second.text) == build_valid_output(frame)
    # A fresh first call on the same instance is invalid again (no hidden state).
    again = await llm.generate_story(_call(frame))
    assert _unparseable(again.text)
