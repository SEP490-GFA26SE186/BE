"""Non-network parts of scripts/try_story.py --mode pipeline, driven by MockLLMProvider."""

import importlib.util
import json
from pathlib import Path

import pytest

from app.providers.llm.mock import MockLLMProvider
from app.schemas.common import ForceCode

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "try_story.py"
SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "samples" / "story_request.json"


@pytest.fixture(scope="module")
def script():
    spec = importlib.util.spec_from_file_location("try_story_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_pipeline_sample_ok(script, settings, tmp_path) -> None:
    llm = script.RecordingLLM(MockLLMProvider())
    summary = await script._run_pipeline_sample(SAMPLE, llm, settings, tmp_path)
    assert summary["error"] is None
    assert summary["usage"]["attempts"] == 1
    assert [a["issues"] for a in summary["attempts"]] == [[]]
    assert summary["tokens_per_word"] > 0
    story = json.loads((tmp_path / "story_request.response.json").read_text(encoding="utf-8"))
    assert story["pages"]


async def test_pipeline_sample_retry_lists_issues_per_attempt(script, settings, tmp_path) -> None:
    llm = script.RecordingLLM(MockLLMProvider())
    summary = await script._run_pipeline_sample(
        SAMPLE, llm, settings, tmp_path, ForceCode.INVALID_OUTPUT_ONCE
    )
    assert summary["error"] is None
    assert summary["usage"]["attempts"] == 2
    first, second = summary["attempts"]
    assert first["issues"][0]["code"] == "OUTPUT_SCHEMA_INVALID"
    assert second["issues"] == []


async def test_pipeline_sample_error_reports_code_and_usage(script, settings, tmp_path) -> None:
    llm = script.RecordingLLM(MockLLMProvider())
    summary = await script._run_pipeline_sample(
        SAMPLE, llm, settings, tmp_path, ForceCode.OUTPUT_INVALID
    )
    assert summary["error"] == "OUTPUT_INVALID"
    assert summary["usage"]["attempts"] == 2
    assert not list(tmp_path.glob("*.response.json"))


def test_plan_without_confirm_makes_no_call(script, settings, capsys) -> None:
    script._print_plan([SAMPLE], settings, "pipeline")
    out = capsys.readouterr().out
    assert "at most 2" in out and "estimated max cost" in out


async def test_tokens_per_word_excludes_thinking(script, settings, tmp_path) -> None:
    llm = script.RecordingLLM(MockLLMProvider())
    await script._run_pipeline_sample(SAMPLE, llm, settings, tmp_path)
    req = script._load_sample(SAMPLE)
    base = script._describe_attempts(req, llm)[0]
    llm.calls[0]["thoughts_tokens"] = 100  # as the Gemini recorder would set it
    row = script._describe_attempts(req, llm)[0]
    words = base["output_words"]
    assert row["text_output_tokens"] == base["text_output_tokens"] - 100
    assert row["tokens_per_word"] == round((base["text_output_tokens"] - 100) / words, 3)
    assert row["tokens_per_word_raw"] == base["tokens_per_word_raw"]
    assert row["tokens_per_word"] < row["tokens_per_word_raw"]


@pytest.mark.parametrize("provider", ["claude", "claude_code"])
def test_claude_settings_take_model_and_timeout(script, monkeypatch, tmp_path, provider) -> None:
    from argparse import Namespace

    monkeypatch.setattr(script, "AI_DIR", tmp_path)  # never read the real ai/.env
    args = Namespace(provider=provider, model="m-1", thinking_budget=None, timeout=300.0)
    settings = script._build_settings(args)
    assert settings.llm_provider == provider
    assert settings.llm_claude_model == "m-1"
    assert settings.gemini_text_model is None
    assert settings.llm_timeout_seconds == 300.0


@pytest.mark.parametrize(
    ("provider", "cls_name"),
    [("claude", "ClaudeLLMProvider"), ("claude_code", "ClaudeCodeLLMProvider")],
)
def test_build_inner_picks_the_claude_provider(script, provider, cls_name) -> None:
    from app.config import Settings

    settings = Settings(
        _env_file=None, internal_token="t", llm_provider=provider, llm_claude_model="m"
    )
    inner, models_client = script._build_inner(settings)
    assert type(inner).__name__ == cls_name
    assert models_client is None
