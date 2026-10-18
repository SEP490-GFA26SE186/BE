"""Text clean-up before TTS (spec 4.3).

VieNeu-TTS normalises the text itself: numbers, dates and units become Vietnamese words, emoji
are dropped, sentences are chunked (vieneu_utils.phonemize_text, checked on vieneu 3.8.3:
"3 quả táo, ngày 5/10" -> "ba quả táo, ngày năm tháng mười"). Doing it again here would fight
the library, so this step only removes what must never reach the model and keeps every word
and every punctuation mark that shapes intonation.
"""

import re
import unicodedata

from app.errors import AiError

# Cc (control) and Cf (format: zero-width, bidi marks) - invisible, can derail the tokenizer.
# Line breaks are kept as paragraph boundaries; tabs become spaces.
_KEEP_CONTROL = {"\n"}
_SPACES = re.compile(r"[ \t  -   　]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")


def _visible(ch: str) -> bool:
    return ch in _KEEP_CONTROL or unicodedata.category(ch) not in {"Cc", "Cf", "Co", "Cs"}


def normalize_tts_text(text: str) -> str:
    """NFC, drop control / format / private-use characters, collapse whitespace.

    Raises INVALID_INPUT when nothing readable is left. Spelling, words and punctuation are
    never changed.
    """
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(ch if _visible(ch) else (" " if ch == "\t" else "") for ch in text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
    text = _BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()
    if not any(ch.isalnum() for ch in text):
        raise AiError.invalid_input("Không có chữ nào để đọc.")
    return text
