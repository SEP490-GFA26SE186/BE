"""Measure narrating a WHOLE story through the running service (spec 6). NOT part of pytest.

Sends every readable segment of a story response (pages, checkpoint question / hint, options
text / feedback) to POST /v1/tts/synthesize one at a time - the way Node's narration queue
does - and prints per-kind timings plus the total.

    # service running with TTS_PROVIDER=vieneu (dev compose exposes :8000)
    .venv/Scripts/python scripts/try_tts.py --confirm
    .venv/Scripts/python scripts/try_tts.py --confirm --names "An,Bin,Mẹ" \
        --story out/try_story/20261016-202202/custom_long.response.json

Tokens {NV1}, {NV2}... are replaced with --names in order (TTS gets real names, like Node).
INTERNAL_TOKEN is read from the env or ../.env and never printed. Audio lands in the service's
storage under try-tts/<timestamp>/. Output: out/try_tts/<timestamp>/summary.json - timings and
word counts only, no story text.
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORY = ROOT / "docs" / "samples" / "story_response.json"
TOKEN = re.compile(r"\{NV(\d+)\}")


def internal_token() -> str:
    if os.environ.get("INTERNAL_TOKEN"):
        return os.environ["INTERNAL_TOKEN"]
    for env in (ROOT / ".env", ROOT.parent / ".env"):
        if env.is_file():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("INTERNAL_TOKEN="):
                    return line.split("=", 1)[1].strip()
    sys.exit("INTERNAL_TOKEN not found (env, ai/.env or BE/.env)")


def segments(story: dict) -> list[tuple[str, str]]:
    """(kind, text) in reading order: page, then the checkpoint after it."""
    out: list[tuple[str, str]] = [("page", p["text"]) for p in story["pages"].values()]
    for cp in story["checkpoints"].values():
        out.append(("question", cp["question"]))
        if cp.get("hint"):
            out.append(("hint", cp["hint"]))
        for option in (cp.get("options") or {}).values():
            if isinstance(option, str):
                out.append(("option", option))
            else:
                out.append(("option", option["text"]))
                if option.get("feedback"):
                    out.append(("feedback", option["feedback"]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--story", type=Path, default=DEFAULT_STORY)
    ap.add_argument("--names", default="An,Bin,Mẹ,Bố,Bà")
    ap.add_argument("--voice", default="Kim Thanh")
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--confirm", action="store_true", help="actually call the service")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    names = [n.strip() for n in args.names.split(",")]
    story = json.loads(args.story.read_text(encoding="utf-8"))
    segs = [(k, TOKEN.sub(lambda m: names[int(m[1]) - 1], t)) for k, t in segments(story)]
    print(f"{args.story.name}: {len(segs)} segments, {sum(len(t.split()) for _, t in segs)} words")
    if not args.confirm:
        print("plan only - add --confirm to call the service")
        return

    health = httpx.get(f"{args.url}/health", timeout=10).json()
    print("service:", health["tts_provider"], health.get("tts_default_voice"), health["storage_backend"])
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    headers = {"X-Internal-Token": internal_token()}
    rows = []
    started = time.monotonic()
    with httpx.Client(timeout=300) as client:
        for i, (kind, text) in enumerate(segs, 1):
            t0 = time.monotonic()
            r = client.post(
                f"{args.url}/v1/tts/synthesize",
                headers=headers,
                json={"request_id": f"seg{i:02d}", "storage_prefix": f"try-tts/{stamp}", "text": text,
                      "voice_id": args.voice},
            )
            wall = time.monotonic() - t0
            body = r.json()
            if r.status_code != 200:
                print(f"{i:02d} {kind:8} ERROR {r.status_code} {body.get('error', {}).get('code')}")
                rows.append({"kind": kind, "words": len(text.split()), "error": body.get("error")})
                continue
            rows.append({"kind": kind, "words": len(text.split()), "wall_s": round(wall, 2),
                         "audio_s": body["duration_seconds"], "key": body["audio_key"]})
            print(f"{i:02d} {kind:8} {len(text.split()):3d} words  {wall:5.1f}s -> {body['duration_seconds']:5.1f}s audio")
    total = time.monotonic() - started

    by_kind: dict[str, list[float]] = {}
    for row in rows:
        if "wall_s" in row:
            by_kind.setdefault(row["kind"], []).append(row["wall_s"])
    print(f"\nTOTAL {total:.0f}s for {len(segs)} segments ({total / 60:.1f} min)")
    for kind, walls in by_kind.items():
        print(f"  {kind:8} n={len(walls):2d} avg={sum(walls) / len(walls):5.1f}s max={max(walls):5.1f}s")

    out = ROOT / "out" / "try_tts" / stamp
    out.mkdir(parents=True, exist_ok=True)
    summary = {"story": args.story.name, "voice": args.voice, "service": health,
               "total_s": round(total, 1), "segments": rows}
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("summary:", out / "summary.json")


if __name__ == "__main__":
    main()
