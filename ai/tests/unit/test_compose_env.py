"""The `ai` block of BE/docker-compose.yml must pass only variables Settings reads (Task 16).

Catches drift such as a renamed variable (`AI_PROVIDER` -> `LLM_PROVIDER`) left in compose,
and the architecture invariant: no DATABASE_URL / REDIS_URL / JWT_SECRET for this service.
"""

from pathlib import Path

import pytest
import yaml

from app.config import Settings

COMPOSE = Path(__file__).resolve().parents[3] / "docker-compose.yml"

pytestmark = pytest.mark.skipif(not COMPOSE.is_file(), reason="BE/docker-compose.yml not present")


def _ai_env() -> set[str]:
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    return set(compose["services"]["ai"]["environment"])


#: Read by a child process, not by Settings: the `claude` CLI that claude_code drives
#: (README "Claude").
CHILD_PROCESS_ENV = {"CLAUDE_CODE_OAUTH_TOKEN"}


def test_ai_block_only_passes_variables_settings_reads() -> None:
    known = {name.upper() for name in Settings.model_fields} | CHILD_PROCESS_ENV
    assert _ai_env() - known == set()


def test_ai_block_has_no_db_redis_or_jwt() -> None:
    assert _ai_env() & {"DATABASE_URL", "DIRECT_URL", "REDIS_URL", "JWT_SECRET"} == set()


def test_ai_block_selects_text_and_tts_providers() -> None:
    assert {"INTERNAL_TOKEN", "LLM_PROVIDER", "TTS_PROVIDER", "GEMINI_TEXT_MODEL"} <= _ai_env()
