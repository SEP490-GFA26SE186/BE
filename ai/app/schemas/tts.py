"""Request/response of /v1/tts/synthesize (spec 5.6)."""

from pydantic import BaseModel

from app.schemas.common import FileSafeId, ForceableRequest, StorageKey, Usage


class TtsRequest(ForceableRequest):
    request_id: FileSafeId
    storage_prefix: StorageKey
    text: str
    voice_id: str


class TtsResponse(BaseModel):
    request_id: str
    audio_key: str
    duration_seconds: float
    usage: Usage
