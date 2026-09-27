from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.schemas.envelope import Usage


@dataclass(slots=True)
class TextResult:
    result: dict[str, Any]
    usage: Usage


@dataclass(slots=True)
class AudioResult:
    audio: bytes
    extension: str
    # Metadata di kem (vd. durationMs). `audioKey` do endpoint them vao sau khi
    # upload — provider khong biet gi ve Storage.
    result: dict[str, Any]
    usage: Usage


@runtime_checkable
class Provider(Protocol):
    """Giao dien cua mot nha cung cap AI.

    Dung Protocol chu khong phai class cha: mock va gemini khong dung chung
    mot dong implementation nao, chi can khop chu ky. Cam mot provider moi vao
    chi phai them mot file trong app/providers/.
    """

    name: str
    model: str | None

    async def generate_story_page(self, payload: dict[str, Any]) -> TextResult: ...

    async def synthesize_narration(self, payload: dict[str, Any]) -> AudioResult: ...
