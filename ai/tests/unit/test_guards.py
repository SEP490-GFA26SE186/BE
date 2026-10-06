import unicodedata

import pytest

from app.core.guards import assert_no_forbidden_terms, find_forbidden_terms
from app.errors import AiError, ErrorCode


@pytest.mark.parametrize("text", ["An đi học.", "An,", "{NV1} gọi An."])
def test_matches_on_word_boundary(text: str) -> None:
    assert find_forbidden_terms(text, ["An"]) == ["An"]


@pytest.mark.parametrize("text", ["an toàn", "Ân", "Anh"])
def test_does_not_match_other_words(text: str) -> None:
    assert find_forbidden_terms(text, ["An"]) == []


def test_case_sensitive() -> None:
    assert find_forbidden_terms("anh", ["Anh"]) == []
    assert find_forbidden_terms("Anh", ["Anh"]) == ["Anh"]


def test_nfd_text_matches_nfc_term_and_back() -> None:
    nfc = unicodedata.normalize("NFC", "Đức")
    nfd = unicodedata.normalize("NFD", "Đức")
    assert nfc != nfd
    assert find_forbidden_terms(f"{nfd} đi học", [nfc]) == [nfc]
    assert find_forbidden_terms(f"{nfc} đi học", [nfd]) == [nfd]


def test_regex_special_characters_are_escaped() -> None:
    assert find_forbidden_terms("gọi (An+ đi", ["(An+"]) == ["(An+"]
    assert find_forbidden_terms("a.b", ["a.b"]) == ["a.b"]
    assert find_forbidden_terms("axb", ["a.b"]) == []
    assert find_forbidden_terms("x", ["[", "*", "\\"]) == []


def test_none_and_empty_text_do_not_match() -> None:
    assert find_forbidden_terms(None, ["An"]) == []
    assert find_forbidden_terms("", ["An"]) == []


def test_empty_terms_never_raise() -> None:
    assert find_forbidden_terms("An đi học", []) == []
    assert_no_forbidden_terms(["An đi học"], [])
    assert_no_forbidden_terms(["An đi học"], [""])


def test_assert_raises_without_leaking_the_name() -> None:
    with pytest.raises(AiError) as exc:
        assert_no_forbidden_terms(["Trời đẹp", "Bé Tuấn Kiệt đi học"], ["Tuấn Kiệt"])
    assert exc.value.code == ErrorCode.FORBIDDEN_TERM_DETECTED
    assert "Tuấn" not in exc.value.message
    assert "Kiệt" not in exc.value.message


def test_assert_names_the_field_for_a_mapping() -> None:
    with pytest.raises(AiError) as exc:
        assert_no_forbidden_terms({"situation": "Bé Mít khóc", "description": None}, ["Mít"])
    assert "situation" in exc.value.message
    assert "Mít" not in exc.value.message


def test_assert_passes_on_clean_text() -> None:
    assert_no_forbidden_terms(["an toàn là trên hết", None, ""], ["An"])
