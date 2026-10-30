# Hợp đồng HTTP: Node ↔ service `ai`

Tài liệu này là **nguồn sự thật** cho giao tiếp giữa `api/` (Node) và `ai/`
(Python). Ai sửa một bên thì phải sửa tài liệu này và bên còn lại.

Mục đích: hai người làm song song được. Người làm Node không cần biết prompt
trong Python; người làm Python không cần biết Prisma, credit hay user.

---

## 1. Hình dạng hệ thống

```
Client ──> api (Express)          KHÔNG gọi service ai trực tiếp
             │  startGeneration: giữ credit + tạo ai_request
             ↓
           BullMQ (Redis)         queue "ai", job chỉ mang { ai_request_id },
             │                    attempts=3, backoff exponential 2s
             ↓
           worker (Node)          cùng image với api, khác command
             │  đọc DB -> dựng payload (aiRequest.js)
             │  POST /v1/story/generate | /v1/images/portrait | /v1/images/scene | /v1/tts/synthesize
             │  header X-Internal-Token
             ↓
           ai (FastAPI)  ──> provider (Claude cho chữ, Gemini còn trong code / mock; ảnh: mock tới M4b; TTS: VieNeu-TTS / mock)
             │             └──> Cloudinary (ảnh / audio — service upload, trả key)
             ↓
           worker ghi kết quả vào DB (persistPlan.js) + chốt / hoàn credit
```

**Ba điều bất biến của kiến trúc này:**

1. Service `ai` **không đọc/ghi Postgres**. Nó không được cấp `DATABASE_URL`.
   Kiểm tra: `docker compose exec ai env | grep DATABASE_URL` phải rỗng.
2. `api` **không được cấp `AI_SERVICE_URL`**, nên mọi yêu cầu sinh nội dung buộc
   phải đi qua queue. Đây là lý do AI chậm hay sập cũng không kéo sập API.
3. BullMQ nằm hoàn toàn ở Node. Service `ai` không có Redis và không stateful.

---

## 2. Endpoint

| Method | Path | Job Node (`AI_JOB`) | Trả về |
|---|---|---|---|
| GET | `/health` | — | `status` + provider/model đang bật + `storage_backend`; không gọi provider, không cần token |
| GET | `/ready` | — | giống hệt `/health` (cùng handler) |
| POST | `/v1/story/generate` | `story_text` | JSON: cả truyện một lần (trang, cảnh, điểm dừng) |
| POST | `/v1/images/portrait` | `character_portrait` | JSON + 2 file ảnh trên Storage (trả key) |
| POST | `/v1/images/scene` | `scene_image` | JSON + 1 file ảnh trên Storage (trả key) |
| POST | `/v1/tts/synthesize` | `narration` | JSON + 1 file audio trên Storage (trả key) |

Không còn `/v1/generate/story-page` và `/v1/generate/narration`: AI viết **cả truyện một lần**,
không có endpoint viết lại một trang hay điền một điểm dừng.

Tên job bên Node (`api/src/queues/ai.jobs.js`) khớp `ai_request_type` trong DBML:
`story_text` · `character_portrait` · `scene_image` · `narration`. Endpoint + timeout theo job nằm ở
`JOB_CONFIG` trong `api/src/clients/aiClient.js`. Hiện worker mới xử lý `story_text`; ba job còn lại
gọi được qua `callAi` (đã kiểm tương thích) nhưng processor trả `UnrecoverableError` "chưa hỗ trợ".

**Job BullMQ chỉ mang `{ ai_request_id }`** (+ `mock_force` tuỳ chọn, chỉ dev — xem §7). Worker đọc
DB rồi dựng request gửi `ai` lúc chạy job (mỗi lần retry đọc lại dữ liệu mới nhất). Chi tiết: spec
Node `api/docs/superpowers/specs/2026-09-30-story-generation-node-design.md` §8.

---

## 3. Request

Body là payload **snake_case** phẳng — không có phong bì. Nguồn sự thật của từng trường:
`ai/docs/05-api-contract.md` + `ai/docs/samples/*_request.json` (spec AI
`ai/docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md` §5).

**Quy ước chung:**

- Mọi model request (kể cả object lồng nhau) là `extra="forbid"`: **trường lạ → `INVALID_INPUT`**.
  Đổi tên một trường ở một bên mà quên bên kia thì lỗi ngay, không lặng lẽ bị bỏ qua.
- Mọi request có `request_id` (Node gửi id của `ai_request`); response echo lại. Chỉ để đối chiếu
  log hai bên.
- **Không có `idempotency_key`.** Service stateless, không dedupe được — nhận vào chỉ tạo ảo giác
  được bảo vệ. Chống trùng là việc của Node (BullMQ `jobId` + unique constraint ở DB).
- Mọi request nhận trường optional `__force` ở **cấp cao nhất** (chỉ mock — §7).

### `/v1/story/generate`

Do `api/src/modules/stories/lib/aiRequest.js` `buildAiRequest` dựng từ DB:

```json
{
  "request_id": "<ai_request.id>",
  "topic": { "title": "…", "competency": "self_management", "guidance": "…",
             "age_min": 5, "age_max": 8,
             "sub_skills": [{ "name": "Gọi tên cảm xúc", "description": "…" }] },
  "characters": [{ "token": "{NV1}", "description": "bé trai 6 tuổi…", "is_main": true }],
  "situation": "{NV1} hay giành xe…",
  "tone": "gentle",
  "pages": ["p1", "p2", "…"],
  "checkpoints": [{ "id": "k2", "type": "perspective", "after": "p4", "target": "{NV2}",
                  "guide": { "sub_skill": "Hiểu góc nhìn", "question_frame": "…", "page_setup": "…",
                             "hint_guidance": "…", "correct_desc": "…", "distractor_desc": "…" } },
                 { "id": "k3", "type": "problem_solving", "after": "p5",
                  "guide": { "sub_skill": "…", "question_frame": "…",
                             "roles": { "constructive": "…", "avoidant": "…", "impulsive": "…" } } }],
  "limits": { "page_min_words": 20, "page_max_words": 70,
              "page_target_min_words": 40, "page_target_max_words": 60, "sentence_max_words": 15,
              "question_max_words": 15, "option_max_words": 12, "hint_max_words": 20,
              "feedback_max_words": 25, "max_scenes": 4 },
  "forbidden_terms": ["<tên thật>"],
  "blocked_keywords": [{ "keyword": "đánh", "severity": "warn" }]
}
```

| Trường | Luật (Pydantic) | Phía Node |
|---|---|---|
| `competency` | enum 5 năng lực CASEL | `topic.skill.caselCode` |
| `characters[].token` | `^\{NV\d+\}$`, không trùng; đúng **một** `is_main` | `story_characters` |
| `characters[].description` | chuỗi, được rỗng | `appearance` đã thay tên → token |
| `situation` | chuỗi hoặc `null` | `stories.situation` |
| `tone` | `gentle` \| `playful` | luôn `gentle` |
| `checkpoints[].type` | `emotion_self` · `emotion_other` · `perspective` · `problem_solving` · `reflection` | |
| `checkpoints[].target` | **bắt buộc** với `emotion_other`; tuỳ chọn với `perspective` (từ story.v2); phải là token đã khai | chỉ gửi khi cần |
| `checkpoints[].guide` | **tuỳ chọn** (story.v2): `{sub_skill, question_frame, page_setup?, hint_guidance?, allowed_emotions?, correct_desc?, distractor_desc?, roles?}`, `extra=forbid`; `allowed_emotions` chỉ `emotion_*`, `correct_desc` / `distractor_desc` chỉ `perspective`, `roles {constructive, avoidant, impulsive}` chỉ `problem_solving`; `reflection` không có `guide`. `answer` cảm xúc ngoài `allowed_emotions` → validator `EMOTION_NOT_ALLOWED` (thử lại nội bộ) | mẫu câu hỏi của Chuyên gia (task 10); không gửi điểm / `rationale` |
| `topic.age_min` / `topic.age_max` / `topic.sub_skills` | **tuỳ chọn** (story.v2): số nguyên dương, `age_min <= age_max`; `sub_skills: [{name, description}]`, mặc định `[]`. Thiếu tuổi → prompt "trẻ 5–8 tuổi" | bài học + kỹ năng con |
| `checkpoints[].after` | phải có trong `pages`, mỗi trang tối đa một checkpoint | `p<pageOrder>` |
| `limits` | đủ 8 khoá, số nguyên dương, **không có mặc định** | `platform_settings` `limits.*` |
| `blocked_keywords[].severity` | `warn` \| `block` | bảng `blocked_keywords` |

Pydantic chỉ kiểm toàn vẹn tham chiếu; luật "hình dạng truyện" (số trang, kiểu checkpoint đặt ở
đâu…) là việc của Node và của validator output — service chạy được với khung bất kỳ, kể cả
`custom`.

### Ảnh và TTS

| Endpoint | Request |
|---|---|
| `/v1/images/portrait` | `{request_id, storage_prefix, description, forbidden_terms}` |
| `/v1/images/scene` | `{request_id, storage_prefix, scene_description, characters[{description, portrait_key?}], forbidden_terms}` |
| `/v1/tts/synthesize` | `{request_id, storage_prefix, text, voice_id}` |

`storage_prefix` là **chuỗi opaque** (service không parse ngữ nghĩa, chỉ nối tên file) nhưng **được
kiểm**, vì với `LocalStorage` nó là đường dẫn filesystem thật:

- chỉ gồm `[A-Za-z0-9/_\-.]`, dài 1–200; không bắt đầu bằng `/`; không có `\`; không có đoạn `..`.
- `portrait_key` (ảnh cảnh **đọc** lại file này) kiểm cùng luật.
- Với ảnh / TTS, `request_id` đi vào tên file nên cũng được kiểm: `[A-Za-z0-9_\-.]`, 1–100 ký tự,
  không phải `.` / `..` (UUID luôn qua).

Sai → `INVALID_INPUT`, không file nào được ghi hay đọc. Tên file **tất định** theo `request_id`
(`<prefix>/<request_id>-<n>.<ext>`) nên BullMQ chạy lại job thì ghi đè, không để file mồ côi.

Hai endpoint ảnh chặn tên thật (`forbidden_terms`) trong mọi trường mô tả → `FORBIDDEN_TERM_DETECTED`.
TTS miễn trừ (được nhận tên thật, chạy trên server của nhóm). `/v1/story/generate` kiểm tên thật
trên **request** (các trường phụ huynh nhập), không kiểm output — xem `ai/docs/04-ai-pipeline.md`.

### Xác thực

Header `X-Internal-Token`, giá trị chung qua env `INTERNAL_TOKEN`. Không dùng JWT của user: service
`ai` không biết gì về user. Thiếu / sai token trả **`INVALID_INPUT`** (422, không retry) vì đó là lỗi
cấu hình — thử lại 3 lần vẫn sai.

---

## 4. Response thành công

Response thành công **là chính nội dung** — không có `status` ở cấp cao nhất. Mọi response echo
`request_id` và có `usage`.

### `usage` (mọi endpoint)

```json
{
  "provider": "gemini", "model": "gemini-…-flash",
  "input_tokens": 5210, "output_tokens": 3874,
  "units": 0, "estimated_cost_micros": 0, "latency_ms": 17340, "attempts": 2
}
```

| Khoá | Nghĩa |
|---|---|
| `provider`, `model` | provider thật đã chạy (`mock` / `mock-v1` khi mock) |
| `input_tokens`, `output_tokens` | **cộng dồn** qua mọi lần thử lại nội bộ; output gồm cả token thinking |
| `units` | số ảnh (ảnh) / số giây audio làm tròn lên (TTS); 0 với chữ |
| `estimated_cost_micros` | ước tính từ `PRICE_TEXT_*_PER_MTOK_MICROS`; 0 khi chưa cấu hình giá |
| `latency_ms` | thời gian xử lý trong service |
| `attempts` | số lời gọi provider (1 hoặc 2) |

Node đọc `provider`, `model`, `input_tokens`, `output_tokens`, `estimated_cost_micros` để ghi
`ai_requests` (`stories.generation.store.js` `succeededData`). `usage` là số liệu từ provider, không
từ DB, nên nó không đổi khi schema đổi.

### `/v1/story/generate`

Mẫu đầy đủ: `ai/docs/samples/story_response.json`.

```json
{
  "request_id": "…",
  "pages":  { "p1": { "scene": "s1", "text": "…" } },
  "scenes": { "s1": "<mô tả cảnh, tiếng Anh, ≤ 30 từ>" },
  "checkpoints": {
    "k1": { "type": "emotion_self", "question": "…", "answer": "angry", "hint": "…" },
    "k2": { "type": "perspective", "question": "…", "options": { "o1": "…", "o2": "…", "o3": "…" }, "answer": "o2", "hint": "…" },
    "k3": { "type": "problem_solving", "question": "…",
            "options": { "constructive": { "text": "…", "feedback": "…" },
                         "avoidant": { "text": "…", "feedback": "…" },
                         "impulsive": { "text": "…", "feedback": "…" } } },
    "k4": { "type": "reflection", "question": "…" }
  },
  "warnings": [{ "code": "PAGE_LENGTH_OUT_OF_RANGE", "target_id": "p3", "detail": "…" }],
  "prompt_version": "story.v2",
  "usage": { }
}
```

- Khoá `pages` / `checkpoints` đúng bằng id Node đã gửi; `emotion_other` cùng shape `emotion_self`;
  `answer` cảm xúc ∈ `happy | sad | angry | scared | neutral`.
- `warnings` = luật mức WARN, hoặc độ dài vẫn lệch sau lần thử lại (nhận truyện, không lỗi). Node
  hiện chỉ log `warnings[].code`.
- `api/src/modules/stories/lib/persistPlan.js` `planPersist` biến response này thành kế hoạch ghi DB.

### Ảnh và TTS

| Endpoint | Response | Mẫu |
|---|---|---|
| `/v1/images/portrait` | `{request_id, portrait_keys: [k1, k2], usage}` | `images_portrait_response.json` |
| `/v1/images/scene` | `{request_id, image_key, reference_used, usage}` | `images_scene_response.json` |
| `/v1/tts/synthesize` | `{request_id, audio_key, duration_seconds, usage}` | `tts_synthesize_response.json` |

Service **upload lên Storage và trả key**, không trả base64. Key nằm dưới `storage_prefix` Node đã
gửi; với `LocalStorage` key có cùng dạng nên Node không phân biệt được hai backend.

---

## 5. Phân loại lỗi — bảng quyết định hành vi retry

Thân response khi thất bại:

```json
{ "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false } }
```

Khi đã có ít nhất một lời gọi LLM trả response, thân lỗi có thêm `usage` (cùng shape §4) **cạnh**
`error`, không nằm trong nó — `error` giữ đúng ba khoá Node đọc:

```json
{
  "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false },
  "usage": { "provider": "gemini", "model": "…", "input_tokens": 5210, "output_tokens": 3874,
             "units": 0, "estimated_cost_micros": 0, "latency_ms": 17340, "attempts": 2 }
}
```

Không có `usage` thì khoá vắng mặt (không phải `null`). Node hiện bỏ qua `usage` trong thân lỗi —
thêm vào không phá gì; đọc nó để ghi tiền đã đốt là việc sau này.

| `error.code` | HTTP | `retryable` | BullMQ | Credit | Có `usage`? | Lời gọi Gemini tệ nhất |
|---|---|---|---|---|---|---|
| `INVALID_INPUT` | 422 | false | **không retry** (`UnrecoverableError`) | hoàn | không | 0 |
| `FORBIDDEN_TERM_DETECTED` | 422 | false | **không retry** | hoàn | không | 0 |
| `SAFETY_BLOCKED` | 422 | false | **không retry** | hoàn | có | 2 |
| `OUTPUT_INVALID` | 502 | false | **không retry** (đã thử lại nội bộ) | hoàn | có | 2 |
| `PROVIDER_ERROR` | 502 | true | retry, tối đa 3, backoff 2s | hoàn khi hết lượt | tuỳ | 6 (3 × 2) |
| `TIMEOUT` | 504 | true | retry, tối đa 3, backoff 2s | hoàn khi hết lượt | tuỳ | 6 (3 × 2) |

Cột cuối = số lời gọi mỗi lần chạy job × số lần BullMQ chạy job. Lần 1 có thể trả output sai rồi
lần thử lại nội bộ mới gặp chặn / 5xx / hết giờ → 2 lời gọi mỗi lần chạy. Bảng chỉ đúng khi SDK
`google-genai` **không tự retry** — `GeminiLLMProvider` tắt retry của SDK. Gemini 429 map vào
`PROVIDER_ERROR` (không còn `PROVIDER_THROTTLED`).

Ở Node, `SAFETY_BLOCKED` / `FORBIDDEN_TERM_DETECTED` kết thúc `ai_request` ở trạng thái `blocked`
(đếm riêng cho Admin), các mã khác `failed` (`api/src/modules/stories/lib/failure.js`).
`FORBIDDEN_TERM_DETECTED` từ `/v1/story/generate` nghĩa là Node đã để lọt tên thật — worker log
`BUG`.

**Vì sao các mã chặn / sai output phải không-retry:** retry 3 lần chỉ tốn quota và vẫn bị chặn. Đây
là app cho trẻ 5 tuổi nên bộ lọc sẽ chạm thường xuyên hơn app người lớn.

**Bảng này được thực thi bằng code ở hai nơi, phải khớp nhau:**

- Node: `api/src/clients/aiClient.js` → `NON_RETRYABLE_ERROR_CODES`
- Python: `ai/app/errors.py` → `NON_RETRYABLE` và `STATUS_BY_CODE`
- Test giữ chúng khớp: `ai/tests/api/test_node_contract.py` (bản chép tay tập của Node).

Node đọc `body.error.code` + `body.error.retryable`, **không** đọc HTTP status: lỗi là
non-retryable nếu service nói `retryable: false` **hoặc** mã thuộc `NON_RETRYABLE_ERROR_CODES`.
Thiếu thân lỗi (service crash trước khi vào handler, proxy trả HTML…) → mặc định `PROVIDER_ERROR`,
retryable. Vì vậy service `ai` ghi đè handler của `RequestValidationError` (body mặc định của
FastAPI không có `error.code` → Node sẽ retry một payload không bao giờ đúng) và có handler chốt
chặn cho mọi exception lạ (→ `PROVIDER_ERROR`). Thông báo lỗi validate chỉ giữ `loc` + `msg`, không
lặp lại giá trị đầu vào.

---

## 6. Ngân sách thời gian

Bất biến ba tầng — **không cưỡng chế được bằng code** (hai process), phải giữ bằng tay:

```
AI_TIMEOUT_MS_<JOB> (Node)  >  2 × LLM_TIMEOUT_SECONDS (ai)  +  overhead
```

`LLM_TIMEOUT_SECONDS = 150` là trần **một** lời gọi LLM; service thử lại nội bộ tối đa 1 lần nên
tệ nhất ~300s trong service. Node phải chờ lâu hơn thế, nếu không: Node abort → `TIMEOUT` (retryable)
→ BullMQ chạy lại từ đầu → ba lần sinh truyện đầy đủ bị vứt đi mà tiền provider vẫn mất.
(Lịch sử: 45s / 120s -> 90s / 200s (2026-10-15) -> 150s / 320s (2026-10-16): truyện `custom` 20 trang đo
được 90,5s một lời gọi trên Claude qua CLI sau khi prompt nhắm 40–60 tiếng/trang. Biên an toàn tạm.)

| Job | Endpoint | Node timeout mặc định | Biến ghi đè (Node) |
|---|---|---|---|
| `story_text` | `/v1/story/generate` | 320 000 ms | `AI_TIMEOUT_MS_STORY_TEXT` |
| `character_portrait` | `/v1/images/portrait` | 90 000 ms | `AI_TIMEOUT_MS_CHARACTER_PORTRAIT` |
| `scene_image` | `/v1/images/scene` | 90 000 ms | `AI_TIMEOUT_MS_SCENE_IMAGE` |
| `narration` | `/v1/tts/synthesize` | 150 000 ms | `AI_TIMEOUT_MS_NARRATION` |

Đổi `LLM_TIMEOUT_SECONDS` (service `ai`) thì phải kiểm lại `AI_TIMEOUT_MS_STORY_TEXT` (worker), và
ngược lại. Không còn `AI_TIMEOUT_MS` chung, không còn `PROVIDER_TIMEOUT_SECONDS`.

**NFR 15s** ("story page generation ≤ 15s via BullMQ") được hiểu là **độ trễ nhận việc**: thời gian từ
lúc phụ huynh bấm tạo truyện tới lúc giao diện phản hồi. BullMQ bất đồng bộ — request trả ngay sau
khi enqueue, UI hiện tiến trình. Thời gian sinh truyện thực tế là **số đo riêng** (đo bằng
`ai/scripts/try_story.py`, ghi vào báo cáo), không phải NFR. `usage.latency_ms` là thang đo sẵn có
phía service.

---

## 7. Test contract mà không cần provider thật

Khi provider của endpoint là mock (`LLM_PROVIDER=mock` cho chữ, `TTS_PROVIDER=mock` cho giọng đọc;
ảnh hiện chỉ có mock), thêm `__force` vào **cấp cao nhất** của body để kích từng nhánh:

```json
{ "request_id": "…", "topic": { }, "…": "…", "__force": "SAFETY_BLOCKED" }
```

| `__force` | Kết quả |
|---|---|
| `SAFETY_BLOCKED` | 422 `SAFETY_BLOCKED`, không retry; ở chữ có `usage` (`attempts = 1`) |
| `PROVIDER_ERROR` | 502 `PROVIDER_ERROR`, retryable, không `usage` |
| `TIMEOUT` | 504 `TIMEOUT`, retryable, không `usage` |
| `OUTPUT_INVALID` | chữ: output sai cả hai lần → 502 `OUTPUT_INVALID` có `usage` (`attempts = 2`); ảnh / TTS: ném thẳng |
| `INVALID_OUTPUT_ONCE` | chỉ chữ: sai lần 1, đúng lần 2 → 200, `usage.attempts = 2`; gửi cho ảnh / TTS → `INVALID_INPUT` |

- Giá trị khác → `INVALID_INPUT`. `__force` nằm trong object con (kiểu phong bì `input` cũ) →
  `INVALID_INPUT` vì trường lạ.
- Provider **không phải mock** mà có `__force` → 422 `INVALID_INPUT` trước khi làm gì khác (provider
  không hề được gọi) — một script E2E chạy nhầm môi trường sẽ không gọi Gemini thật mà tưởng đang
  test nhánh lỗi.

Nhờ nó, người làm Node test được nhánh "không retry, hoàn credit" và nhánh "retry có backoff" mà
không cần API key Gemini, và không phải cố tình viết prompt bẩn để chọc bộ lọc nội dung.

Thử nhanh bằng dòng lệnh:

```bash
# truyện phải có sẵn trong DB; script đi qua startGeneration (giữ credit thật)
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId>                         # nhánh thành công
docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId> --force SAFETY_BLOCKED  # nhánh bị chặn
docker compose logs worker --tail 5
# SAFETY_BLOCKED: fail ở "attempt 1/3" rồi dừng, KHÔNG có attempt 2 và 3; ai_request `blocked`, credit hoàn
# PROVIDER_ERROR / TIMEOUT: retry có backoff tới attempt 3/3 rồi `failed`, credit hoàn
```

Luồng của cờ phía Node: `--force CODE` → job data `mock_force` → worker thêm `__force: CODE` vào
**cấp cao nhất** của payload `/v1/story/generate` (spec AI §4.3; mã: `SAFETY_BLOCKED` ·
`PROVIDER_ERROR` · `TIMEOUT` · `OUTPUT_INVALID` · `INVALID_OUTPUT_ONCE`). Worker bỏ qua
`mock_force` khi `NODE_ENV=production`; API HTTP không có cách nào đặt cờ này.
