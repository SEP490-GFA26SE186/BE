import httpx
import pytest
import respx

from app.errors import AiError, ErrorCode
from app.storage import build_key
from app.storage.local import LocalStorage
from app.storage.supabase import SupabaseStorage

# respx patches httpx at the transport layer, before any socket is opened, so the network guard
# in conftest never fires. A normal https host is used; no loopback host was needed.
BASE = "https://proj.supabase.co"
OBJ = f"{BASE}/storage/v1/object/bkt/a/r1-1.png"


def test_build_key() -> None:
    assert build_key("a/b/", "r1", 2, "png") == "a/b/r1-2.png"
    assert build_key("a/b", "r1", 1, "wav") == "a/b/r1-1.wav"


async def test_local_roundtrip_and_overwrite(tmp_path) -> None:
    s = LocalStorage(str(tmp_path))
    assert s.backend == "local"
    await s.upload("p/k.png", b"one", "image/png")
    assert await s.download("p/k.png") == b"one"
    await s.upload("p/k.png", b"two", "image/png")
    assert await s.download("p/k.png") == b"two"
    assert [f.name for f in (tmp_path / "p").iterdir()] == ["k.png"]


async def test_local_download_missing(tmp_path) -> None:
    with pytest.raises(AiError) as ei:
        await LocalStorage(str(tmp_path)).download("nope/x.png")
    assert ei.value.code == ErrorCode.INVALID_INPUT


def _sb() -> SupabaseStorage:
    return SupabaseStorage(BASE, "svc-key", "bkt")


@respx.mock
async def test_supabase_upload_headers() -> None:
    route = respx.post(OBJ).mock(return_value=httpx.Response(200, json={}))
    assert await _sb().upload("a/r1-1.png", b"x", "image/png") == "a/r1-1.png"
    req = route.calls.last.request
    assert req.headers["x-upsert"] == "true"
    assert req.headers["authorization"] == "Bearer svc-key"


@respx.mock
async def test_supabase_download_ok() -> None:
    route = respx.get(OBJ).mock(return_value=httpx.Response(200, content=b"bytes"))
    assert await _sb().download("a/r1-1.png") == b"bytes"
    assert route.calls.last.request.headers["authorization"] == "Bearer svc-key"


@respx.mock
async def test_supabase_download_404_is_invalid_input() -> None:
    respx.get(OBJ).mock(return_value=httpx.Response(404, json={"error": "not_found"}))
    with pytest.raises(AiError) as ei:
        await _sb().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.INVALID_INPUT


@respx.mock
async def test_supabase_download_400_not_found_is_invalid_input() -> None:
    # Supabase Storage may answer a missing object with HTTP 400 and a 404 inside the body.
    respx.get(OBJ).mock(
        return_value=httpx.Response(
            400, json={"statusCode": "404", "error": "not_found", "message": "Object not found"}
        )
    )
    with pytest.raises(AiError) as ei:
        await _sb().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.INVALID_INPUT


@respx.mock
async def test_supabase_download_500_is_provider_error() -> None:
    respx.get(OBJ).mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(AiError) as ei:
        await _sb().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.PROVIDER_ERROR


@respx.mock
async def test_supabase_download_connect_error_is_provider_error() -> None:
    respx.get(OBJ).mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(AiError) as ei:
        await _sb().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.PROVIDER_ERROR
