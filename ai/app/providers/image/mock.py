import struct
import zlib

from app.providers import raise_forced
from app.schemas.images import PortraitRequest, SceneRequest

# Fixed mock size, not configuration.
_SIZE = 64


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))


def solid_png(rgb: tuple[int, int, int], size: int = _SIZE) -> bytes:
    """A valid single-colour RGB PNG, built without Pillow."""
    row = b"\x00" + bytes(rgb) * size  # filter byte 0 + pixels
    raw = row * size
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(raw))
        + _chunk(b"IEND", b"")
    )


class MockImageProvider:
    name = "mock"
    model = "mock-image-v1"

    async def generate_portraits(self, req: PortraitRequest) -> list[bytes]:
        raise_forced(req.force_)
        return [solid_png((200, 160, 120)), solid_png((120, 160, 200))]

    async def generate_scene(self, req: SceneRequest, references: list[bytes]) -> bytes:
        raise_forced(req.force_)
        return solid_png((140, 200, 140))
