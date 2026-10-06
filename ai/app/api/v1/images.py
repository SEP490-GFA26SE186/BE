import time
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.guards import assert_no_forbidden_terms
from app.deps import (
    InternalAuth,
    get_image_provider,
    get_storage_dep,
    reject_force_unless_mock,
)
from app.providers.image.base import ImageProvider
from app.schemas.common import Usage
from app.schemas.images import PortraitRequest, PortraitResponse, SceneRequest, SceneResponse
from app.storage import Storage, build_key

router = APIRouter(prefix="/v1/images", tags=["images"], dependencies=[InternalAuth])

StorageDep = Annotated[Storage, Depends(get_storage_dep)]
ImageDep = Annotated[ImageProvider, Depends(get_image_provider)]


def _usage(provider: ImageProvider, units: int, started: float) -> Usage:
    return Usage(
        provider=provider.name,
        model=provider.model,
        units=units,
        latency_ms=int((time.monotonic() - started) * 1000),
    )


@router.post("/portrait")
async def portrait(
    req: PortraitRequest, provider: ImageDep, storage: StorageDep
) -> PortraitResponse:
    started = time.monotonic()
    reject_force_unless_mock(req.force_, provider.name)
    assert_no_forbidden_terms({"description": req.description}, req.forbidden_terms)
    images = await provider.generate_portraits(req)
    keys = [
        await storage.upload(
            build_key(req.storage_prefix, req.request_id, n, "png"), data, "image/png"
        )
        for n, data in enumerate(images, start=1)
    ]
    return PortraitResponse(
        request_id=req.request_id,
        portrait_keys=keys,
        usage=_usage(provider, len(images), started),
    )


@router.post("/scene")
async def scene(req: SceneRequest, provider: ImageDep, storage: StorageDep) -> SceneResponse:
    started = time.monotonic()
    reject_force_unless_mock(req.force_, provider.name)
    texts = {"scene_description": req.scene_description}
    for i, character in enumerate(req.characters, start=1):
        texts[f"characters[{i}].description"] = character.description
    assert_no_forbidden_terms(texts, req.forbidden_terms)
    references = [
        await storage.download(c.portrait_key) for c in req.characters if c.portrait_key
    ]
    data = await provider.generate_scene(req, references)
    key = await storage.upload(
        build_key(req.storage_prefix, req.request_id, 1, "png"), data, "image/png"
    )
    return SceneResponse(
        request_id=req.request_id,
        image_key=key,
        reference_used=bool(references),
        usage=_usage(provider, 1, started),
    )
