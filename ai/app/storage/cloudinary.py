import hashlib
import time
from pathlib import PurePosixPath

import httpx

from app.errors import AiError

API_BASE = "https://api.cloudinary.com/v1_1"


def _resource_type(content_type: str) -> str:
    """Cloudinary groups assets by kind: images -> image, audio/video -> video, else raw."""
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith(("audio/", "video/")):
        return "video"
    return "raw"


def _resource_type_of_key(key: str) -> str:
    ext = PurePosixPath(key).suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"
    if ext in {".wav", ".mp3", ".m4a", ".ogg", ".mp4"}:
        return "video"
    return "raw"


def sign(params: dict[str, str | int], api_secret: str) -> str:
    """Cloudinary API signature: params sorted by name, joined 'k=v&k=v', secret appended, SHA-1.

    Signed params exclude file, api_key, resource_type, cloud_name (Cloudinary docs,
    "Authentication signatures"); callers add api_key after signing.
    """
    payload = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hashlib.sha1(f"{payload}{api_secret}".encode()).hexdigest()


class CloudinaryStorage:
    """Cloudinary over its REST API (no SDK, same reasoning as SupabaseStorage).

    Assets belong to children (real names, real family events), so they are uploaded with
    `type=authenticated`: the public `res.cloudinary.com/.../upload/...` URL does not serve
    them; reads go through the signed download endpoint. Keys keep the `prefix/request-n.ext`
    shape of the other backends; public_id = folder + key, without the extension for
    image/video (Cloudinary stores the format separately).

    Smoke-tested against a real account on 2026-10-17 (PNG + WAV upload, byte-identical
    download, overwrite, missing key -> INVALID_INPUT).
    """

    def __init__(self, cloud_name: str, api_key: str, api_secret: str, folder: str = "") -> None:
        self._base = f"{API_BASE}/{cloud_name}"
        self._api_key = api_key
        self._secret = api_secret
        self._folder = folder.strip("/")

    @property
    def backend(self) -> str:
        return "cloudinary"

    def _public_id(self, key: str, resource_type: str) -> tuple[str, str]:
        """(public_id, format) for `key`. Raw assets keep the extension in the public_id."""
        path = PurePosixPath(key)
        fmt = path.suffix.lstrip(".").lower()
        stem = key if resource_type == "raw" else str(path.with_suffix(""))
        return (f"{self._folder}/{stem}" if self._folder else stem), fmt

    def _signed(self, params: dict[str, str | int]) -> dict[str, str | int]:
        params = {**params, "timestamp": int(time.time())}
        return {**params, "signature": sign(params, self._secret), "api_key": self._api_key}

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        """Write `data` at `key` (overwrites on job retry) and return `key`."""
        resource_type = _resource_type(content_type)
        public_id, _ = self._public_id(key, resource_type)
        # Dynamic folder mode: the slashes in public_id do not create Media Library folders, so
        # asset_folder mirrors them (otherwise every file lands in Home). Fixed mode ignores it.
        asset_folder = str(PurePosixPath(public_id).parent)
        form = self._signed(
            {
                "public_id": public_id,
                **({"asset_folder": asset_folder} if asset_folder != "." else {}),
                "type": "authenticated",
                "overwrite": "true",
                "invalidate": "true",
            }
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self._base}/{resource_type}/upload",
                    data={k: str(v) for k, v in form.items()},
                    files={"file": (PurePosixPath(key).name, data, content_type)},
                )
        except httpx.HTTPError as error:
            raise AiError.provider_error(f"Khong upload duoc len Cloudinary: {error}") from error

        if response.status_code >= 400:
            raise AiError.provider_error(
                f"Cloudinary tra ve {response.status_code}: {response.text[:200]}"
            )
        return key

    async def download(self, key: str) -> bytes:
        """Read an `authenticated` asset back through the signed download endpoint.

        Same request as the SDK's `private_download_url` (signed: public_id, format, type,
        timestamp); redirects are followed.
        """
        resource_type = _resource_type_of_key(key)
        public_id, fmt = self._public_id(key, resource_type)
        params: dict[str, str | int] = {"public_id": public_id, "type": "authenticated"}
        if resource_type != "raw":
            params["format"] = fmt
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(
                    f"{self._base}/{resource_type}/download", params=self._signed(params)
                )
        except httpx.HTTPError as error:
            raise AiError.provider_error(f"Khong tai duoc tu Cloudinary: {error}") from error

        if response.status_code == 404:
            # Wrong key from the caller, not transient: do not let BullMQ retry it.
            raise AiError.invalid_input("Không tìm thấy file theo key đã cho.")
        if response.status_code >= 400:
            raise AiError.provider_error(
                f"Cloudinary tra ve {response.status_code}: {response.text[:200]}"
            )
        return response.content
