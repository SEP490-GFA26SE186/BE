import math
import time
from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import InternalAuth, get_storage_dep, get_tts_provider, reject_force_unless_mock
from app.providers.tts.base import TTSProvider
from app.schemas.common import Usage
from app.schemas.tts import TtsRequest, TtsResponse
from app.storage import Storage, build_key

router = APIRouter(prefix="/v1/tts", tags=["tts"], dependencies=[InternalAuth])


@router.post("/synthesize")
async def synthesize(
    req: TtsRequest,
    provider: Annotated[TTSProvider, Depends(get_tts_provider)],
    storage: Annotated[Storage, Depends(get_storage_dep)],
) -> TtsResponse:
    # No real-name guard here: TTS is exempt (spec 5.6). `req.text` is never logged.
    started = time.monotonic()
    reject_force_unless_mock(req.force_, provider.name)
    audio, duration = await provider.synthesize(req)
    key = await storage.upload(
        build_key(req.storage_prefix, req.request_id, 1, "wav"), audio, "audio/wav"
    )
    return TtsResponse(
        request_id=req.request_id,
        audio_key=key,
        duration_seconds=duration,
        usage=Usage(
            provider=provider.name,
            model=provider.model,
            units=math.ceil(duration),
            latency_ms=int((time.monotonic() - started) * 1000),
        ),
    )
