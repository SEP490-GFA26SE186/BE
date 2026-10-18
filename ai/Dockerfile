# syntax=docker/dockerfile:1

# =============================================================================
# ai/ — StoryWeaver AI inference service (FastAPI)
#
# Service nay STATELESS: khong co DB, khong co Redis, khong biet gi ve user hay
# credit. No chi nhan request -> goi provider -> (neu la anh / audio) upload len
# Storage (Supabase hoac LocalStorage) -> tra ve KEY + usage (khong tra bytes).
# =============================================================================

FROM python:3.12-slim AS runtime

# uv: cai dependency tu uv.lock, nhanh hon pip dang ke va khong can venv ceremony
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Cai deps truoc khi copy source: layer nay duoc cache lai khi chi sua code
# AI_EXTRAS=tts -> cai them VieNeu-TTS (TTS_PROVIDER=vieneu). Mac dinh rong: image nho, chi mock.
ARG AI_EXTRAS=""
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project ${AI_EXTRAS:+--extra ${AI_EXTRAS}}

COPY app ./app

RUN useradd --create-home --uid 10001 appuser  && mkdir -p /home/appuser/.cache/huggingface && chown -R appuser /home/appuser/.cache
USER appuser
# Model VieNeu tai ve day lan dau; compose mount volume vao de khong tai lai moi lan tao container.
# HF_HUB_DISABLE_SYMLINKS: cache luu file THAT. Mac dinh tren Linux snapshot la symlink sang blobs/,
# va onnxruntime tu choi file trong so (external data) "nam ngoai thu muc model" -> khong nap duoc.
ENV HF_HOME=/home/appuser/.cache/huggingface     HF_HUB_DISABLE_SYMLINKS=1

EXPOSE 8000

# start-period 180s: TTS_PROVIDER=vieneu nap model ~15 s (lan dau con tai ~580 MB) truoc khi phuc vu.
HEALTHCHECK --interval=15s --timeout=3s --start-period=180s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
