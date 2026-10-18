"""Request/response of /v1/images/portrait and /v1/images/scene (spec 5.6)."""

from pydantic import BaseModel

from app.schemas.common import FileSafeId, ForceableRequest, StorageKey, StrictModel, Usage


class PortraitRequest(ForceableRequest):
    request_id: FileSafeId
    storage_prefix: StorageKey
    description: str
    forbidden_terms: list[str]


class PortraitResponse(BaseModel):
    request_id: str
    portrait_keys: list[str]
    usage: Usage


class SceneCharacter(StrictModel):
    description: str
    portrait_key: StorageKey | None = None  # read back from storage, same rules as a prefix


class SceneRequest(ForceableRequest):
    request_id: FileSafeId
    storage_prefix: StorageKey
    scene_description: str
    characters: list[SceneCharacter]
    forbidden_terms: list[str]


class SceneResponse(BaseModel):
    request_id: str
    image_key: str
    reference_used: bool
    usage: Usage
