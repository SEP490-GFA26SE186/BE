# Setup cho dev — StoryWeaver AI

Hướng dẫn clone về và chạy **đúng cách nhóm đang dev**: Postgres + Redis + API + worker trong Docker,
còn **service AI (`ai/`) chạy thẳng trên máy** để dùng chữ thật bằng **Claude CLI** (`claude_code`) và
giọng đọc **VieNeu-TTS**. Chi tiết kiến trúc, biến môi trường, test: xem [README.md](README.md).

```
Web (Vite :5173) ──/api──▶ api (Docker :3000) ──queue──▶ worker (Docker)
                               │  POST /stories/analyze      │
                               └──────────┬──────────────────┘
                                          ▼
                              ai (máy của bạn :8001)  ── Claude CLI (gói Pro/Max của bạn)
                                                      ── VieNeu-TTS (CPU, ONNX)
                                                      ── Cloudflare Workers AI (ảnh)
                                                      ── Cloudinary (lưu ảnh / audio)
Postgres (Docker :5432) · Redis (Docker)
```

Vì sao AI không chạy trong Docker: image không có CLI `claude` đang đăng nhập của bạn, và VieNeu chạy
thẳng trên Windows nhanh gấp ~2 lần trong Docker Desktop (một trang 17 s so với 31–38 s).

---

## 0. Cần cài trước

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Docker Desktop | mới | đang chạy |
| Git | | |
| Node.js | 22 | để chạy Web và CLI Claude |
| Python | **3.12** (hoặc 3.13) | VieNeu chỉ hỗ trợ 3.10–3.13, project cần ≥ 3.12. Windows: `py -3.12 --version` |
| Claude Code CLI | bản npm | `npm install -g @anthropic-ai/claude-code` — cần **tài khoản Claude Pro/Max** của chính bạn |

Ba repo nằm cạnh nhau, ví dụ `D:\sep490\BE` và `D:\sep490\Web`.

---

## 1. Backend trong Docker (Postgres local + API + worker)

```bash
git clone https://github.com/SEP490-GFA26SE186/BE.git
cd BE
cp .env.example .env
```

Sửa `BE/.env` (file này **không commit**):

```ini
# Gộp 3 file compose: base (có sẵn Postgres) + hot reload + AI chạy ngoài Docker.
# Windows dùng dấu ;   — Linux/macOS dùng dấu :
COMPOSE_FILE=docker-compose.yml;docker-compose.dev.yml;docker-compose.hostai.yml

# Container `ai` trong Docker vẫn chạy (worker phụ thuộc nó) nhưng không ai gọi: để mock cho nhẹ.
LLM_PROVIDER=mock
TTS_PROVIDER=mock

# Phải GIỐNG HỆT ai/.env (bước 2)
INTERNAL_TOKEN=dev-internal-token-doi-truoc-khi-deploy

# Cloudinary — api dùng để ký link xem ảnh / nghe audio. Xin của nhóm, không dán lên chat công khai.
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=storyweaver
```

api + worker tự nối vào container `postgres`. `DATABASE_URL` trong `.env` chỉ dùng cho lệnh chạy
ngoài Docker (Prisma Studio, `npx prisma ...`), trỏ vào `localhost:5432`.

```bash
docker compose up -d --build
docker compose exec api npm run db:setup     # migrate + seed (kỹ năng CASEL, chuyện mẫu, cấu hình) + tài khoản demo
```

Kiểm tra: `docker compose ps` (các service `healthy`), mở http://localhost:3000/api/v1/health và
http://localhost:3000/api-docs.

> Postgres local: `postgresql://storyweaver:storyweaver@localhost:5432/storyweaver`
> (DBeaver / Prisma Studio). Máy đã có Postgres chiếm cổng 5432 thì đặt `POSTGRES_HOST_PORT=5433` trong `.env`.

---

## 2. Service AI chạy trên máy (Claude CLI + VieNeu)

### 2.1 Đăng nhập Claude CLI (một lần)

```bash
claude            # lần đầu sẽ mở trình duyệt để đăng nhập tài khoản Pro/Max, rồi gõ /exit
```

Mỗi dev dùng **gói Claude của chính mình** — hạn mức tính theo gói (cửa sổ 5 giờ / 7 ngày), không tính
tiền theo token. Hết hạn mức thì sinh truyện báo lỗi và worker tự thử lại.

### 2.2 Tạo venv và cài (một lần)

```bash
cd ai
py -3.12 -m venv .venv312                    # Linux/macOS: python3.12 -m venv .venv312
.venv312/Scripts/python -m pip install -U pip
.venv312/Scripts/python -m pip install -e ".[tts,claude-code]"
```

(Linux/macOS: thay `.venv312/Scripts/python` bằng `.venv312/bin/python` ở mọi lệnh.)

- Extra `claude-code` cài `claude-agent-sdk` (gọi CLI `claude` như tiến trình con).
- Extra `tts` cài VieNeu-TTS v3 Turbo (ONNX trên CPU, không cần GPU, không cần torch).

### 2.3 `ai/.env`

```bash
cp .env.example .env
```

Sửa các dòng sau (comment luôn đặt trên **dòng riêng** — dotenv đọc `VAR=x   # ghi chú` thành giá trị
"x   # ghi chú"):

```ini
INTERNAL_TOKEN=dev-internal-token-doi-truoc-khi-deploy

# ---- Chữ: Claude CLI ----
LLM_PROVIDER=claude_code
LLM_CLAUDE_MODEL=sonnet
LLM_CLAUDE_EFFORT=low
LLM_THINKING_BUDGET=12000
# Windows BẮT BUỘC: trỏ tới claude.exe thật (SDK từ chối shim claude.CMD trong PATH).
# Thay <ban> bằng user Windows của bạn. Linux/macOS để trống.
LLM_CLAUDE_CLI_PATH=C:\Users\<ban>\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe

# ---- Giọng đọc: VieNeu ----
TTS_PROVIDER=vieneu

# ---- Ảnh: Cloudflare Workers AI (FLUX.2 klein 4B) ----
IMAGE_PROFILE_PORTRAIT=cf-flux-2-klein-4b
IMAGE_PROFILE_SCENE=cf-flux-2-klein-4b
IMAGE_SAFETY=human_review
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# ---- Lưu ảnh / audio: Cloudinary (cùng tài khoản với BE/.env) ----
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

- **Để trống `ANTHROPIC_API_KEY`**: có key thì CLI có thể tính tiền vào key thay vì vào gói.
- Không có Cloudflare / Cloudinary thì để ảnh `mock` (`IMAGE_PROFILE_PORTRAIT=mock`, `IMAGE_PROFILE_SCENE=mock`)
  — luồng vẫn chạy, chỉ là ảnh giả.
- Các khoá (Cloudflare, Cloudinary) xin trưởng nhóm qua kênh riêng. **Không commit `.env`.**

### 2.4 Chạy

```bash
cd ai
.venv312/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

- **Cổng 8001**, không phải 8000 (8000 là container `ai` mock). `docker-compose.hostai.yml` đã trỏ
  worker và api tới `http://host.docker.internal:8001`.
- **Lần đầu bật VieNeu tải ~580 MB model** về cache Hugging Face trên máy (`%USERPROFILE%\.cache\huggingface`).
  Đợi log báo xong mới thử giọng đọc.
- Kiểm tra: `curl localhost:8001/health` phải có `"llm_provider":"claude_code"` và `"tts_provider":"vieneu"`.

Thời gian tham khảo (Ryzen 5 5500U): phân tích lời kể 10–30 s, sinh chữ một truyện 1–3 phút, mỗi trang
giọng đọc ~17 s (chạy nền, từng đoạn một).

---

## 3. Web

```bash
cd ../Web
cp .env.example .env        # VITE_API_URL=/api/v1 — Vite proxy chuyển /api sang localhost:3000
npm install
npm run dev                 # http://localhost:5173
```

---

## 4. Tài khoản demo (sau `db:setup`)

| Vai trò | Đăng nhập | Mật khẩu |
|---|---|---|
| Phụ huynh (có bé Bin, nhân vật Bà, 50 credit) | `me_lanhuong` | `123456` |
| Chuyên gia sư phạm | `kdv_demo` | `123456` |
| Admin | `admin_demo` | `123456` |

PIN thoát Kid Mode: `1234`. Muốn thử bán truyện: phụ huynh vào **Bán truyện** gửi hồ sơ người bán, chuyên gia duyệt ở **Hồ sơ người bán**. Cần thêm phụ huynh thì đăng ký ở `/register`.

Thử nhanh luồng chính: phụ huynh → **Sáng tác truyện → Kể chuyện nhà mình** → viết một chuyện có "giận"
→ **Xem bé sẽ tập gì** → **Tạo truyện**.

---

## 5. Hằng ngày

```bash
cd BE && docker compose up -d                                              # Postgres, Redis, api, worker
cd BE/ai && .venv312/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
cd Web && npm run dev
```

**Sau khi `git pull` mà có migration mới** (`api/prisma/migrations/` có thư mục mới):

```bash
cd BE
docker compose exec api npx prisma migrate deploy
docker compose up -d --build api worker      # BẮT BUỘC: tạo lại Prisma client trong image
```

Chỉ restart mà không `--build` thì Prisma client trong container vẫn là bản cũ → API trả 500
"Unknown argument …" ở chỗ dùng cột mới.

**Sau khi pull mà `ai/` có thêm thư viện** (`ai/pyproject.toml` đổi): chạy lại bước 2.2 rồi khởi động lại uvicorn.
Code `ai/` đổi thì cũng phải khởi động lại uvicorn (lệnh trên không bật `--reload`).

---

## 6. Lỗi hay gặp

| Triệu chứng | Nguyên nhân / cách sửa |
|---|---|
| Bấm "Xem bé sẽ tập gì" ra **502** | uvicorn ở cổng 8001 chưa chạy, hoặc `INTERNAL_TOKEN` hai file `.env` khác nhau. Xem `docker compose logs api` |
| Truyện kẹt "đang tạo" | worker bị khởi động lại giữa chừng (nodemon thấy file đổi). Sau 10 phút hệ thống tự đánh dấu lỗi và hoàn credit; mở lại truyện bấm tạo lại |
| API **500 "Unknown argument …"** | Prisma client cũ trong container → `docker compose up -d --build api worker` |
| Khởi động ai báo không tìm thấy `claude` / từ chối `claude.CMD` | Đặt `LLM_CLAUDE_CLI_PATH` trỏ đúng `claude.exe` (mục 2.3) |
| `Claude Code returned an error result: success` | CLI lệch phiên bản với SDK → trỏ `LLM_CLAUDE_CLI_PATH` vào bản npm mới nhất, hoặc cập nhật `npm i -g @anthropic-ai/claude-code` |
| Giọng đọc rất chậm / thiếu RAM | VieNeu chạy CPU, mỗi lúc một đoạn. Không cần giọng thì tắt công tắc "Giọng đọc kể truyện" khi tạo truyện, hoặc `TTS_PROVIDER=mock` |
| `pip install` VieNeu lỗi | Sai bản Python: phải 3.12 (hoặc 3.13), không dùng 3.14 |
| Cổng 5432 bị chiếm | `POSTGRES_HOST_PORT=5433` trong `BE/.env` |

---

## Quy tắc an toàn

- **Không chạy migration / seed thẳng vào DB production.** Cập nhật prod theo DEPLOY-UPDATE.md.
- Không log / không gửi tên thật, nội dung lời kể, khoá API. Tên thật được đổi thành `{NV1}`, `{NV2}`…
  trước khi tới AI.
- `claude_code` dùng gói cá nhân — chỉ cho dev và demo đồ án.
