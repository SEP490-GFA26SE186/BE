# Hợp đồng HTTP: Node ↔ service `ai`

Tài liệu này là **nguồn sự thật** cho giao tiếp giữa `api/` (Node) và `ai/`
(Python). Ai sửa một bên thì phải sửa tài liệu này và bên còn lại.

Mục đích: hai người làm song song được. Người làm Node không cần biết prompt
trong Python; người làm Python không cần biết Prisma, credit hay user.

---

## 1. Hình dạng hệ thống

```
Client ──> api (Express)          KHÔNG gọi service ai trực tiếp
             │  tạo bản ghi job + reserve credit
             ↓
           BullMQ (Redis)         queue "ai", attempts=3, backoff exponential 2s
             │
             ↓
           worker (Node)          cùng image với api, khác command
             │  POST /v1/generate/...   header X-Internal-Token
             ↓
           ai (FastAPI)  ──> provider (Gemini / TTS)
             │             └──> Supabase Storage (binary)
             ↓
           worker ghi kết quả vào DB + commit credit
```

**Ba điều bất biến của kiến trúc này:**

1. Service `ai` **không đọc/ghi Postgres**. Nó không được cấp `DATABASE_URL`.
   Kiểm tra: `docker compose exec ai env | grep DATABASE_URL` phải rỗng.
2. `api` **không được cấp `AI_SERVICE_URL`**, nên mọi yêu cầu sinh nội dung buộc
   phải đi qua queue. Đây là lý do AI chậm hay sập cũng không kéo sập API.
3. BullMQ nằm hoàn toàn ở Node. Service `ai` không có Redis và không stateful.

---

## 2. Endpoint

| Method | Path | Trả về | Cơ chế |
|---|---|---|---|
| GET | `/health` | `{"status":"ok"}` | liveness, không gọi provider |
| GET | `/ready` | provider + storage backend | readiness |
| POST | `/v1/generate/story-page` | JSON thuần | văn bản + nhánh A/B/C |
| POST | `/v1/generate/narration` | JSON + file trên Storage | TTS |

Chỉ có 2 endpoint sinh nội dung, và đây là cố ý: chúng đại diện cho **hai cơ chế
khác nhau** (một trả JSON, một sinh binary rồi upload). `page-rewrite` sẽ giống
`story-page`; `story-image` và `character-portrait` sẽ giống `narration`. Ba cái
đó thêm vào khi schema DB chốt.

Tên job bên Node (`api/src/queues/ai.jobs.js`) map 1-1 sang endpoint:
`story-page` → `/v1/generate/story-page`, `narration` → `/v1/generate/narration`.

---

## 3. Request

Mọi endpoint sinh nội dung nhận cùng một phong bì:

```json
{
  "jobId": "ai:narration:1042",
  "idempotencyKey": "nar_9f3c7b21",
  "storagePrefix": "stories/7b1e.../pages/3",
  "input": { }
}
```

| Trường | Ai quyết định | Ghi chú |
|---|---|---|
| `jobId` | Node | chỉ để đối chiếu log giữa 2 service |
| `idempotencyKey` | Node | dùng làm `jobId` của BullMQ → chặn trùng ở phía Node |
| `storagePrefix` | Node | **chuỗi opaque**. Python không parse, chỉ nối thêm tên file |
| `input` | Node | **passthrough**: Python không validate sâu |

**`input` cố ý để lỏng.** Hình dạng của nó thuộc quyền sở hữu của Node và sẽ
được chốt khi schema DB chốt. Đây là một quyết định, không phải chỗ bỏ trống:
biên đã rõ — khi schema chốt, mỗi endpoint thêm một Pydantic model cho `input`,
còn transport, phân loại lỗi, storage, queue và Docker đều không phải sửa.

**`idempotencyKey`: Python KHÔNG dedupe.** Service này stateless, không Redis,
không DB — nó không thể biết key nào đã thấy. Chống trùng là việc của Node
(BullMQ `jobId` + unique constraint ở DB). Đừng tưởng đã được bảo vệ.

### Xác thực

Header `X-Internal-Token`, giá trị chung qua env `INTERNAL_TOKEN`. Không dùng
JWT của user: service `ai` không biết gì về user. Sai token trả `invalid_input`
(không retry) vì đó là lỗi cấu hình, thử lại 3 lần vẫn sai.

---

## 4. Response thành công

```json
{
  "status": "succeeded",
  "provider": "mock",
  "model": "mock-v1",
  "result": { "audioKey": "stories/7b1e.../pages/3/narration.wav", "durationMs": 8400 },
  "usage": { "inputTokens": 512, "outputTokens": 0, "outputUnits": 1 },
  "latencyMs": 3120
}
```

`usage` là **bắt buộc** — không có nó Node không tính được credit đã tiêu. Đây
là số liệu từ provider, không phải từ DB, nên nó không đổi khi schema đổi.

`result` theo từng endpoint:

- `story-page`: `{ "text": "...", "choices": [{ "key": "A", "text": "..." }, ...] }`
- `narration`: `{ "audioKey": "<dưới storagePrefix>", "durationMs": 8400 }`

---

## 5. Phân loại lỗi — bảng quyết định hành vi retry

Thân response khi thất bại:

```json
{ "status": "failed", "errorKind": "blocked_content", "message": "...", "retryable": false }
```

| HTTP | `errorKind` | BullMQ | Credit |
|---|---|---|---|
| 422 | `blocked_content` | **không retry** (`UnrecoverableError`) | không trừ |
| 400 | `invalid_input` | **không retry** | không trừ |
| 429 | `provider_throttled` | retry, backoff luỹ tiến | không trừ |
| 500 | `provider_error` | retry, tối đa 3 | không trừ |
| 504 | `timeout` | retry, tối đa 3 | không trừ |

**Vì sao `blocked_content` phải tách riêng khỏi `failed`:** retry 3 lần chỉ tốn
quota và vẫn bị chặn. Đây là app cho trẻ 5 tuổi nên bộ lọc sẽ chạm thường xuyên
hơn app người lớn. Nó cũng là số liệu cần đếm riêng cho màn hình Admin.

**Bảng này được thực thi bằng code ở hai nơi, phải khớp nhau:**

- Node: `api/src/clients/aiClient.js` → `NON_RETRYABLE_ERROR_KINDS`
- Python: `ai/app/errors.py` → `NON_RETRYABLE` và `STATUS_BY_KIND`

Node đọc `errorKind` trong **thân** response, không đọc status code. Nếu thân
response thiếu `errorKind`, Node mặc định coi là `provider_error` (retryable).
Vì vậy service `ai` ghi đè handler của `RequestValidationError`: mặc định
FastAPI trả 422 cho payload sai, mà 422 ở đây nghĩa là `blocked_content`.

---

## 6. Ngân sách thời gian

NFR: sinh một trang truyện **≤ 15s**.

| Chặng | Giới hạn | Biến |
|---|---|---|
| Node → ai | 12s | `AI_TIMEOUT_MS` |
| ai → provider | 10s | `PROVIDER_TIMEOUT_SECONDS` |
| còn lại cho ghi DB + WebSocket | ~3s | |

NFR 15s được đo ở **Node**, không phải ở Python. `latencyMs` trong response là
thang đo sẵn có. **Chưa kiểm chứng được** khi còn dùng mock provider (mock trả
về gần như tức thì).

---

## 7. Test contract mà không cần provider thật

Khi `AI_PROVIDER=mock`, thêm cờ `__force` vào `input` để kích từng nhánh lỗi:

```json
{ "input": { "__force": "blocked" } }
```

Giá trị: `blocked` · `throttled` · `timeout` · `provider_error`.

Nhờ nó, người làm Node test được nhánh "không retry, không trừ credit" và nhánh
"retry có backoff" mà không cần API key Gemini, và không phải cố tình viết prompt
bẩn để chọc bộ lọc nội dung. Cờ này chỉ hoạt động ở mock provider.

Thử nhanh bằng dòng lệnh:

```bash
docker compose exec worker node scripts/enqueue-ai-job.js story-page '{"__force":"blocked"}'
docker compose logs worker --tail 3
# phải thấy fail ở "attempt 1/3" rồi dừng, KHÔNG có attempt 2 và 3
```
