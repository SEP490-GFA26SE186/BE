"""Move files uploaded before asset_folder existed into Media Library folders (dynamic folder mode).

Until 2026-10-24 uploads set only public_id, so in dynamic folder mode every image / audio sat in
Home. This sets asset_folder = the public_id's directory (what uploads do now) for each
authenticated asset under CLOUDINARY_FOLDER that has no folder yet. public_id, URLs and the keys in
the DB do not change.

    .venv312/Scripts/python scripts/cloudinary_backfill_folders.py            # dry run: counts only
    .venv312/Scripts/python scripts/cloudinary_backfill_folders.py --confirm  # apply

Reads CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET / _FOLDER from ai/.env (Settings).
Not in the ai image (only app/ is copied): run it from a dev machine; for prod files set
CLOUDINARY_FOLDER=storyweaver-prod in the environment (same Cloudinary account).
"""

import argparse
import sys
from pathlib import Path, PurePosixPath

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings

RESOURCE_TYPES = ("image", "video", "raw")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--confirm", action="store_true", help="apply changes (default: dry run)")
    args = parser.parse_args()

    s = Settings()
    if not (s.cloudinary_cloud_name and s.cloudinary_api_key and s.cloudinary_api_secret):
        print("CLOUDINARY_* is not configured")
        return 1
    prefix = s.cloudinary_folder.strip("/")
    base = f"https://api.cloudinary.com/v1_1/{s.cloudinary_cloud_name}"
    auth = (s.cloudinary_api_key, s.cloudinary_api_secret.get_secret_value())

    moved = skipped = failed = 0
    with httpx.Client(auth=auth, timeout=30) as client:
        for resource_type in RESOURCE_TYPES:
            cursor = None
            while True:
                params = {"prefix": f"{prefix}/" if prefix else "", "max_results": 500, "fields": "public_id,asset_folder"}
                if cursor:
                    params["next_cursor"] = cursor
                r = client.get(f"{base}/resources/{resource_type}/authenticated", params=params)
                r.raise_for_status()
                body = r.json()
                for res in body.get("resources", []):
                    folder = str(PurePosixPath(res["public_id"]).parent)
                    if folder == "." or res.get("asset_folder") == folder:
                        skipped += 1
                        continue
                    if not args.confirm:
                        moved += 1
                        continue
                    u = client.post(
                        f"{base}/resources/{resource_type}/authenticated/{res['public_id']}",
                        data={"asset_folder": folder},
                    )
                    if u.status_code < 400:
                        moved += 1
                    else:
                        failed += 1
                        print(f"failed {resource_type} {res['public_id']}: HTTP {u.status_code}")
                cursor = body.get("next_cursor")
                if not cursor:
                    break

    verb = "moved" if args.confirm else "would move"
    print(f"{verb} {moved}, already in place {skipped}, failed {failed} (folder prefix '{prefix}')")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
