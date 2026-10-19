"""Compare image models on the SAME fixture (docs/06 "Công cụ so sánh model"). NOT part of pytest.

For each profile in app/image_models.yaml (adapter `cloudflare`, i.e. Workers AI over REST, no
deploy needed): one reference portrait per character, then every scene of the chosen story. Models
that accept reference images get the portraits (input_image_N); the others get the appearance
text in the prompt (reference_used = false). Optional --expressions: the 5 EQ emotions of the boy
from his portrait (research only: "sprite ghép lên nền" is in docs/01 "Đã bỏ").

    .venv312/Scripts/python scripts/compare_images.py                 # dry run: prints the plan
    .venv312/Scripts/python scripts/compare_images.py --confirm
    .venv312/Scripts/python scripts/compare_images.py --confirm --story all --expressions \
        --profiles cf-flux-2-klein-4b,cf-flux-1-schnell

CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN come from the env, ai/.env or BE/.env (never printed).
Non-commercial profiles run only with ALLOW_NONCOMMERCIAL_MODELS=true. Total calls are capped by
--max-calls (default IMAGE_DEV_MAX_CALLS or 40). Output: out/compare/<timestamp>/ with the images,
meta.json (latency, license, reference_used) and index.html - a BLIND grid (models shown as A, B,
C...) with 1-5 scoring per criterion, saved to scores.json from the page.
"""

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.image_prompts import NEGATIVE, image_style, portrait_prompt, scene_prompt  # noqa: E402
from app.providers.image.cloudflare import (  # noqa: E402
    PORTRAIT_SIZE,
    CloudflareImageError,
    CloudflareWorkersAI,
    load_profiles,
)

FIXTURE = Path(__file__).with_name("compare_images_fixture.json")
OUT = ROOT / "out" / "compare"
CRITERIA = [
    ("content", "Đúng nội dung cảnh"),
    ("style", "Phong cách tranh thiếu nhi"),
    ("consistency", "Nhân vật nhất quán giữa các ảnh"),
    ("artifacts", "Không lỗi hình (tay, mặt, chữ)"),
    ("safety", "An toàn, dịu mắt cho trẻ"),
]


def env(key: str) -> str | None:
    if os.environ.get(key):
        return os.environ[key]
    for f in (ROOT / ".env", ROOT.parent / ".env"):
        if f.is_file():
            for line in f.read_text(encoding="utf-8").splitlines():
                if line.startswith(f"{key}="):
                    value = line.split("=", 1)[1].strip().strip('"')
                    if value:
                        return value
    return None


def ext_of(data: bytes) -> str:
    return "png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "jpg"


def expression_prompt(description: str, emotion: str) -> str:
    return (f"{image_style()}\n\nThe same character as in image 0 ({description}), showing a clearly "
            f"{emotion} facial expression, upper body, plain white background, sticker style, single character only.")


class Budget:
    def __init__(self, limit: int):
        self.limit, self.used = limit, 0

    def take(self) -> None:
        if self.used >= self.limit:
            raise RuntimeError(f"max calls ({self.limit}) reached")
        self.used += 1


async def run_profile(client, profile, appearance, fixture, stories, args, budget, out_dir) -> dict:
    result = {"profile": profile.name, "model": profile.model, "license": profile.license,
              "commercial_use": profile.commercial_use, "references": profile.supports_references,
              "items": [], "errors": []}
    pdir = out_dir / profile.name
    pdir.mkdir(parents=True, exist_ok=True)

    async def call(kind, label, prompt, refs=None, seed=None, size=None):
        budget.take()
        w, h = size or (args.size, args.size)
        try:
            res = await client.generate(profile, prompt, width=w, height=h, seed=seed,
                                        negative=NEGATIVE, references=refs)
        except (CloudflareImageError, Exception) as e:  # one failure must not stop the comparison
            result["errors"].append({"kind": kind, "label": label, "error": str(e)[:300]})
            print(f"  [{profile.name}] {label}: ERROR {str(e)[:120]}")
            return None
        name = f"{kind}-{label}.{ext_of(res.image)}"
        (pdir / name).write_bytes(res.image)
        result["items"].append({"kind": kind, "label": label, "file": f"{profile.name}/{name}",
                                "seconds": round(res.seconds, 1), "reference_used": res.reference_used})
        print(f"  [{profile.name}] {label}: {res.seconds:.1f}s ref={res.reference_used}", flush=True)
        return res.image

    portraits: dict[str, bytes] = {}
    for c in fixture["characters"]:
        img = await call("portrait", c["id"], portrait_prompt(c["description"]), seed=args.seed,
                         size=(PORTRAIT_SIZE, PORTRAIT_SIZE))
        if img:
            portraits[c["id"]] = img  # drawn under 512x512: usable as a FLUX.2 reference as is

    for story in stories:
        for i, scene in enumerate(story["scenes"], 1):
            ids = scene["characters"]
            refs = [portraits[c] for c in ids if c in portraits][: profile.max_references]
            referenced = len(refs) if profile.supports_references else 0
            ordered = [c for c in ids if c in portraits][:referenced] + [c for c in ids if c not in portraits or ids.index(c) >= referenced]
            prompt = scene_prompt(scene["description"], [appearance[c] for c in dict.fromkeys(ordered)],
                                  referenced=referenced, dialect=profile.dialect)
            await call("scene", f"{story['id']}-{i}", prompt, refs[:referenced] or None, seed=args.seed)

    if args.expressions and profile.supports_references and "boy" in portraits:
        for emotion in fixture.get("expressions", []):
            await call("expression", emotion, expression_prompt(appearance["boy"], emotion), [portraits["boy"]], seed=args.seed)
    return result


def write_html(out_dir: Path, results: list[dict], letters: dict[str, str]) -> None:
    rows = []
    for r in sorted(results, key=lambda r: letters[r["profile"]]):
        letter = letters[r["profile"]]
        cells = "".join(
            f'<figure><img src="{it["file"]}" loading="lazy" alt="{it["kind"]} {it["label"]}">'
            f'<figcaption>{it["kind"]} · {it["label"]}<span class="meta"> · {it["seconds"]}s'
            f'{" · ref" if it["reference_used"] else ""}</span></figcaption></figure>'
            for it in r["items"]
        ) or "<p>Không có ảnh (xem lỗi trong meta.json)</p>"
        score = "".join(
            f'<label>{text}<select data-model="{letter}" data-key="{key}">'
            + "".join(f"<option>{v}</option>" for v in ["", 1, 2, 3, 4, 5]) + "</select></label>"
            for key, text in CRITERIA
        )
        rows.append(
            f'<section><h2>Model {letter} <span class="meta">— {r["profile"]} ({r["license"]})</span></h2>'
            f'<div class="grid">{cells}</div><div class="score">{score}'
            f'<label class="note">Ghi chú<textarea data-model="{letter}" data-key="note"></textarea></label></div></section>'
        )
    mapping = json.dumps({v: k for k, v in letters.items()})
    html = f"""<!doctype html><html lang="vi"><meta charset="utf-8"><title>So sánh model ảnh</title>
<style>
body{{font:14px system-ui,sans-serif;margin:24px;background:#faf8f5;color:#222}}
section{{background:#fff;border-radius:12px;padding:16px;margin-bottom:20px;box-shadow:0 1px 4px #0001}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}}
figure{{margin:0}} img{{width:100%;border-radius:8px;cursor:zoom-in}} figcaption{{font-size:12px;color:#555}}
.score{{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}} .score label{{display:flex;flex-direction:column;font-size:12px}}
.note textarea{{width:320px;height:48px}} .meta{{display:none;color:#888;font-weight:normal}} body.reveal .meta{{display:inline}}
button{{padding:8px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;margin-right:8px}}
</style>
<h1>So sánh model ảnh — chấm mù</h1>
<p>Chấm từng tiêu chí 1–5 (5 là tốt nhất). Điểm tự lưu trong trình duyệt. Xong thì bấm "Lưu scores.json", rồi mới "Hiện tên model".</p>
<p><button id="save">Lưu scores.json</button><button id="reveal">Hiện tên model</button></p>
{"".join(rows)}
<script>
const MAP={mapping}, KEY="compare-scores:"+location.pathname;
const fields=[...document.querySelectorAll("[data-model]")];
let saved={{}}; try{{saved=JSON.parse(localStorage.getItem(KEY)||"{{}}")}}catch(e){{}}
fields.forEach(f=>{{const v=saved[f.dataset.model+"."+f.dataset.key]; if(v!=null) f.value=v;
  f.addEventListener("change",()=>{{saved[f.dataset.model+"."+f.dataset.key]=f.value; try{{localStorage.setItem(KEY,JSON.stringify(saved))}}catch(e){{}}}});}});
document.getElementById("reveal").onclick=()=>document.body.classList.toggle("reveal");
document.getElementById("save").onclick=()=>{{const out={{}};
  fields.forEach(f=>{{const m=MAP[f.dataset.model]; (out[m]??={{}})[f.dataset.key]=f.value}});
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{{type:"application/json"}}));
  a.download="scores.json"; a.click();}};
document.querySelectorAll("img").forEach(i=>i.onclick=()=>window.open(i.src));
</script></html>"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", type=Path, default=FIXTURE, help="fixture JSON (characters, stories)")
    ap.add_argument("--profiles", help="comma list; default: every commercial-use profile")
    ap.add_argument("--story", default="friends", help="fixture story id or 'all'")
    ap.add_argument("--expressions", action="store_true", help="also draw the 5 emotions (reference models only)")
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--max-calls", type=int, default=int(env("IMAGE_DEV_MAX_CALLS") or 40))
    ap.add_argument("--confirm", action="store_true", help="actually call Workers AI")
    args = ap.parse_args()

    profiles = load_profiles()
    allow_nc = (env("ALLOW_NONCOMMERCIAL_MODELS") or "").lower() == "true"
    names = args.profiles.split(",") if args.profiles else [n for n, p in profiles.items() if p.commercial_use]
    chosen = []
    for n in names:
        if n not in profiles:
            sys.exit(f"unknown profile {n}; known: {', '.join(profiles)}")
        if not profiles[n].commercial_use and not allow_nc:
            print(f"skip {n}: non-commercial license (set ALLOW_NONCOMMERCIAL_MODELS=true to compare it)")
            continue
        chosen.append(profiles[n])

    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    if len(fixture["stories"]) == 1 and args.story == "friends" and fixture["stories"][0]["id"] != "friends":
        args.story = fixture["stories"][0]["id"]  # single-story fixture: no need to name it
    stories = fixture["stories"] if args.story == "all" else [s for s in fixture["stories"] if s["id"] == args.story]
    if not stories:
        sys.exit(f"unknown story {args.story}")
    n_scenes = sum(len(s["scenes"]) for s in stories)
    plan = {p.name: len(fixture["characters"]) + n_scenes
            + (len(fixture.get("expressions", [])) if args.expressions and p.supports_references else 0) for p in chosen}
    total = sum(plan.values())
    print("plan:", ", ".join(f"{k}={v}" for k, v in plan.items()), f"| total {total} calls, cap {args.max_calls}")
    if total > args.max_calls:
        sys.exit("plan exceeds --max-calls; narrow --profiles / --story or raise the cap")
    if not args.confirm:
        print("dry run - add --confirm to call Workers AI")
        return

    account, token = env("CLOUDFLARE_ACCOUNT_ID"), env("CLOUDFLARE_API_TOKEN")
    if not account or not token:
        sys.exit("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not found (env, ai/.env or BE/.env)")

    out_dir = OUT / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    appearance = {c["id"]: c["description"] for c in fixture["characters"]}
    budget = Budget(args.max_calls)

    async def run():
        client = CloudflareWorkersAI(account, token)
        try:
            return await asyncio.gather(*(run_profile(client, p, appearance, fixture, stories, args, budget, out_dir)
                                          for p in chosen))
        finally:
            await client.aclose()

    results = asyncio.run(run())
    letters_pool = [chr(ord("A") + i) for i in range(len(results))]
    random.Random().shuffle(letters_pool)
    letters = {r["profile"]: letters_pool[i] for i, r in enumerate(results)}
    (out_dir / "meta.json").write_text(json.dumps({"args": vars(args), "results": results}, ensure_ascii=False, indent=2, default=str),
                                       encoding="utf-8")
    write_html(out_dir, results, letters)
    print(f"saved: {out_dir / 'index.html'} ({budget.used} calls)")


if __name__ == "__main__":
    main()
