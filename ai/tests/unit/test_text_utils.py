import pytest

from app.core.text_utils import contains_phrase, count_words, split_sentences


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("brừm brừm.", 2),
        ("{NV1},", 1),
        ("—", 0),
        ("...", 0),
        ("{NV1} nói nhỏ: con giận.", 5),
        ("a   b\n\nc\t\td", 4),
        ("  \n ", 0),
        ("", 0),
        ("(vui)", 1),
        ("Nhưng — rồi ... qua", 3),
    ],
)
def test_count_words(text: str, expected: int) -> None:
    assert count_words(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Một. Hai! Ba? Bốn… Năm", ["Một.", "Hai!", "Ba?", "Bốn…", "Năm"]),
        (
            "{NV1} nói nhỏ: con giận vì em lấy xe của con. Em im lặng.",
            ["{NV1} nói nhỏ: con giận vì em lấy xe của con.", "Em im lặng."],
        ),
        ("Rồi... sau đó. Hết", ["Rồi...", "sau đó.", "Hết"]),
        ("... ... Xong.", ["Xong."]),
        ("Câu cuối không có dấu", ["Câu cuối không có dấu"]),
        ("  Hai   dòng.\n\nTiếp theo!  ", ["Hai   dòng.", "Tiếp theo!"]),
        ("", []),
        ("   ", []),
    ],
)
def test_split_sentences(text: str, expected: list[str]) -> None:
    assert split_sentences(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ('"Con giận." Mẹ cười.', ['"Con giận."', "Mẹ cười."]),
        ("“Con giận.” Mẹ cười.", ["“Con giận.”", "Mẹ cười."]),
        ("Mẹ hỏi: “Sao thế?” Bé im.", ["Mẹ hỏi: “Sao thế?”", "Bé im."]),
        ("Bé nói (khẽ.) Rồi đi.", ["Bé nói (khẽ.)", "Rồi đi."]),
        ('Nó la lên "Ôi!"" Hết.', ['Nó la lên "Ôi!""', "Hết."]),
        # A quote that opens the next sentence stays with it; ":" still never splits.
        ('Mẹ nói. "Con giận: thật." Hết', ["Mẹ nói.", '"Con giận: thật."', "Hết"]),
        ('Bé nói "giận" rồi đi.', ['Bé nói "giận" rồi đi.']),
    ],
)
def test_split_sentences_closing_quote(text: str, expected: list[str]) -> None:
    assert split_sentences(text) == expected


def test_contains_phrase_whole_tieng_case_insensitive() -> None:
    assert contains_phrase("Bé GIẬN quá.", "giận")
    assert contains_phrase("bé rất vui vẻ", "vui vẻ")  # multi-word phrase
    assert not contains_phrase("bé rất vui", "vui vẻ")
    assert not contains_phrase("bé giận dữ", "giận dữ quá")
    assert not contains_phrase("bé nổi giận", "giản")  # no diacritic folding
    assert not contains_phrase("bé giậnn", "giận")  # no partial word
    assert contains_phrase("“giận”", "giận")  # punctuation is a boundary
    assert contains_phrase("tức là bé buồn", "tức")  # whole tieng, so "tức" hits "tức là"
    assert not contains_phrase("", "giận")
    assert not contains_phrase("giận", "")


def test_contains_phrase_nfc() -> None:
    import unicodedata

    nfd = unicodedata.normalize("NFD", "Bé giận")
    assert contains_phrase(nfd, "giận")
    assert contains_phrase("Bé giận", unicodedata.normalize("NFD", "giận"))
