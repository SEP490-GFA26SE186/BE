"""Spike: call REAL Gemini with sample story frames and print what the spec needs to know.

Spec 2.1 / 9.3. NOT part of pytest and NOT wired to /v1/story/generate.

    .venv/Scripts/python scripts/try_story.py                 # plan only, no network
    .venv/Scripts/python scripts/try_story.py --confirm       # real calls
    .venv/Scripts/python scripts/try_story.py --confirm --sample scripts/try_story_samples/custom_long.json

Needs GEMINI_API_KEY (ai/.env) and GEMINI_TEXT_MODEL (env or --model). LLM_PROVIDER is
ignored: this script always uses GeminiLLMProvider. The key is never printed or written.

`--mode raw` (default): one call per sample, no validator, no retry.
`--mode pipeline`: `generate_story` (guard, validator, at most one retry), up to 2 calls per
sample. Prints the response metrics, warnings, usage (with `attempts`), the issues of each
attempt (codes + target ids, no story text) and the measured tokens per word.

    .venv/Scripts/python scripts/try_story.py --mode pipeline --provider mock --confirm
    .venv/Scripts/python scripts/try_story.py --mode pipeline --provider mock \
        --force INVALID_OUTPUT_ONCE --confirm      # exercises the retry path, no network

`--provider mock` (pipeline only) uses MockLLMProvider: no key, no network. `--force` is
mock-only (the `__force` flag of the request).

Output: out/try_story/<timestamp>/<sample>.raw.json (raw mode: SDK response) or
<sample>.response.json (pipeline mode: mapped response) - story text included, out/ is
git-ignored - and summary.json (metrics only).
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

AI_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_DIR))

from app.config import Settings  # noqa: E402
from app.core.guards import assert_no_forbidden_terms  # noqa: E402
from app.core.mapping import parse_llm_output  # noqa: E402
from app.core.prompt import render_story_prompt  # noqa: E402
from app.core.story import (  # noqa: E402
    _check,
    estimate_max_output_tokens,
    generate_story,
    request_max_output_tokens,
)
from app.core.text_utils import count_words  # noqa: E402
from app.errors import AiError  # noqa: E402
from app.providers.llm.base import LLMProvider, LLMResult, StoryLLMCall, Turn  # noqa: E402
from app.providers.llm.gemini import GeminiLLMProvider, _build_client  # noqa: E402
from app.providers.llm.mock import MockLLMProvider  # noqa: E402
from app.schemas.llm import LlmStoryOutput  # noqa: E402
from app.schemas.common import ForceCode  # noqa: E402
from app.schemas.story import StoryGenerateRequest  # noqa: E402

DEFAULT_SAMPLES = [
    AI_DIR / "docs" / "samples" / "story_request.json",
    AI_DIR / "scripts" / "try_story_samples" / "conflict_strong.json",
    AI_DIR / "scripts" / "try_story_samples" / "custom_long.json",
]
OUT_DIR = AI_DIR / "out" / "try_story"
# Rough chars-per-token for the plan's input estimate only (Vietnamese prompt).
_CHARS_PER_TOKEN_ESTIMATE = 3


class RecordingModels:
    """Wraps the real `AsyncClient.models`: keeps the raw response and the config sent.

    The debug path the brief allows: the script reads safety ratings / thought counts from
    the raw SDK response without changing `LLMResult` or the provider.
    """

    def __init__(self, inner: Any) -> None:
        self._inner = inner
        self.last_response: Any = None
        self.last_config: Any = None
        self.last_error: str | None = None
        self.calls = 0

    async def generate_content(self, *, model: str, contents: Any, config: Any = None) -> Any:
        self.calls += 1
        self.last_config = config
        self.last_response = None
        self.last_error = None
        try:
            self.last_response = await self._inner.generate_content(
                model=model, contents=contents, config=config
            )
        except Exception as error:
            # Google's error text (status + message), never the request: no key in it.
            self.last_error = (
                f"{type(error).__name__} {getattr(error, 'code', '')} "
                f"{getattr(error, 'status', '')}: {getattr(error, 'message', '')}"
            )
            raise
        return self.last_response


class RecordingClient:
    def __init__(self, inner: Any) -> None:
        # Keep the AsyncClient alive: its __del__ schedules aclose() on the running loop,
        # which closes the shared httpx client under the next request.
        self._inner = inner
        self.models = RecordingModels(inner.models)


def _use_mock(args: argparse.Namespace) -> bool:
    return getattr(args, "provider", "gemini") == "mock"


def _build_settings(args: argparse.Namespace) -> Settings:
    overrides: dict[str, Any] = {
        "llm_provider": "mock" if _use_mock(args) else "gemini",
        # ai/.env holds only the key; the token is unused by the script.
        "internal_token": os.environ.get("INTERNAL_TOKEN", "try-story-unused"),
    }
    if args.model:
        overrides["gemini_text_model"] = args.model
    if args.thinking_budget is not None:
        overrides["llm_thinking_budget"] = args.thinking_budget
    try:
        # Mock never reads ai/.env: no key is loaded when none is needed.
        return Settings(_env_file=None if _use_mock(args) else AI_DIR / ".env", **overrides)
    except ValueError as error:
        # hide_input_in_errors: the message never contains the key.
        sys.exit(f"config error: {error}")


def _load_sample(path: Path, force: ForceCode | None = None) -> StoryGenerateRequest:
    req = StoryGenerateRequest.model_validate_json(path.read_text(encoding="utf-8"))
    if force is not None:
        req = req.model_copy(update={"force_": force})
    return req


def _guard(req: StoryGenerateRequest) -> None:
    texts: dict[str, str | None] = {"situation": req.situation}
    for i, character in enumerate(req.characters, start=1):
        texts[f"characters[{i}].description"] = character.description
    assert_no_forbidden_terms(texts, req.forbidden_terms)


def _output_words(output: LlmStoryOutput) -> int:
    words = 0
    for page in output.pages:
        words += count_words(page.text)
    for scene in output.scenes:
        words += count_words(scene.description)
    for cp in output.checkpoints:
        for value in (cp.question, cp.answer, cp.hint):
            words += count_words(value or "")
        for option in cp.options:
            words += count_words(option.text) + count_words(option.feedback or "")
    return words


def _safety_ratings(ratings: Any) -> list[dict[str, Any]]:
    return [
        {
            "category": str(getattr(r.category, "value", r.category)),
            "probability": str(getattr(r.probability, "value", r.probability)),
            "blocked": r.blocked,
        }
        for r in ratings or []
    ]


def _raw_metrics(response: Any) -> dict[str, Any]:
    if response is None:
        return {}
    usage = response.usage_metadata
    candidate = response.candidates[0] if response.candidates else None
    feedback = response.prompt_feedback
    return {
        "prompt_tokens": usage.prompt_token_count if usage else None,
        "candidates_tokens": usage.candidates_token_count if usage else None,
        "thoughts_tokens": usage.thoughts_token_count if usage else None,
        "total_tokens": usage.total_token_count if usage else None,
        "candidate_safety_ratings": _safety_ratings(candidate.safety_ratings if candidate else None),
        "prompt_block_reason": (
            str(getattr(feedback.block_reason, "value", feedback.block_reason))
            if feedback and feedback.block_reason
            else None
        ),
        "prompt_safety_ratings": _safety_ratings(feedback.safety_ratings if feedback else None),
        "model_version": response.model_version,
    }


def _thinking_desc(settings: Settings) -> str:
    return f"budget={settings.llm_thinking_budget}"


def _print_plan(samples: list[Path], settings: Settings, mode: str = "raw") -> None:
    in_price = settings.price_text_input_per_mtok_micros
    out_price = settings.price_text_output_per_mtok_micros
    pipeline = mode == "pipeline"
    per_sample = 2 if pipeline else 1  # pipeline: first attempt + at most one retry
    print(f"model: {settings.gemini_text_model if settings.llm_provider == 'gemini' else 'mock-v1'}")
    print(f"thinking: {_thinking_desc(settings)}  temperature: {settings.llm_temperature}")
    if pipeline:
        print(f"mode: pipeline  samples: {len(samples)}  generate calls: at most "
              f"{per_sample * len(samples)} ({per_sample} x samples: attempt + one retry)")
    else:
        print(f"samples: {len(samples)}  generate calls: {len(samples)} (one per sample, no retry)")
    total_cost = 0
    for path in samples:
        req = _load_sample(path)
        prompt = render_story_prompt(req, settings)
        cap = request_max_output_tokens(estimate_max_output_tokens(req, settings), settings)
        in_est = len(prompt) // _CHARS_PER_TOKEN_ESTIMATE
        # Retry input is larger (prompt + attempt 1 + issues); x per_sample is a loose bound.
        cost = per_sample * (in_est * in_price + cap * out_price) // 1_000_000
        total_cost += cost
        print(f"  {path.name}: pages={len(req.pages)} max_output_tokens={cap} "
              f"input~{in_est} tok  max cost~{cost} micros")
    note = "" if in_price or out_price else " (PRICE_TEXT_* not set: 0)"
    print(f"estimated max cost: {total_cost} micros{note}")


async def _run_sample(
    path: Path, provider: GeminiLLMProvider, models: RecordingModels,
    settings: Settings, out_dir: Path,
) -> dict[str, Any]:
    req = _load_sample(path)
    _guard(req)  # our own samples too: the rule has no exceptions
    text_cap = estimate_max_output_tokens(req, settings)
    call = StoryLLMCall(
        frame=req,
        contents=[Turn(role="user", text=render_story_prompt(req, settings))],
        response_schema=LlmStoryOutput,
        max_output_tokens=request_max_output_tokens(text_cap, settings),
        temperature=settings.llm_temperature,
    )
    summary: dict[str, Any] = {
        "sample": path.name,
        "pages": len(req.pages),
        "checkpoints": len(req.checkpoints),
        "text_cap": text_cap,
        "max_output_tokens": call.max_output_tokens,
    }
    started = time.perf_counter()
    try:
        result = await provider.generate_story(call)
        summary["error"] = None
        summary["finish_reason"] = result.finish_reason
        text = result.text
    except AiError as error:
        summary["error"] = error.code.value
        summary["finish_reason"] = None
        text = ""
    summary["latency_ms"] = round((time.perf_counter() - started) * 1000)
    response = models.last_response
    summary["sdk_error"] = models.last_error
    summary |= _raw_metrics(response)
    if response is not None and response.candidates:
        summary["finish_reason_raw"] = str(
            getattr(response.candidates[0].finish_reason, "value",
                    response.candidates[0].finish_reason)
        )
    config = models.last_config
    if config is not None and config.thinking_config is not None:
        summary["thinking_config_sent"] = config.thinking_config.model_dump(
            mode="json", exclude_none=True
        )
        summary["temperature_sent"] = config.temperature

    output = parse_llm_output(text) if text else None
    summary["parsed"] = output is not None
    if output is not None:
        words = _output_words(output)
        page_words = [count_words(p.text) for p in output.pages]
        summary["output_words"] = words
        summary["page_words_min_max"] = [min(page_words, default=0), max(page_words, default=0)]
        summary["ids_match_frame"] = (
            [p.page_id for p in output.pages] == req.pages
            and [c.checkpoint_id for c in output.checkpoints] == [c.id for c in req.checkpoints]
        )
        summary["scenes"] = len(output.scenes)
        cand = summary.get("candidates_tokens")
        summary["tokens_per_word"] = round(cand / words, 3) if cand and words else None
        summary["forbidden_terms_in_output"] = any(
            term in text for term in req.forbidden_terms
        )

    stem = path.stem
    if response is not None:
        (out_dir / f"{stem}.raw.json").write_text(
            response.model_dump_json(exclude_none=True, indent=2), encoding="utf-8"
        )
    return summary


def _print_summary(s: dict[str, Any]) -> None:
    print(f"\n== {s['sample']} ==")
    for key in (
        "error", "sdk_error", "finish_reason", "latency_ms", "prompt_tokens", "candidates_tokens",
        "thoughts_tokens", "max_output_tokens", "thinking_config_sent", "temperature_sent",
        "parsed", "ids_match_frame", "output_words", "page_words_min_max", "scenes",
        "tokens_per_word", "prompt_block_reason", "model_version",
    ):
        if key in s:
            print(f"  {key}: {s[key]}")
    for key in ("candidate_safety_ratings", "prompt_safety_ratings"):
        ratings = s.get(key) or []
        shown = ", ".join(
            f"{r['category'].removeprefix('HARM_CATEGORY_')}={r['probability']}"
            + (" BLOCKED" if r["blocked"] else "")
            for r in ratings
        )
        print(f"  {key}: {shown or '(none returned)'}")


class RecordingLLM:
    """Wraps any LLMProvider and keeps every call's result, so the script can show what each
    attempt returned without changing `generate_story` or the provider (spec 8.5 debug hook).
    """

    def __init__(self, inner: LLMProvider, models: RecordingModels | None = None) -> None:
        self._inner = inner
        self._models = models
        self.name = inner.name
        self.model = inner.model
        self.calls: list[dict[str, Any]] = []

    async def generate_story(self, call: StoryLLMCall) -> LLMResult:
        started = time.perf_counter()
        record: dict[str, Any] = {"result": None, "error": None}
        self.calls.append(record)
        try:
            record["result"] = await self._inner.generate_story(call)
            return record["result"]
        except AiError as error:
            record["error"] = error.code.value
            raise
        finally:
            record["latency_ms"] = round((time.perf_counter() - started) * 1000)
            record["max_output_tokens"] = call.max_output_tokens
            if self._models is not None:
                record["thoughts_tokens"] = _raw_metrics(self._models.last_response).get(
                    "thoughts_tokens"
                )


def _describe_attempts(req: StoryGenerateRequest, recorder: RecordingLLM) -> list[dict[str, Any]]:
    """Per attempt: finish reason, tokens, issues (code/severity/target, no detail text) and
    the measured tokens per word. Issues are recomputed with the orchestrator's own `_check`.
    """
    attempts: list[dict[str, Any]] = []
    for number, record in enumerate(recorder.calls, start=1):
        row: dict[str, Any] = {
            "attempt": number,
            "error": record["error"],
            "latency_ms": record.get("latency_ms"),
            "max_output_tokens": record.get("max_output_tokens"),
        }
        if record.get("thoughts_tokens") is not None:
            row["thoughts_tokens"] = record["thoughts_tokens"]
        result: LLMResult | None = record["result"]
        if result is not None:
            checked = _check(req, result, number)
            row |= {
                "finish_reason": result.finish_reason,
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "issues": [
                    {"code": i.code, "severity": i.severity.value, "target_id": i.target_id}
                    for i in checked.issues
                ],
            }
            if checked.output is not None:
                words = _output_words(checked.output)
                row["output_words"] = words
                # TOKENS_PER_WORD is a TEXT rate (thinking is budgeted separately, spec
                # 3.11.4): `output_tokens` includes thoughts, so subtract them (missing = 0).
                text_tokens = max(0, result.output_tokens - (row.get("thoughts_tokens") or 0))
                row["text_output_tokens"] = text_tokens
                row["tokens_per_word"] = round(text_tokens / words, 3) if words else None
                row["tokens_per_word_raw"] = (
                    round(result.output_tokens / words, 3) if words else None
                )
        attempts.append(row)
    return attempts


async def _run_pipeline_sample(
    path: Path, llm: RecordingLLM, settings: Settings, out_dir: Path,
    force: ForceCode | None = None,
) -> dict[str, Any]:
    req = _load_sample(path, force)
    summary: dict[str, Any] = {
        "sample": path.name, "pages": len(req.pages), "checkpoints": len(req.checkpoints),
    }
    started = time.perf_counter()
    try:
        response = await generate_story(req, llm, settings)
        summary["error"] = None
        summary["warnings"] = [w.model_dump(mode="json") for w in response.warnings]
        summary["usage"] = response.usage.model_dump(mode="json")
        (out_dir / f"{path.stem}.response.json").write_text(
            response.model_dump_json(by_alias=True, indent=2), encoding="utf-8"
        )
    except AiError as error:
        summary["error"] = error.code.value
        summary["retryable"] = error.retryable
        summary["warnings"] = []
        summary["usage"] = error.usage.model_dump(mode="json") if error.usage else None
    summary["total_ms"] = round((time.perf_counter() - started) * 1000)
    summary["attempts"] = _describe_attempts(req, llm)
    rates = [a["tokens_per_word"] for a in summary["attempts"] if a.get("tokens_per_word")]
    summary["tokens_per_word"] = rates[-1] if rates else None
    return summary


def _print_pipeline_summary(s: dict[str, Any]) -> None:
    print(f"\n== {s['sample']} ==")
    print(f"  error: {s['error']}" + (f" (retryable={s['retryable']})" if s["error"] else ""))
    print(f"  total_ms: {s['total_ms']}  tokens_per_word (text only, thinking excluded): "
          f"{s['tokens_per_word']}")
    print(f"  usage: {s['usage']}")
    print(f"  warnings: {[(w['code'], w['target_id']) for w in s['warnings']] or '(none)'}")
    for a in s["attempts"]:
        issues = [f"{i['code']}({i['severity']},{i['target_id']})" for i in a.get("issues", [])]
        print(f"  attempt {a['attempt']}: error={a['error']} finish={a.get('finish_reason')} "
              f"tok in/out={a.get('input_tokens')}/{a.get('output_tokens')} "
              f"words={a.get('output_words')} thoughts={a.get('thoughts_tokens')} "
              f"tpw_raw={a.get('tokens_per_word_raw')} issues={issues or '(none)'}")


async def _confirmed_pipeline(
    samples: list[Path], settings: Settings, mock: bool, force: ForceCode | None
) -> None:
    models_client: RecordingClient | None = None
    inner: LLMProvider
    if mock:
        inner = MockLLMProvider()
    else:
        # Kept alive for the whole run (README "Ghi chu google-genai": GC'd client bug).
        models_client = RecordingClient(_build_client(settings))
        inner = GeminiLLMProvider(settings, client=models_client)
    llm = RecordingLLM(inner, models_client.models if models_client else None)
    out_dir = OUT_DIR / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for path in samples:
        llm.calls.clear()
        summary = await _run_pipeline_sample(path, llm, settings, out_dir, force)
        _print_pipeline_summary(summary)
        summaries.append(summary)
    rates = [s["tokens_per_word"] for s in summaries if s["tokens_per_word"]]
    measured = round(sum(rates) / len(rates), 3) if rates else None
    meta = {
        "mode": "pipeline",
        "provider": llm.name,
        "model": llm.model,
        "thinking": _thinking_desc(settings),
        "tokens_per_word_setting": settings.tokens_per_word,
        "tokens_per_word_measured_mean": measured,
        "samples": summaries,
    }
    (out_dir / "summary.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\ntokens_per_word: setting={settings.tokens_per_word} measured_mean={measured}")
    print(f"saved: {out_dir}")


async def _confirmed(samples: list[Path], settings: Settings) -> None:
    models_client = RecordingClient(_build_client(settings))
    provider = GeminiLLMProvider(settings, client=models_client)
    out_dir = OUT_DIR / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for path in samples:
        summary = await _run_sample(path, provider, models_client.models, settings, out_dir)
        _print_summary(summary)
        summaries.append(summary)
    meta = {
        "model": settings.gemini_text_model,
        "thinking": _thinking_desc(settings),
        "tokens_per_word_setting": settings.tokens_per_word,
        "generate_calls": models_client.models.calls,
        "samples": summaries,
    }
    (out_dir / "summary.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\ngenerate calls made: {models_client.models.calls}")
    print(f"saved: {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--confirm", action="store_true", help="really call Gemini")
    parser.add_argument("--sample", type=Path, action="append", help="sample request JSON")
    parser.add_argument("--mode", choices=["raw", "pipeline"], default="raw")
    parser.add_argument("--provider", choices=["gemini", "mock"], default="gemini",
                        help="mock: MockLLMProvider, no key and no network (pipeline mode only)")
    parser.add_argument("--force", choices=[c.value for c in ForceCode],
                        help="mock only: the request's __force flag (e.g. INVALID_OUTPUT_ONCE)")
    parser.add_argument("--model", help="overrides GEMINI_TEXT_MODEL")
    parser.add_argument("--thinking-budget", type=int, help="overrides LLM_THINKING_BUDGET")
    args = parser.parse_args()

    if args.provider == "mock" and args.mode != "pipeline":
        parser.error("--provider mock needs --mode pipeline")
    if args.force and args.provider != "mock":
        parser.error("--force needs --provider mock (the real provider rejects __force)")
    settings = _build_settings(args)
    samples = args.sample or DEFAULT_SAMPLES
    _print_plan(samples, settings, args.mode)
    if not args.confirm:
        print("\nplan only (no network). Re-run with --confirm to call the provider.")
        return
    if args.mode == "pipeline":
        mock = args.provider == "mock"
        print(f"\n--confirm: running the pipeline ({'mock' if mock else 'Gemini'})")
        force = ForceCode(args.force) if args.force else None
        asyncio.run(_confirmed_pipeline(samples, settings, mock, force))
        return
    print("\n--confirm: calling Gemini now")
    asyncio.run(_confirmed(samples, settings))


if __name__ == "__main__":
    main()
