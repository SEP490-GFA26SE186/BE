# ai/

Service sinh noi dung AI cua StoryWeaver. **Stateless**: khong DB, khong Redis,
khong biet gi ve user hay credit.

No chi lam: nhan prompt -> goi provider -> (neu la binary) upload len Supabase
Storage -> tra ve path + so lieu `usage`.

Hop dong voi Node: [`../docs/contracts/ai-service.md`](../docs/contracts/ai-service.md).

## Chay doc lap

```bash
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload    # http://localhost:8000/docs
uv run pytest
```

Chua co `uv`: https://docs.astral.sh/uv/getting-started/installation/

## Thu bang curl (khong can Node)

```bash
curl -s localhost:8000/v1/generate/story-page \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Token: dev-internal-token-doi-truoc-khi-deploy' \
  -d '{"jobId":"t1","idempotencyKey":"k1","storagePrefix":"stories/demo/pages/1","input":{"age":5}}'

# Kich loi "bi chan" de ben Node test nhanh khong-retry:
curl -s localhost:8000/v1/generate/story-page \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Token: dev-internal-token-doi-truoc-khi-deploy' \
  -d '{"jobId":"t2","idempotencyKey":"k2","storagePrefix":"x","input":{"__force":"blocked"}}'
```

## Them mot loai noi dung moi

1. Them method vao `Provider` (`app/providers/base.py`) + hien thuc trong `mock.py`.
2. Them router trong `app/api/v1/`, dang ky o `app/main.py`.
3. Ben Node: them ten job vao `src/queues/ai.jobs.js` va endpoint vao
   `ENDPOINT_BY_JOB` trong `src/clients/aiClient.js`.
4. Cap nhat `docs/contracts/ai-service.md`.

## Cac quy tac khong duoc pha

- **Khong import thu vien DB, khong doc `DATABASE_URL`.** Service nay khong duoc
  cap bien do trong docker-compose.
- **Khong tu dat HTTP status code trong endpoint.** Chi `raise AiError.<loai>()`;
  viec doi thanh status code do exception handler o `main.py` lam, de bang loi
  chi ton tai o mot cho.
- **Khong parse `storagePrefix`.** Do la chuoi opaque cua Node.
- **Khong dedupe theo `idempotencyKey`.** Service stateless, khong lam duoc.
