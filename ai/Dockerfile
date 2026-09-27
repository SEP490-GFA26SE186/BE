# syntax=docker/dockerfile:1

# =============================================================================
# services/ai — StoryWeaver AI inference service (FastAPI)
#
# Service nay STATELESS: khong co DB, khong co Redis, khong biet gi ve user hay
# credit. No chi nhan prompt -> goi provider -> (neu la binary) upload len
# Supabase Storage -> tra ve path + usage.
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
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY app ./app

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
