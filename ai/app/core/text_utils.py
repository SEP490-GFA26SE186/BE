"""Text helpers shared by validator, token estimate and mocks (spec 6)."""

import re
import unicodedata

# A character token such as {NV1}: counts as one word even though it has letters/digits anyway.
_TOKEN = re.compile(r"\{NV\d+\}")


def count_words(text: str) -> int:
    """Count Vietnamese "tiếng": whitespace-split, standalone punctuation ("—", "...") dropped.

    A piece counts when it has at least one letter/digit or is a `{NVn}` token.
    """
    return sum(
        1 for piece in text.split() if _TOKEN.search(piece) or any(c.isalnum() for c in piece)
    )


# A sentence ends at whitespace that follows ".", "!", "?" or "…", optionally followed by up to
# two closing quotes/brackets ('"Con giận." Mẹ cười.' is two sentences). NOT at ":" (dialogue
# lines such as "{NV1} nói nhỏ: con giận." are one sentence, spec 6). "..." glued together and
# "a...b" never produce an empty sentence. A quote that OPENS the next sentence follows the
# whitespace, so it is not mistaken for a closing one.
_END = "[.!?…]"
_CLOSER = r"[\"”’'»)\]]"
_SENTENCE_BREAK = re.compile(rf"(?:(?<={_END})|(?<={_END}{_CLOSER})|(?<={_END}{_CLOSER}{{2}}))\s+")


def split_sentences(text: str) -> list[str]:
    """Split text into sentences at . ! ? … (spec 6); pieces without a letter/digit are dropped."""
    return [
        piece
        for piece in _SENTENCE_BREAK.split(text.strip())
        if any(c.isalnum() for c in piece)
    ]


def contains_phrase(text: str, phrase: str) -> bool:
    """True if `phrase` occurs in `text` as whole tiếng (a letter/digit may not touch it).

    Case-insensitive, diacritics kept, NFC on both sides. Unlike the real-name guard
    (core/guards.py, case-sensitive) this serves content-moderation lists, where "Giận" at
    the start of a sentence must match "giận". Matching is by word, not by meaning: "tức"
    also hits "tức là" - accepted, the rules using it are WARN.
    """
    if not text or not phrase.strip():
        return False
    needle = unicodedata.normalize("NFC", phrase.strip())
    haystack = unicodedata.normalize("NFC", text)
    # [^\W_] = a letter or digit (\w minus underscore).
    pattern = rf"(?<![^\W_]){re.escape(needle)}(?![^\W_])"
    return re.search(pattern, haystack, re.IGNORECASE) is not None
