from typing import Protocol

from app.schemas.images import PortraitRequest, SceneRequest


class ImageProvider(Protocol):
    name: str
    model: str

    async def generate_portraits(self, req: PortraitRequest) -> list[bytes]:
        """Two candidate portraits (PNG bytes for the mock)."""
        ...

    async def generate_scene(self, req: SceneRequest, references: list[bytes]) -> bytes: ...
