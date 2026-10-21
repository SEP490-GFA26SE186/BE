"""Workers AI image client: request shape per style + response decoding. No network (MockTransport)."""

import base64
import json

import httpx
import pytest

from app.providers.image.cloudflare import (
    CloudflareImageError,
    CloudflareWorkersAI,
    ImageProfile,
    load_profiles,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 20


def profile(style, *, refs=0, steps=None, negative=False) -> ImageProfile:
    return ImageProfile(
        name=f"p-{style}", model=f"@cf/test/{style}", request_style=style, dialect="natural",
        license="apache-2.0", steps=steps,
        capabilities={"supports_reference_images": refs > 0, "max_reference_images": refs,
                      "supports_negative_prompt": negative, "commercial_use": True},
    )


def client_with(handler):
    seen = []

    def capture(request: httpx.Request):
        seen.append(request)
        return handler(request)

    return CloudflareWorkersAI("acc123", "tok", transport=httpx.MockTransport(capture)), seen


async def test_json_b64_sends_prompt_and_steps_and_decodes_result():
    c, seen = client_with(lambda r: httpx.Response(200, json={"result": {"image": base64.b64encode(PNG).decode()}, "success": True}))
    res = await c.generate(profile("json_b64", steps=4), "a cat", references=[PNG])
    assert res.image == PNG and res.reference_used is False
    req = seen[0]
    assert req.url.path == "/client/v4/accounts/acc123/ai/run/@cf/test/json_b64"
    assert req.headers["authorization"] == "Bearer tok"
    assert json.loads(req.content) == {"prompt": "a cat", "steps": 4}


async def test_json_png_returns_raw_png_with_size_steps_negative_seed():
    c, seen = client_with(lambda r: httpx.Response(200, content=PNG, headers={"content-type": "image/png"}))
    res = await c.generate(profile("json_png", steps=6, negative=True), "a dog", width=512, height=640, seed=3, negative="text")
    assert res.image == PNG
    assert json.loads(seen[0].content) == {"prompt": "a dog", "width": 512, "height": 640, "num_steps": 6,
                                           "negative_prompt": "text", "seed": 3}


async def test_multipart_attaches_references_as_input_image_n_up_to_the_limit():
    c, seen = client_with(lambda r: httpx.Response(200, json={"result": {"image": base64.b64encode(PNG).decode()}}))
    res = await c.generate(profile("multipart", refs=2), "two friends", references=[PNG, PNG, PNG])
    assert res.reference_used is True
    body = seen[0].content
    assert seen[0].headers["content-type"].startswith("multipart/form-data")
    assert b'name="prompt"' in body and b"two friends" in body
    assert b'name="input_image_0"' in body and b'name="input_image_1"' in body
    assert b'name="input_image_2"' not in body  # capped at max_reference_images


async def test_multipart_without_references_is_still_multipart():
    c, seen = client_with(lambda r: httpx.Response(200, json={"result": {"image": base64.b64encode(PNG).decode()}}))
    res = await c.generate(profile("multipart", refs=4), "a house")
    assert res.reference_used is False
    assert seen[0].headers["content-type"].startswith("multipart/form-data")


async def test_http_error_and_missing_image_raise():
    c, _ = client_with(lambda r: httpx.Response(429, text="rate limited"))
    with pytest.raises(CloudflareImageError) as e:
        await c.generate(profile("json_b64"), "x")
    assert e.value.status == 429
    c, _ = client_with(lambda r: httpx.Response(200, json={"result": {}}))
    with pytest.raises(CloudflareImageError):
        await c.generate(profile("json_b64"), "x")


def test_profiles_file_loads_cloudflare_profiles_with_licenses():
    profiles = load_profiles()
    klein = profiles["cf-flux-2-klein-4b"]
    assert klein.request_style == "multipart" and klein.supports_references and klein.max_references == 4
    assert klein.commercial_use is True
    assert profiles["cf-flux-2-dev"].commercial_use is False
    assert profiles["cf-sdxl-base"].request_style == "json_png"


# --- CloudflareImageProvider (behind /v1/images/*) ---------------------------------------------

from types import SimpleNamespace  # noqa: E402

from app.errors import AiError, ErrorCode  # noqa: E402
from app.providers.image.cloudflare import PORTRAIT_SIZE, CloudflareImageProvider  # noqa: E402


def provider_with(handler, scene_refs=4):
    client, seen = client_with(handler)
    portrait = profile("multipart", refs=4)
    scene = profile("multipart", refs=scene_refs) if scene_refs else profile("json_png")
    return CloudflareImageProvider(client, portrait, scene, scene_width=1024, scene_height=768), seen


def b64_ok(_):
    return httpx.Response(200, json={"result": {"image": base64.b64encode(PNG).decode()}})


async def test_portrait_is_one_image_drawn_under_the_reference_limit_on_plain_background():
    p, seen = provider_with(b64_ok)
    images = await p.generate_portraits(SimpleNamespace(description="a 6-year-old boy in a blue T-shirt"))
    assert images == [PNG]
    body = seen[0].content
    assert f'name="width"\r\n\r\n{PORTRAIT_SIZE}'.encode() in body and PORTRAIT_SIZE < 512
    assert b"plain white background" in body and b"a 6-year-old boy in a blue T-shirt" in body


async def test_scene_sends_portraits_as_input_images_and_names_them_in_the_prompt():
    p, seen = provider_with(b64_ok)
    req = SimpleNamespace(scene_description="They play with a red train.", characters=[
        SimpleNamespace(description="a boy", portrait_key="k1"),
        SimpleNamespace(description="a grandmother", portrait_key="k2"),
        SimpleNamespace(description="a cat", portrait_key=None),
    ])
    assert await p.generate_scene(req, [PNG, PNG]) == PNG
    body = seen[0].content
    assert b'name="input_image_0"' in body and b'name="input_image_1"' in body
    assert b"the character in image 0 is a boy" in body and b"the character in image 1 is a grandmother" in body
    assert b"a cat" in body and b'name="width"\r\n\r\n1024' in body
    assert p.accepts_references is True


async def test_scene_on_a_model_without_references_describes_everyone_and_says_so():
    p, seen = provider_with(lambda r: httpx.Response(200, content=PNG, headers={"content-type": "image/png"}), scene_refs=0)
    req = SimpleNamespace(scene_description="A park.", characters=[SimpleNamespace(description="a boy", portrait_key="k1")])
    await p.generate_scene(req, [PNG])
    sent = json.loads(seen[0].content)
    assert "image 0" not in sent["prompt"] and "a boy" in sent["prompt"]
    assert p.accepts_references is False


@pytest.mark.parametrize(("response", "code"), [
    (httpx.Response(429, text="too many"), ErrorCode.PROVIDER_ERROR),
    (httpx.Response(503, text="busy"), ErrorCode.PROVIDER_ERROR),
    (httpx.Response(400, text="NSFW content flagged"), ErrorCode.SAFETY_BLOCKED),
    (httpx.Response(401, text="bad token"), ErrorCode.INVALID_INPUT),
])
async def test_workers_ai_errors_map_to_ai_errors(response, code):
    p, _ = provider_with(lambda r: response)
    with pytest.raises(AiError) as e:
        await p.generate_portraits(SimpleNamespace(description="x"))
    assert e.value.code == code


async def test_timeout_maps_to_timeout():
    def boom(request):
        raise httpx.ReadTimeout("slow", request=request)
    p, _ = provider_with(boom)
    with pytest.raises(AiError) as e:
        await p.generate_portraits(SimpleNamespace(description="x"))
    assert e.value.code == ErrorCode.TIMEOUT
