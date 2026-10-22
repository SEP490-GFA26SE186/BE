from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.analyze import analyze_story
from app.core.story import generate_story
from app.deps import InternalAuth, SettingsDep, get_llm_provider, reject_force_unless_mock
from app.providers.llm.base import LLMProvider
from app.schemas.analyze import StoryAnalyzeRequest, StoryAnalyzeResponse
from app.schemas.story import StoryGenerateRequest, StoryGenerateResponse

router = APIRouter(prefix="/v1/story", tags=["story"], dependencies=[InternalAuth])


def checked_request(req: StoryGenerateRequest, settings: SettingsDep) -> StoryGenerateRequest:
    """Reject `__force` unless LLM_PROVIDER is mock, BEFORE the provider is built.

    A dependency (not a line in the endpoint body) so that it is solved before
    `get_llm_provider`: FastAPI solves an endpoint's dependencies in parameter order, and an
    AiError here stops the request before a real provider / client is ever constructed
    (spec 3.11.7, Review Focus 3).
    """
    reject_force_unless_mock(req.force_, settings.llm_provider)
    return req


@router.post("/generate")
async def generate(
    req: Annotated[StoryGenerateRequest, Depends(checked_request)],
    llm: Annotated[LLMProvider, Depends(get_llm_provider)],
    settings: SettingsDep,
) -> StoryGenerateResponse:
    return await generate_story(req, llm, settings)


def checked_analyze_request(
    req: StoryAnalyzeRequest, settings: SettingsDep
) -> StoryAnalyzeRequest:
    """Same `__force` gate as `checked_request`, solved before the provider is built."""
    reject_force_unless_mock(req.force_, settings.llm_provider)
    return req


@router.post("/analyze")
async def analyze(
    req: Annotated[StoryAnalyzeRequest, Depends(checked_analyze_request)],
    llm: Annotated[LLMProvider, Depends(get_llm_provider)],
    settings: SettingsDep,
) -> StoryAnalyzeResponse:
    return await analyze_story(req, llm, settings)
