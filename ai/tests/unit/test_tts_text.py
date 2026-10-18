import pytest

from app.core.tts_text import normalize_tts_text
from app.errors import AiError, ErrorCode


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Words, numbers and punctuation pass through: VieNeu reads numbers itself.
        ('An hét lên: "Của anh!" Rồi An ném 3 con khủng long…', 'An hét lên: "Của anh!" Rồi An ném 3 con khủng long…'),
        ("  Bin   khóc\tto.  ", "Bin khóc to."),
        ("Bin\u200b khóc\u00a0to", "Bin khóc to"),  # zero-width + no-break space
        ("Dòng một.\r\n\r\n\r\nDòng hai.", "Dòng một.\n\nDòng hai."),  # paragraphs kept, one gap
        ("A\x07n\x00 vui", "An vui"),  # control characters dropped
    ],
)
def test_normalize_keeps_words_and_punctuation(raw: str, expected: str) -> None:
    assert normalize_tts_text(raw) == expected


def test_normalize_composes_nfc() -> None:
    decomposed = "Bi\u0300n"  # 'i' + combining grave
    assert normalize_tts_text(decomposed) == "Bìn"


@pytest.mark.parametrize("raw", ["", "   ", "\u200b\n\t", "!!! …"])
def test_normalize_rejects_nothing_to_read(raw: str) -> None:
    with pytest.raises(AiError) as ei:
        normalize_tts_text(raw)
    assert ei.value.code == ErrorCode.INVALID_INPUT
