import time

from fastapi import APIRouter

from app.deps import InternalAuth
from app.providers import get_provider
from app.schemas.envelope import GenerateRequest, GenerateResponse
from app.storage import get_storage

router = APIRouter(prefix="/v1/generate", tags=["generate"], dependencies=[InternalAuth])

_CONTENT_TYPE_BY_EXTENSION = {"wav": "audio/wav", "mp3": "audio/mpeg"}


@router.post("/narration", response_model=GenerateResponse)
async def generate_narration(request: GenerateRequest) -> GenerateResponse:
    """Sinh audio ke truyen (TTS) roi upload len Storage.

    `storagePrefix` la chuoi opaque do Node quyet dinh — endpoint chi noi them
    ten file vao sau, khong parse noi dung ben trong.
    """
    provider = get_provider()
    storage = get_storage()

    started = time.perf_counter()
    audio = await provider.synthesize_narration(request.input)
    key = await storage.upload(
        f"{request.storage_prefix.rstrip('/')}/narration.{audio.extension}",
        audio.audio,
        _CONTENT_TYPE_BY_EXTENSION.get(audio.extension, "application/octet-stream"),
    )
    latency_ms = int((time.perf_counter() - started) * 1000)

    return GenerateResponse(
        provider=provider.name,
        model=provider.model,
        result={**audio.result, "audioKey": key},
        usage=audio.usage,
        latency_ms=latency_ms,
    )
