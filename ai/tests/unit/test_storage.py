import hashlib

import httpx
import pytest
import respx

from app.errors import AiError, ErrorCode
from app.storage import build_key
from app.storage.cloudinary import CloudinaryStorage, sign
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


# ---- Cloudinary --------------------------------------------------------------------------------

CLD = "https://api.cloudinary.com/v1_1/demo-cloud"


def _cld(folder: str = "sw") -> CloudinaryStorage:
    return CloudinaryStorage("demo-cloud", "key-123", "secret-abc", folder)


def _form(request: httpx.Request) -> dict[str, str]:
    """Plain fields of a multipart body (the file part is skipped)."""
    fields: dict[str, str] = {}
    boundary = request.headers["content-type"].split("boundary=")[1].encode()
    for part in request.content.split(b"--" + boundary):
        head, _, body = part.partition(b"\r\n\r\n")
        if b'name="' in head and b"filename=" not in head:
            name = head.split(b'name="')[1].split(b'"')[0].decode()
            fields[name] = body.rstrip(b"\r\n").decode()
    return fields


def test_cloudinary_sign_matches_docs_example() -> None:
    # Cloudinary docs: timestamp=1315060510, secret "abcd" -> SHA-1 of "timestamp=1315060510abcd"
    expected = hashlib.sha1(b"timestamp=1315060510abcd").hexdigest()
    assert sign({"timestamp": 1315060510}, "abcd") == expected
    # Sorted by name, joined with '&'
    assert sign({"b": 2, "a": 1}, "s") == hashlib.sha1(b"a=1&b=2s").hexdigest()


@respx.mock
async def test_cloudinary_upload_image_is_authenticated_and_signed() -> None:
    route = respx.post(f"{CLD}/image/upload").mock(return_value=httpx.Response(200, json={}))
    assert await _cld().upload("a/r1-1.png", b"x", "image/png") == "a/r1-1.png"
    form = _form(route.calls.last.request)
    assert form["public_id"] == "sw/a/r1-1"  # extension dropped for images
    assert form["type"] == "authenticated"  # no public delivery URL
    assert form["overwrite"] == "true"
    assert form["api_key"] == "key-123"
    signed = {k: v for k, v in form.items() if k not in {"signature", "api_key"}}
    assert form["signature"] == sign(signed, "secret-abc")


@respx.mock
async def test_cloudinary_upload_audio_goes_to_video_resource() -> None:
    route = respx.post(f"{CLD}/video/upload").mock(return_value=httpx.Response(200, json={}))
    await _cld(folder="").upload("n/r2-1.wav", b"x", "audio/wav")
    assert _form(route.calls.last.request)["public_id"] == "n/r2-1"


@respx.mock
async def test_cloudinary_upload_error_is_provider_error() -> None:
    respx.post(f"{CLD}/image/upload").mock(return_value=httpx.Response(401, text="bad key"))
    with pytest.raises(AiError) as ei:
        await _cld().upload("a/r1-1.png", b"x", "image/png")
    assert ei.value.code == ErrorCode.PROVIDER_ERROR


@respx.mock
async def test_cloudinary_download_signed_params() -> None:
    route = respx.get(f"{CLD}/image/download").mock(
        return_value=httpx.Response(200, content=b"png")
    )
    assert await _cld().download("a/r1-1.png") == b"png"
    params = dict(route.calls.last.request.url.params)
    assert params["public_id"] == "sw/a/r1-1"
    assert params["format"] == "png"
    assert params["type"] == "authenticated"
    signed = {k: v for k, v in params.items() if k not in {"signature", "api_key"}}
    assert params["signature"] == sign(signed, "secret-abc")


@respx.mock
async def test_cloudinary_download_404_is_invalid_input() -> None:
    respx.get(f"{CLD}/image/download").mock(return_value=httpx.Response(404, json={}))
    with pytest.raises(AiError) as ei:
        await _cld().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.INVALID_INPUT


@respx.mock
async def test_cloudinary_download_connect_error_is_provider_error() -> None:
    respx.get(f"{CLD}/image/download").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(AiError) as ei:
        await _cld().download("a/r1-1.png")
    assert ei.value.code == ErrorCode.PROVIDER_ERROR


def test_get_storage_prefers_cloudinary() -> None:
    from app.config import Settings
    from app.storage import get_storage, storage_backend_name

    both = Settings(
        cloudinary_cloud_name="c", cloudinary_api_key="k", cloudinary_api_secret="s",
        supabase_url="https://p.supabase.co", supabase_service_key="x",
    )
    assert get_storage(both).backend == "cloudinary"
    assert storage_backend_name(both) == "cloudinary"
    partial = Settings(cloudinary_cloud_name="c", cloudinary_api_key="k")  # no secret
    assert storage_backend_name(partial) == "local"
