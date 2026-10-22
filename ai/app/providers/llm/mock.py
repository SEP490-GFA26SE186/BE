"""Frame-aware mock LLM (spec 9.2).

`build_valid_output` is shared with the test fixture `valid_output(frame)` (plan
adjustment 5): one source of truth for "a valid output for any frame". The happy path goes
through the real validator (from M3), so the text here must satisfy every rule: every id,
consecutive scenes within `max_scenes`, every field within `limits` (pages at least
`page_min_words`), sentences within `sentence_max_words`, only declared tokens, and no word
from the emotion lexicon, the preachy phrases or the request's `blocked_keywords`.

Story text is Vietnamese on purpose: it is content, not a log (spec 7.2).
"""

import unicodedata

from app.core.text_utils import contains_phrase
from app.core.validator.analyze_rules import allowed_codes
from app.errors import AiError
from app.providers.llm.base import LLMResult, StoryLLMCall
from app.schemas.analyze import StoryAnalyzeRequest
from app.schemas.common import ForceCode
from app.schemas.llm import LlmAnalyzeOutput, LlmCheckpoint, LlmOption, LlmPage, LlmScene, LlmStoryOutput
from app.schemas.story import CheckpointFrame, CheckpointType, Emotion, StoryGenerateRequest

# Neutral clauses: no emotion word (the answer must not be spelled out on the page, docs/03),
# no preachy phrase. Each page sentence is "<main token> <clause words...>.".
_PAGE_CLAUSES = (
    "đi dạo quanh sân nhà vào buổi chiều có nắng nhẹ",
    "ngồi đọc sách bên cửa sổ cạnh chậu cây xanh",
    "xếp những khối gỗ màu thành một ngôi nhà nhỏ",
    "tưới nước cho luống rau trước hiên cùng mọi người",
    "nhìn đàn chim sẻ nhảy nhót trên cành cây cao",
)
_EMOTION_ANSWER = Emotion.HAPPY
_PERSPECTIVE_ANSWER = "o1"
_TRAILING_PUNCTUATION = ",.;:!?…"


def _key(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip(_TRAILING_PUNCTUATION)).casefold()


class _Writer:
    """Builds text for one frame: fits word limits and drops blocked keyword words."""

    def __init__(self, frame: StoryGenerateRequest) -> None:
        self.limits = frame.limits
        # Any word of a blocked phrase is dropped, so no blocked phrase can appear.
        self._blocked = {
            _key(word) for kw in frame.blocked_keywords for word in kw.keyword.split()
        }

    def words(self, text: str) -> list[str]:
        """Words of `text` minus any word of a blocked keyword."""
        return [w for w in text.split() if _key(w) not in self._blocked]

    def fit(self, text: str, max_words: int, end: str, fallback: str) -> str:
        """One sentence of at most `max_words` (and `sentence_max_words`) words."""
        limit = max(1, min(max_words, self.limits.sentence_max_words))
        words = self.words(text)[:limit] or [fallback]
        return " ".join(words).rstrip(_TRAILING_PUNCTUATION) + end

    def page(self, subject: str, page_index: int) -> str:
        lim = self.limits
        # Midpoint of [min, max]; if the caller sent min > max nothing fits, aim for min.
        target = (
            (lim.page_min_words + lim.page_max_words) // 2
            if lim.page_min_words <= lim.page_max_words
            else lim.page_min_words
        )
        sentences: list[str] = []
        written = 0
        clause_index = page_index
        while written < target:
            clause = self.words(_PAGE_CLAUSES[clause_index % len(_PAGE_CLAUSES)])
            clause_index += 1
            size = min(lim.sentence_max_words, target - written, len(clause) + 1)
            sentences.append(" ".join([subject, *clause[: size - 1]]) + ".")
            written += size
        return " ".join(sentences)


def _scene_index(page_index: int, page_count: int, scene_count: int) -> int:
    # Consecutive, near-equal groups; every scene gets at least one page.
    return page_index * scene_count // page_count


def _checkpoint(cp: CheckpointFrame, main: str, other: str, w: _Writer) -> LlmCheckpoint:
    lim = w.limits
    target = cp.target or main

    def question(text: str) -> str:
        return w.fit(text, lim.question_max_words, "?", main)

    def hint(text: str, subject: str = target) -> str:
        return w.fit(text, lim.hint_max_words, ".", subject)

    def option(text: str) -> str:
        return w.fit(text, lim.option_max_words, "", target)

    def feedback(text: str) -> str:
        return w.fit(text, lim.feedback_max_words, ".", main)

    base = {"checkpoint_id": cp.id, "type": cp.type.value}
    match cp.type:
        case CheckpointType.EMOTION_SELF | CheckpointType.EMOTION_OTHER:
            subject = main if cp.type is CheckpointType.EMOTION_SELF else target
            return LlmCheckpoint(
                **base,
                question=question(f"Con nghĩ {subject} đang cảm thấy thế nào?"),
                # Stay inside the Specialist's allowed list so the mock never trips
                # EMOTION_NOT_ALLOWED.
                answer=(
                    cp.guide.allowed_emotions[0]
                    if cp.guide and cp.guide.allowed_emotions
                    else _EMOTION_ANSWER
                ).value,
                hint=hint(f"Con nhìn kỹ nét mặt của {subject} nhé.", subject),
            )
        case CheckpointType.PERSPECTIVE:
            texts = (
                f"{target} muốn cùng xem cuốn sách",
                f"{target} muốn đi ngủ sớm",
                f"{target} muốn ăn kẹo",
            )
            return LlmCheckpoint(
                **base,
                question=question(f"Vì sao {target} làm như vậy?"),
                answer=_PERSPECTIVE_ANSWER,
                hint=hint(f"Con nhớ lại lúc {target} chạy tới nhé."),
                options=[
                    LlmOption(option_id=f"o{i}", text=option(t))
                    for i, t in enumerate(texts, start=1)
                ],
            )
        case CheckpointType.PROBLEM_SOLVING:
            by_role = (
                ("constructive", f"Nói chậm rãi với {other} điều mình muốn",
                 f"{other} lắng nghe rồi gật đầu với {main}."),
                ("avoidant", "Đi ra góc phòng ngồi một mình",
                 f"{main} ngồi một mình, còn {other} vẫn đứng đó."),
                ("impulsive", "Giật lấy món đồ thật nhanh",
                 "Món đồ rơi xuống sàn kêu cạch một tiếng."),
            )
            return LlmCheckpoint(
                **base,
                question=question(f"Nếu là {main}, con sẽ làm gì?"),
                options=[
                    LlmOption(
                        role=role,
                        text=w.fit(text, lim.option_max_words, "", main),
                        feedback=feedback(fb),
                    )
                    for role, text, fb in by_role
                ],
            )
        case CheckpointType.REFLECTION:
            return LlmCheckpoint(
                **base, question=question(f"Con đã bao giờ gặp chuyện giống {main} chưa?")
            )
    raise AssertionError(f"unhandled checkpoint type {cp.type}")  # pragma: no cover


def build_valid_output(frame: StoryGenerateRequest) -> LlmStoryOutput:
    """A deterministic output that is valid for `frame` (spec 9.2)."""
    w = _Writer(frame)
    main = next(c.token for c in frame.characters if c.is_main)
    other = next((c.token for c in frame.characters if not c.is_main), main)

    page_count = len(frame.pages)
    scene_count = min(frame.limits.max_scenes, page_count)
    scenes = [
        LlmScene(
            scene_id=f"s{n}",
            description=" ".join(
                w.words(f"quiet family home, soft daylight, part {n} of the story")
            ),
        )
        for n in range(1, scene_count + 1)
    ]
    pages = [
        LlmPage(
            page_id=page_id,
            scene_id=f"s{_scene_index(i, page_count, scene_count) + 1}",
            text=w.page(main, i),
        )
        for i, page_id in enumerate(frame.pages)
    ]
    checkpoints = [_checkpoint(cp, main, other, w) for cp in frame.checkpoints]
    return LlmStoryOutput(pages=pages, scenes=scenes, checkpoints=checkpoints)


# A situation with any of these words has a hard moment (family-story spec 5.3).
_MOMENT_WORDS = ("giận", "sợ", "khóc", "buồn")


def _blocked_words(blocked_keywords: list) -> set[str]:
    return {_key(word) for kw in blocked_keywords for word in kw.keyword.split()}


def _short(text: str, max_words: int, blocked: set[str]) -> str:
    words = [w for w in text.split() if _key(w) not in blocked][: max(1, max_words)]
    return " ".join(words).rstrip(_TRAILING_PUNCTUATION)


def build_valid_analysis(req: StoryAnalyzeRequest) -> LlmAnalyzeOutput:
    """A deterministic output that is valid for `req`: a moment when the situation has a
    moment word, else a seed event; the first allowed code (all forced codes when forced)."""
    main = next(c.token for c in req.characters if c.is_main)
    other = next((c.token for c in req.characters if not c.is_main), main)
    blocked = _blocked_words(req.blocked_keywords)
    has_moment = any(contains_phrase(req.situation, w) for w in _MOMENT_WORDS)
    _, allowed = allowed_codes(req, has_moment)
    codes = allowed if req.forced_sub_skills else allowed[:1]
    moment = seed = None
    if has_moment:
        moment = _short(
            f"{main} thấy khó chịu khi chuyện không như ý cùng {other}",
            req.limits.moment_max_words, blocked,
        )
    else:
        seed = _short(
            f"{other} làm rơi món đồ chơi {main} vừa xếp xong",
            req.limits.seed_event_max_words, blocked,
        )
    return LlmAnalyzeOutput(
        moment_summary=moment,
        seed_event=seed,
        sub_skill_codes=codes,
        reasons=["Mock: chọn mã đầu của danh sách được phép."],
    )


def _fake_tokens(text: str) -> int:
    # Deterministic and > 0; roughly 4 characters per token. Not a real tokenizer.
    return max(1, len(text) // 4)


class MockLLMProvider:
    name = "mock"
    model = "mock-v1"

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        force = call.frame.force_
        input_tokens = _fake_tokens("".join(turn.text for turn in call.contents))

        # Messages are Vietnamese on purpose: they go back to Node (spec 7.2).
        if force == ForceCode.SAFETY_BLOCKED:
            # Like Gemini, a blocked response still reports usage (spec 3.11.3).
            raise AiError.safety_blocked(
                "Mock: nội dung bị chặn bởi bộ lọc an toàn.", call_tokens=(input_tokens, 0)
            )
        if force == ForceCode.PROVIDER_ERROR:
            raise AiError.provider_error("Mock: lỗi provider giả lập.")
        if force == ForceCode.TIMEOUT:
            raise AiError.timeout("Mock: provider quá thời gian giả lập.")

        frame = call.frame
        if isinstance(frame, StoryAnalyzeRequest):
            text = build_valid_analysis(frame).model_dump_json()
        else:
            text = build_valid_output(frame).model_dump_json()
        # Which call of the request this is, read from the turns (a retry carries the
        # previous `model` turn), so the instance keeps no state between requests.
        is_first_call = not any(turn.role == "model" for turn in call.contents)
        if force == ForceCode.OUTPUT_INVALID or (
            force == ForceCode.INVALID_OUTPUT_ONCE and is_first_call
        ):
            # "Wrong" output is unparseable text with finish_reason STOP (plan adjustment 4).
            text = text[: len(text) // 2]

        return LLMResult(
            text=text,
            input_tokens=input_tokens,
            output_tokens=_fake_tokens(text),
            finish_reason="STOP",
        )
