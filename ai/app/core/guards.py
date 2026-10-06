"""Real-name guard (spec 3.1, 6): one layer, request-only, run before any external call.

NFC on both sides, case-sensitive, diacritics kept, Unicode word boundary
(the neighbours of a match must not be a letter or a digit).
"""

import re
import unicodedata
from collections.abc import Iterable, Mapping

from app.errors import AiError


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def find_forbidden_terms(text: str | None, terms: list[str]) -> list[str]:
    """Return the terms (as given) that occur in `text` as whole words."""
    if not text or not terms:
        return []
    haystack = _nfc(text)
    found: list[str] = []
    for term in terms:
        needle = _nfc(term)
        if not needle:
            continue
        # [^\W_] = a letter or digit (\w minus underscore).
        pattern = rf"(?<![^\W_]){re.escape(needle)}(?![^\W_])"
        if re.search(pattern, haystack):
            found.append(term)
    return found


def assert_no_forbidden_terms(
    texts: Iterable[str | None] | Mapping[str, str | None], terms: list[str]
) -> None:
    """Raise FORBIDDEN_TERM_DETECTED if any text holds a term.

    The message names the offending field (mapping key, or 1-based position) and never
    the name itself.
    """
    if not terms:
        return
    items = texts.items() if isinstance(texts, Mapping) else enumerate(texts, start=1)
    for label, text in items:
        if find_forbidden_terms(text, terms):
            # Vietnamese on purpose: returned to Node (spec 7.2).
            raise AiError.forbidden_term(f"Trường '{label}' chứa tên thật bị cấm.")
