"""Cloudflare Workers AI image runtime (docs/06 "Adapters"): one REST endpoint, many models.

The adapter is the runtime, the model is data (app/image_models.yaml). Three request styles exist
on Workers AI, chosen per profile:

- json_b64  - JSON in, {"result": {"image": <base64>}} out (FLUX.1)
- json_png  - JSON in, raw PNG out (SDXL family)
- multipart - multipart/form-data in, reference images as input_image_0..N, base64 out (FLUX.2)

`CloudflareWorkersAI` is the thin REST client (scripts/compare_images.py uses it directly);
`CloudflareImageProvider` is the ImageProvider behind /v1/images/* (prompts from
core/image_prompts.py, storage stays in the endpoint). No DB.
"""

import base64
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import httpx
import yaml

API = "https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"
PROFILES_FILE = Path(__file__).resolve().parents[2] / "image_models.yaml"

RequestStyle = Literal["json_b64", "json_png", "multipart"]


@dataclass(frozen=True)
class ImageProfile:
    name: str
    model: str
    request_style: RequestStyle
    dialect: str
    license: str
    capabilities: dict[str, Any]
    steps: int | None = None

    @property
    def supports_references(self) -> bool:
        return bool(self.capabilities.get("supports_reference_images"))

    @property
    def max_references(self) -> int:
        return int(self.capabilities.get("max_reference_images", 0))

    @property
    def commercial_use(self) -> bool:
        return bool(self.capabilities.get("commercial_use"))


def load_profiles(path: Path = PROFILES_FILE) -> dict[str, ImageProfile]:
    """Profiles of the `cloudflare` adapter from image_models.yaml."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {
        name: ImageProfile(
            name=name,
            model=p["model"],
            request_style=p["request_style"],
            dialect=p.get("dialect", "natural"),
            license=p.get("license", "unknown"),
            capabilities=p.get("capabilities", {}),
            steps=p.get("steps"),
        )
        for name, p in raw.items()
        if p.get("adapter") == "cloudflare"
    }


class CloudflareImageError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Workers AI HTTP {status}: {message}")
        self.status = status


@dataclass
class ImageCall:
    image: bytes
    reference_used: bool
    seconds: float
    request: dict[str, Any] = field(default_factory=dict)  # what was sent, minus image bytes


class CloudflareWorkersAI:
    """Thin client. `references` are PNG/JPEG bytes already under 512x512 (FLUX.2 limit)."""

    def __init__(self, account_id: str, api_token: str, *, timeout: float = 180,
                 transport: httpx.AsyncBaseTransport | None = None):
        self._account = account_id
        self._client = httpx.AsyncClient(
            timeout=timeout,
            transport=transport,
            headers={"Authorization": f"Bearer {api_token}"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate(
        self,
        profile: ImageProfile,
        prompt: str,
        *,
        width: int = 768,
        height: int = 768,
        seed: int | None = None,
        negative: str | None = None,
        references: list[bytes] | None = None,
    ) -> ImageCall:
        refs = (references or [])[: profile.max_references] if profile.supports_references else []
        url = API.format(account=self._account, model=profile.model)
        sent: dict[str, Any] = {"prompt": prompt}
        started = time.perf_counter()

        if profile.request_style == "multipart":
            data = {"prompt": prompt, "width": str(width), "height": str(height)}
            if profile.steps:
                data["steps"] = str(profile.steps)
            if seed is not None:
                data["seed"] = str(seed)
            files = {f"input_image_{i}": (f"ref{i}.png", img, "image/png") for i, img in enumerate(refs)}
            # httpx needs a files entry to switch to multipart even without references
            form = {k: (None, v) for k, v in data.items()} | files
            sent |= {k: v for k, v in data.items() if k != "prompt"} | {"references": len(refs)}
            response = await self._client.post(url, files=form)
        else:
            body: dict[str, Any] = {"prompt": prompt}
            if profile.request_style == "json_png":
                body |= {"width": width, "height": height}
                if profile.steps:
                    body["num_steps"] = profile.steps
                if negative and profile.capabilities.get("supports_negative_prompt"):
                    body["negative_prompt"] = negative
                if seed is not None:
                    body["seed"] = seed
            elif profile.steps:  # json_b64 (FLUX.1 schnell): fixed 1024x1024, no seed in schema
                body["steps"] = profile.steps
            sent |= {k: v for k, v in body.items() if k != "prompt"}
            response = await self._client.post(url, json=body)

        if response.status_code != 200:
            raise CloudflareImageError(response.status_code, response.text[:500])
        seconds = time.perf_counter() - started
        return ImageCall(_image_bytes(profile, response), bool(refs), seconds, sent)


def _image_bytes(profile: ImageProfile, response: httpx.Response) -> bytes:
    if response.headers.get("content-type", "").startswith("image/"):
        return response.content
    body = response.json()
    image = (body.get("result") or {}).get("image") if isinstance(body, dict) else None
    if not image:
        raise CloudflareImageError(response.status_code, f"{profile.name}: no image in response")
    return base64.b64decode(image)


# Portraits are the reference images of every scene; FLUX.2 takes references under 512x512, so a
# portrait is drawn at that size instead of resized later (no image library in the service).
PORTRAIT_SIZE = 496
_SAFETY_HINTS = ("nsfw", "safety", "flagged", "inappropriate")


def to_ai_error(error: Exception) -> Exception:
    """Workers AI failure -> AiError with the right retry semantics for Node."""
    from app.errors import AiError

    if isinstance(error, httpx.TimeoutException):
        return AiError.timeout("Workers AI không phản hồi kịp.")
    if isinstance(error, CloudflareImageError):
        text = str(error).lower()
        if any(h in text for h in _SAFETY_HINTS):
            return AiError.safety_blocked("Ảnh bị bộ lọc của nhà cung cấp chặn.")
        if error.status == 429 or error.status >= 500:
            return AiError.provider_error(f"Workers AI tạm lỗi (HTTP {error.status}).")
        return AiError.invalid_input(f"Workers AI từ chối yêu cầu (HTTP {error.status}).")
    if isinstance(error, httpx.HTTPError):
        return AiError.provider_error("Không kết nối được Workers AI.")
    return error


class CloudflareImageProvider:
    """ImageProvider on Workers AI: one profile for portraits, one for scenes (IMAGE_PROFILE_*)."""

    name = "cloudflare"

    def __init__(self, client: CloudflareWorkersAI, portrait: ImageProfile, scene: ImageProfile,
                 *, scene_width: int = 1024, scene_height: int = 768):
        self._client = client
        self.portrait_profile = portrait
        self.scene_profile = scene
        self._scene_size = (scene_width, scene_height)
        self.model = scene.model if portrait.model == scene.model else f"{portrait.model}+{scene.model}"

    @property
    def accepts_references(self) -> bool:
        return self.scene_profile.supports_references

    async def aclose(self) -> None:
        await self._client.aclose()

    async def generate_portraits(self, req) -> list[bytes]:
        from app.core.image_prompts import NEGATIVE, portrait_prompt

        try:
            call = await self._client.generate(
                self.portrait_profile, portrait_prompt(req.description),
                width=PORTRAIT_SIZE, height=PORTRAIT_SIZE, negative=NEGATIVE,
            )
        except Exception as e:  # noqa: BLE001 - mapped to AiError below
            raise to_ai_error(e) from e
        return [call.image]

    async def generate_scene(self, req, references: list[bytes]) -> bytes:
        from app.core.image_prompts import NEGATIVE, scene_prompt

        profile = self.scene_profile
        referenced = min(len(references), profile.max_references) if profile.supports_references else 0
        with_ref = [c.description for c in req.characters if c.portrait_key][:referenced]
        rest = [c.description for c in req.characters if c.description not in with_ref]
        prompt = scene_prompt(req.scene_description, with_ref + rest, referenced=referenced, dialect=profile.dialect)
        width, height = self._scene_size
        try:
            call = await self._client.generate(
                profile, prompt, width=width, height=height, negative=NEGATIVE,
                references=references[:referenced],
            )
        except Exception as e:  # noqa: BLE001
            raise to_ai_error(e) from e
        return call.image


def image_format(data: bytes) -> tuple[str, str]:
    """(extension, content type) from the bytes; Workers AI returns PNG or JPEG."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return "png", "image/png"
