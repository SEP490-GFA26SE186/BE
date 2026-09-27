import time

from fastapi import APIRouter

from app.deps import InternalAuth
from app.providers import get_provider
from app.schemas.envelope import GenerateRequest, GenerateResponse

router = APIRouter(prefix="/v1/generate", tags=["generate"], dependencies=[InternalAuth])


@router.post("/story-page", response_model=GenerateResponse)
async def generate_story_page(request: GenerateRequest) -> GenerateResponse:
    """Sinh noi dung mot trang truyen + cac lua chon A/B/C.

    Tra JSON thuan, khong sinh file — day la mot trong hai CO CHE khac nhau cua
    service (co che con lai la narration: sinh binary roi upload Storage).
    """
    provider = get_provider()
    started = time.perf_counter()
    text = await provider.generate_story_page(request.input)
    latency_ms = int((time.perf_counter() - started) * 1000)

    return GenerateResponse(
        provider=provider.name,
        model=provider.model,
        result=text.result,
        usage=text.usage,
        latency_ms=latency_ms,
    )
