# StoryWeaver AI — Backend

> **Dev mới clone về:** làm theo [SETUP.md](SETUP.md) — Postgres local + API/worker trong Docker,
> AI chạy trên máy với Claude CLI (`claude_code`) và VieNeu-TTS. File này là tài liệu tham khảo chi tiết.

Backend gồm **hai source riêng biệt** trong cùng một repo:

| Thư mục | Ngôn ngữ | Trách nhiệm |
|---|---|---|
| `api/` | Node 22 / Express 5 / Prisma | Nghiệp vụ: auth, CRUD, thương mại, webhook, **và BullMQ worker** |
| `ai/` | Python 3.12 / FastAPI | Sinh nội dung AI (văn bản / ảnh / TTS). Stateless, **không đọc DB** |

Database dùng chung là **Supabase** (đám mây). Lúc dev nên chạy **Postgres local trong
Docker** (`docker-compose.localdb.yml`, xem [DB local](#db-local--khuyên-dùng-khi-dev)) vì
qua Supabase mỗi truy vấn mất gần 1 giây. Queue là **Redis + BullMQ**, nằm hoàn toàn ở phía Node.

---

## Clone về và chạy — chỉ cần Docker

**Không cần cài Node, không cần cài Python.** Chỉ cần Docker Desktop đang chạy.

```bash
git clone https://github.com/SEP490-GFA26SE186/BE.git
cd BE
cp .env.example .env          # BƯỚC BẮT BUỘC — xem bên dưới
docker compose up --build
```

`--build` chỉ cần ở lần đầu (hoặc khi có người sửa Dockerfile / thêm
dependency). Sau đó `docker compose up` là đủ.

Lệnh này chạy ở **chế độ giống production**: code nằm trong image, không hot
reload, cổng của service `ai` không mở ra ngoài. Nếu bạn sắp **viết code** thì
đọc mục [Chế độ dev](#chế-độ-dev--hot-reload) bên dưới.

> Lần đầu sẽ mất khá lâu nếu máy chưa có base image `node:22-slim` và
> `python:3.12-slim` — phải tải thêm vài trăm MB. Đừng tưởng là bị treo.

### Trong `.env` phải điền gì

Chỉ **2 biến** là bắt buộc để chạy được, lấy ở Supabase Dashboard →
Project Settings → Database → Connection string:

| Biến | Lấy ở đâu |
|---|---|
| `DATABASE_URL` | Connection pooling, port **6543** |
| `DIRECT_URL` | Direct connection, port **5432** (dùng cho migration) |

`JWT_SECRET` và `INTERNAL_TOKEN` đã có giá trị dev sẵn trong `.env.example`,
đổi trước khi deploy là được.

**Không cần API key AI.** Mặc định `LLM_PROVIDER=mock` và `TTS_PROVIDER=mock` — trả truyện giả
nhưng đúng khung request và đi qua validator thật, đủ để chạy trọn luồng từ đầu đến cuối. Đặt
`LLM_PROVIDER=gemini` + `GEMINI_API_KEY` + `GEMINI_TEXT_MODEL` mới gọi Gemini thật (tốn tiền).

Nếu quên tạo `.env`, compose **dừng lại ngay** và nói rõ thiếu biến nào:

```
error while interpolating services.api.environment.DATABASE_URL:
  required variable DATABASE_URL is missing a value: can DATABASE_URL trong .env o root
```

### Chạy migration

Chạy ngay trong container, không cần Node trên máy:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma migrate status    # kiểm tra lại
docker compose exec api npx prisma db seed           # eq_skills + topics
```

Migration **phải** đi qua `DIRECT_URL` (port **5432**). Port 6543 là pgbouncer ở
chế độ transaction, nó không giữ session nên Prisma migrate sẽ lỗi.

### `ai` chạy ngoài Docker — chữ thật bằng Claude CLI + giọng đọc VieNeu (chỉ dev)

Container `ai` mặc định là **mock**: chữ là vài câu cố định lặp lại (các trang gần như y hệt nhau,
không có mạch truyện) — chỉ để chạy thử luồng. Muốn truyện thật mà không có `ANTHROPIC_API_KEY`, chạy
`ai` trên máy với `LLM_PROVIDER=claude_code` (dùng CLI `claude` đang đăng nhập; image không có CLI).
VieNeu cũng nhanh gấp ~2 lần khi chạy thẳng trên Windows (trang 51 tiếng: 17 s so với 31–38 s).

```bash
# 1. Một lần: venv Python 3.12 (VieNeu chỉ hỗ trợ 3.10–3.13)
cd ai
py -3.12 -m venv .venv312          # hoặc python 3.12 do uv cài
.venv312/Scripts/python -m pip install -e ".[tts,claude-code]"
# ai/.env: INTERNAL_TOKEN (bằng BE/.env), LLM_PROVIDER=claude_code, LLM_CLAUDE_MODEL=sonnet,
#          LLM_CLAUDE_EFFORT=low, LLM_THINKING_BUDGET=12000, LLM_CLAUDE_CLI_PATH=<...\claude.exe>,
#          TTS_PROVIDER=vieneu, CLOUDINARY_* (xem ai/README "Claude", "TTS")

# 2. Mỗi lần dev: chạy ai trên máy, cổng 8001
.venv312/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001

# 3. Worker trong Docker gọi sang máy: thêm docker-compose.hostai.yml vào COMPOSE_FILE (.env)
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml;docker-compose.localdb.yml;docker-compose.hostai.yml
docker compose up -d
```

`curl localhost:8001/health` phải báo `"llm_provider":"claude_code"` và `"tts_provider":"vieneu"`.
Container `ai` vẫn chạy (worker phụ thuộc nó) nhưng không ai gọi — đặt `TTS_PROVIDER=mock` trong `.env`
để nó khỏi nạp model giọng đọc. **Không dùng `claude_code` để phục vụ người dùng thật** (gói CLI là
dùng cá nhân); production dùng `LLM_PROVIDER=claude` + API key.

### DB local — khuyên dùng khi dev

Qua pooler Supabase mỗi truy vấn mất ~600–900 ms (editor lưu một trang 3–19 s, có lúc 500
vì quá thời gian transaction). Postgres chạy cùng máy chỉ ~1 ms, API trả về trong 20–50 ms.

```bash
# Gộp thêm file localdb (thêm dòng COMPOSE_FILE vào .env cho đỡ gõ — xem mục Chế độ dev)
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.localdb.yml up -d
# Lần đầu, và mỗi khi có migration mới: tạo bảng + chủ đề, kỹ năng EQ, platform_settings + tài khoản demo
docker compose exec api npm run db:setup
```

- `DATABASE_URL` / `DIRECT_URL` của api + worker bị file này **ghi đè** sang container
  `postgres`, nên `.env` vẫn giữ link Supabase được. Bỏ file localdb ra là quay lại Supabase.
- Cổng 5432 mở ra máy để dùng Prisma Studio / DBeaver
  (`postgresql://storyweaver:storyweaver@localhost:5432/storyweaver`). Máy đã có Postgres
  chiếm 5432 thì đặt `POSTGRES_HOST_PORT=5433` trong `.env`.
- Dữ liệu nằm trong volume `pg-data`. `docker compose down -v` **xoá sạch**, chạy lại
  `db:setup` là có lại dữ liệu mẫu. Ở đây được dùng `prisma migrate reset` thoải mái.
- Mỗi người một DB riêng, không thấy dữ liệu test của nhau. Dữ liệu demo cần dùng chung
  thì thêm vào `api/prisma/seed_demo.js`.
- Sửa `package.json` (thêm script / dependency) thì phải `up --build`: chế độ dev chỉ
  mount `src/`, `prisma/`, `scripts/`.

#### Hai điều cần biết khi làm việc với Supabase

**1. Đừng dùng `prisma migrate reset` trên Supabase.** Nó cố xoá mọi thứ nó thấy
và sẽ vướng quyền với các schema hệ thống (`auth`, `storage`, `realtime`). Muốn
dựng lại DB từ đầu thì chạy đoạn này trong Supabase SQL Editor rồi
`migrate deploy` lại:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;
```

**2. Cảnh báo "RLS disabled in public" là đúng thiết kế — đừng bật RLS.**
Supabase Advisor sẽ báo đỏ cả 44 bảng. Chúng ta không dùng Supabase Auth: API tự
xác thực bằng JWT riêng và kết nối bằng role `postgres`. Bật RLS lên sẽ không
chặn được gì (role `postgres` bypass) nhưng sẽ làm vỡ mọi truy vấn nếu ai đó
đồng thời đổi sang role `anon`/`authenticated`.

### Kiểm tra đã chạy đúng

```bash
docker compose ps                      # cả 4 service phải là (healthy)
curl localhost:3000/api/v1/health      # {"status":"ok",...}
```

Đẩy thử một AI job qua queue — xem mục **Kiểm đầu-cuối** ở cuối file
bên dưới. Đó là bài kiểm quan trọng nhất: nó đi qua **toàn bộ** chuỗi — enqueue → Redis → BullMQ →
worker → HTTP sang FastAPI → ghi DB. Nếu nó `succeeded` thì cả hệ đã nối đúng.

| Địa chỉ | Là gì |
|---|---|
| http://localhost:3000/api/v1/health | API health |
| http://localhost:3000/api-docs | Swagger |

Service `ai` **không** mở cổng ra ngoài ở chế độ mặc định — chỉ `worker` trong
mạng nội bộ của compose gọi được. Muốn mở `http://localhost:8000/docs` để debug
thì chạy ở chế độ dev.

### Chế độ dev — hot reload

Có `docker-compose.dev.yml` thêm bind mount + hot reload + mở cổng 8000. Compose
**không tự đọc** file này, phải truyền tường minh:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Nhờ vậy `docker compose up` mặc định luôn giống production — không ai vô tình
deploy kèm hot reload hay kèm cổng 8000 mở ra ngoài. Đổi lại thì gõ dài hơn.

Nếu bạn làm dev cả ngày và không muốn gõ lại mỗi lần, thêm dòng này vào `.env`
**của riêng bạn** (file này không commit nên không ảnh hưởng người khác):

```bash
# Windows — dấu phân cách là  ;
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml
# … hoặc kèm DB local:
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml;docker-compose.localdb.yml

# Linux / macOS — dấu phân cách là  :
COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml
```

Sau đó `docker compose up` sẽ tự chạy chế độ dev. Lưu ý dấu phân cách khác nhau
theo hệ điều hành — dùng sai thì Compose báo không tìm thấy file.

Ở chế độ dev có thêm: http://localhost:8000/docs (FastAPI docs).

### Các lệnh hay dùng

```bash
docker compose logs -f worker      # xem job chạy
docker compose restart worker      # restart một service
docker compose down                # tắt
docker compose down -v             # tắt + xoá data Redis (job đang chờ sẽ mất)
docker compose up --build api      # rebuild riêng một service
```

Các lệnh trên **không cần** `-f` dù bạn đang chạy chế độ dev: compose tìm
container theo tên project (`storyweaver`, khai báo trong `docker-compose.yml`).
Chỉ `up` mới cần truyền file.

---

## Chạy cả hệ thống với dữ liệu demo (BE + AI + Web)

Ba repo nằm cạnh nhau: `BE/`, `Web/`. Lộ trình tích hợp: [`docs/roadmap-tich-hop.md`](docs/roadmap-tich-hop.md).

```bash
# 1. BE + AI (repo này) — như mục "Clone về và chạy" ở trên
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run db:seed          # chủ đề, kỹ năng EQ, platform_settings
docker compose exec api npm run db:seed:demo     # tài khoản demo (KHÔNG chạy trên production)

# 2. Web (repo Web/, terminal khác)
cd ../Web
cp .env.example .env        # VITE_API_URL=/api/v1 — Vite proxy chuyển /api sang localhost:3000
npm install
npm run dev                 # http://localhost:5173
```

`db:seed:demo` tạo đúng các tài khoản trong `Web/docs/DEMO_ACCOUNTS.md` (mật khẩu chung `123456`,
PIN Kid Mode `1234`), cấp 50 credit cho phụ huynh (một lần, qua sổ cái `credit_grant`), một bé
"Bin" kèm nhân vật của bé và nhân vật "Bà". Chạy lại nhiều lần không nhân đôi dữ liệu, chỉ đặt lại mật
khẩu / PIN về mặc định.

AI chữ mặc định là mock (truyện mẫu hợp lệ, không tốn tiền). Muốn AI thật: `LLM_PROVIDER=claude` +
`ANTHROPIC_API_KEY` trong container, hoặc chạy `ai/` ngoài Docker với `claude_code` trên máy dev —
xem `ai/README.md` mục "Claude".

---

## Ai gọi ai

```
Client ──> api (Express)          chỉ gọi ai/ trực tiếp cho /v1/story/analyze
             │  tạo bản ghi job + reserve credit
             ↓
           BullMQ (Redis)         attempts=3, backoff exponential 2s
             │
             ↓
           worker (Node)          CÙNG image với api, khác command; job chỉ mang { ai_request_id }
             │  đọc DB -> dựng payload -> POST http://ai:8000/v1/story/generate
             │  (ảnh: /v1/images/portrait, /v1/images/scene; giọng: /v1/tts/synthesize)
             ↓
           ai (FastAPI)  ──> provider (Claude cho chữ, Gemini còn trong code / mock; ảnh + TTS: mock)
             │             └──> Cloudinary / Supabase Storage (ảnh / audio — ai upload, trả key)
             ↓
           worker ghi kết quả vào DB + chốt / hoàn credit
```

Vì sao phải vòng qua queue thay vì để API gọi thẳng Python: nếu AI chậm hoặc
sập thì job nằm lại trong queue và được retry, còn API vẫn trả request bình
thường. Đây chính là yêu cầu "tải AI không được kéo sập core".

Chi tiết hợp đồng HTTP: [`docs/contracts/ai-service.md`](docs/contracts/ai-service.md).

---

## Biến môi trường — ai được nhận gì

Chỉ có **một** file `.env` ở root. `docker-compose.yml` phân phối cho từng
service, và **cố ý không** dùng `env_file` một dòng: làm vậy thì container `ai`
sẽ nhận luôn `DATABASE_URL` và `JWT_SECRET`, phá vỡ biên "Python chỉ được dùng
Storage". Bảng này vừa là cấu hình vừa là tài liệu kiến trúc.

| Biến | api | worker | ai |
|---|:--:|:--:|:--:|
| `DATABASE_URL`, `DIRECT_URL` | ✓ | ✓ | — |
| `JWT_SECRET`, `JWT_*` | ✓ | — | — |
| `BREVO_*`, `CORS_ORIGIN`, `APP_URL` | ✓ | — | — |
| `REDIS_URL` | ✓ | ✓ | — |
| `AI_SERVICE_URL` | ✓ | ✓ | — |
| `INTERNAL_TOKEN` | ✓ | ✓ | ✓ |
| `AI_TIMEOUT_MS_<JOB>`, `AI_JOB_ATTEMPTS`, `AI_WORKER_CONCURRENCY` | — | ✓ | — |
| `LLM_PROVIDER`, `TTS_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, `LLM_*`, `TOKENS_PER_WORD`, `PRICE_TEXT_*` | — | — | ✓ |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER` | ✓ | — | ✓ |
| `CLOUDINARY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | — | — | ✓ |

Hai ô đáng chú ý:

- Sinh nội dung (chữ, ảnh, giọng đọc) **luôn** đi qua queue. `api` chỉ gọi thẳng `ai` cho một
  việc: phân tích lời kể (`POST /stories/analyze` → `/v1/story/analyze`), ngắn và không trừ credit.
- `ai` **không** có `DATABASE_URL` → Python không thể query DB dù có muốn.
  Kiểm tra bằng lệnh: `docker compose exec ai env | grep DATABASE_URL`
  (kết quả phải rỗng).

---

## Chạy ngoài Docker

Hai cách chạy dùng **hai file env khác nhau**, vì tên host khác nhau
(`redis:6379` trong Docker, `localhost:6379` ở ngoài).

```bash
# Node
cd api/
cp .env.example .env        # sửa REDIS_URL=redis://localhost:6379
npm install
npm run db:generate
npm run dev                 # HTTP server
npm run worker:dev          # worker, mở terminal khác

# Python
cd ai/
cp .env.example .env        # LLM_PROVIDER=mock mặc định; KHÔNG đặt gemini nếu không định tốn tiền
uv sync                     # cài uv: https://docs.astral.sh/uv/getting-started/installation/
uv run uvicorn app.main:app --reload
```

Chạy ngoài Docker vẫn cần Redis. Cách nhanh nhất là bật riêng nó lên:
`docker compose up redis`.

---

## Test

```bash
cd api/ && npm test          # node:test — aiClient, processor, lib; integration bỏ qua nếu không có TEST_DATABASE_URL
cd ai/  && uv run pytest     # pytest — không chạm mạng; gồm tests/api/test_node_contract.py (payload y hệt Node)
```

---

## Cấu trúc

```
BE/
├── docker-compose.yml           # base, giống production
├── docker-compose.dev.yml       # dev: bind mount + hot reload (phải truyền -f)
├── .env.example
├── docs/
│   ├── contracts/ai-service.md  # HỢP ĐỒNG Node <-> Python
│   └── db/                      # NGUỒN SỰ THẬT của schema
│       ├── schema_rev8.dbml     #   dán vào dbdiagram.io để xem ERD
│       └── schema-guide.md      #   cách đọc, máy trạng thái, ràng buộc, cron
├── api/                         # service Node — build thành image
│   ├── Dockerfile
│   ├── prisma/                  # bản DẪN XUẤT từ docs/db/ + migrations
│   ├── scripts/                 # enqueue-ai-job.js — đẩy job thử bằng tay
│   ├── tests/                   # node:test
│   └── src/
│       ├── server.js            # entrypoint HTTP
│       ├── worker.js            # entrypoint BullMQ
│       ├── healthcheck.worker.js
│       ├── queues/              # ai.jobs.js (hằng số) + ai.queue.js (Queue)
│       ├── clients/             # aiClient.js — gọi service ai
│       ├── workers/             # ai.processor.js
│       └── modules/             # 18 module nghiệp vụ
└── ai/                          # service Python — build thành image
    ├── CLAUDE.md                # ngữ cảnh + quy ước của service ai
    ├── docs/                    # 00-product-overview … 09-roadmap, samples/
    ├── Dockerfile
    ├── pyproject.toml  uv.lock
    ├── tests/                   # pytest
    └── app/
        ├── main.py              # FastAPI + exception handler
        ├── errors.py            # bảng phân loại lỗi
        ├── api/v1/              # story.py, images.py, tts.py
        ├── core/                # orchestrator, validator, prompt, guards, usage
        ├── providers/           # llm/ (mock, gemini, claude, claude_code), image/ (mock), tts/ (mock)
        └── storage/             # supabase, local (dự phòng)
```

---

## Kiểm đầu-cuối (queue → worker → ai → DB)

Cần `.env` ở root có `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `INTERNAL_TOKEN`; DB đã migrate +
seed (`platform_settings` có `ai_cost.story_text`); một truyện `medium` đã có khung (trang + điểm dừng)
và chủ truyện còn credit. **Script ghi thật vào DB đang cấu hình và trừ credit thật** — dùng DB test
riêng, đừng chạy trên DB Supabase dùng chung của nhóm.

```bash
# 1. Chạy toàn bộ với mock (không gọi Gemini)
LLM_PROVIDER=mock docker compose up --build -d
docker compose exec ai env | grep -E "DATABASE_URL|REDIS_URL"   # phải RỖNG

# 2. Nhánh thành công
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId>
docker compose logs worker --tail 20        # job succeeded; GET /api/v1/stories/<storyId>/generation

# 3. Các nhánh lỗi (cờ --force chỉ có tác dụng khi NODE_ENV != production và provider là mock)
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId> --force SAFETY_BLOCKED
#    -> dừng ở attempt 1/3 (KHÔNG có attempt 2, 3); ai_request `blocked`; credit hoàn
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId> --force INVALID_OUTPUT_ONCE
#    -> succeeded (service tự thử lại nội bộ, usage.attempts = 2)
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId> --force PROVIDER_ERROR
#    -> retry có backoff tới attempt 3/3 rồi `failed`; credit hoàn
```

Mỗi lần chạy tạo một `ai_request` mới cho cùng truyện; truyện đang sinh dở thì `startGeneration` từ
chối — chờ lần trước kết thúc. Kiểm tương thích **không cần DB** (payload Node thật → ai/ mock →
`planPersist`) đã có ở `ai/tests/api/test_node_contract.py`.

---

## Trạng thái hiện tại

Đã xong và kiểm chứng được bằng lệnh:

- Tách source, Docker hoá, queue + worker + retry, phân loại lỗi khớp nhau ở cả
  hai đầu (`NON_RETRYABLE_ERROR_CODES` ↔ `NON_RETRYABLE`), mock provider có thể kích lỗi để test.
- `/v1/story/generate` (M1–M3): prompt, validator tất định, thử lại nội bộ một lần, `GeminiLLMProvider`
  cho chữ. Worker dựng payload từ DB và ghi kết quả (`persistPlan.js`) cho job `story_text`.
- Ảnh / TTS: endpoint + mock, upload Storage và trả key.

**Chưa xong** — đừng tưởng đã có:

- Model ảnh thật (M4b, mã nguồn mở) và TTS thật (M5). Worker chưa xử lý job `character_portrait`,
  `scene_image`, `narration` (trả `UnrecoverableError` "chưa hỗ trợ").
- Spike Gemini mới làm một phần: mức bị bộ lọc an toàn chặn và hành vi cắt cụt còn mở
  (`ai/docs/01-decisions.md`).
- **NFR 15s** được hiểu là **độ trễ nhận việc** — từ lúc phụ huynh bấm tạo truyện tới lúc giao diện
  phản hồi (request trả ngay sau khi enqueue, UI hiện tiến trình). AI viết cả truyện một lần, nên
  không còn đơn vị "một trang". Thời gian sinh truyện thật là số đo riêng
  (`ai/scripts/try_story.py`), chưa đo trên Gemini.
