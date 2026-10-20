# 05 — Hợp đồng API

Quy ước chung:

- Mọi endpoint (trừ `/health`) yêu cầu header `X-Internal-Token` khớp `INTERNAL_TOKEN`. Thiếu hoặc
  sai → `INVALID_INPUT` (không retry: token sai thì thử lại vẫn sai).
- JSON trên wire dùng **`snake_case`**.
- **Mọi request model đều `extra="forbid"`**, kể cả model lồng nhau: field lạ → `INVALID_INPUT`
  (422). Cố ý: gõ nhầm `forbiden_terms` mà bị bỏ qua thì service coi danh sách là rỗng và gửi tên thật
  cho nhà cung cấp.
- Mọi request có `request_id`; service chỉ dùng để ghi log và (ảnh / TTS) đặt tên file. Service
  **không** nhận `idempotency_key` và không dedupe: chống trùng là việc của BullMQ `jobId` +
  unique constraint ở DB.
- Mọi response thành công echo `request_id` và có `usage`; thêm `prompt_version` nếu có prompt.
- `usage` **cộng dồn qua mọi lần gọi** của một request (kể cả lần thử lại nội bộ), vì lần thử lại tốn
  tiền thật: `{provider, model, input_tokens, output_tokens, units, estimated_cost_micros,
  latency_ms, attempts}`. `output_tokens` gồm cả token thinking; `units` là số ảnh / số giây audio;
  `attempts` là số lời gọi LLM.
- Mọi request có field optional **`__force`** — xem mục riêng.

## `POST /v1/story/generate`

Sinh toàn bộ chữ và điểm dừng cho một truyện. Không có binary nên không có `storage_prefix`.
Ví dụ đầy đủ: `docs/samples/story_request.json`, `docs/samples/story_response.json`; danh sách mà LLM
trả trước khi map: `docs/samples/story_llm_output.json`.

Request:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `request_id` | string | |
| `topic` | `{title, competency, guidance, age_min?, age_max?, sub_skills?}` | Bài học do Moderator quản lý; `competency` là một trong 5 năng lực CASEL (docs 02). `age_min` / `age_max` (số nguyên dương, `age_min <= age_max`) đưa vào prompt ("trẻ 6–9 tuổi"); thiếu một trong hai thì prompt dùng "trẻ 5–8 tuổi". `sub_skills: [{name, description}]` (1–3 kỹ năng con cùng năng lực, lời Việt), mặc định `[]` |
| `characters` | `[{token, description, is_main}]` | `token` khớp `{NV<số>}`; đúng một `is_main = true` |
| `situation` | string \| null | Chuyện thật, đã che tên |
| `tone` | `gentle` \| `playful` | |
| `pages` | `[page_id]` | Theo thứ tự, không trùng |
| `checkpoints` | `[{id, type, after, target?, guide?}]` | `after` thuộc `pages`, tối đa 1 điểm dừng mỗi trang; `target` là token đã khai, bắt buộc với `emotion_other` (tuỳ chọn với `perspective` từ story.v2); `guide` xem dưới |
| `limits` | object | **Bắt buộc**, không có mặc định: `page_min_words`, `page_max_words`, `page_target_min_words`, `page_target_max_words` (mục tiêu đưa vào prompt; phải `min <= target_min <= target_max <= max`, sai thì `INVALID_INPUT`), `sentence_max_words`, `question_max_words`, `option_max_words`, `hint_max_words`, `feedback_max_words`, `max_scenes` (docs 03) |
| `forbidden_terms` | `[string]` | Tên thật |
| `blocked_keywords` | `[{keyword, severity}]` | `severity`: `warn` \| `block` |
| `__force` | optional | Xem mục `__force` |

### `checkpoints[].guide` (tuỳ chọn, từ story.v2)

Mẫu câu hỏi do Chuyên gia soạn cho một điểm dừng có chấm; Node gửi kèm từng điểm dừng (task 10).
Thiếu `guide` thì điểm dừng được viết như story.v1 (khung mặc định theo kiểu, docs 03). AI viết
`question` / `options` / `hint` / trang ngay trước theo mẫu; **output không đổi hình dạng**. Không
có điểm, không có `rationale` (field lạ → `INVALID_INPUT`).

| Trường | Kiểu | Dùng cho |
|---|---|---|
| `sub_skill` | string | mọi kiểu có chấm — tên kỹ năng con điểm dừng này luyện |
| `question_frame` | string | mọi kiểu có chấm — câu hỏi phải viết theo khung này |
| `page_setup` | string \| null | trang ngay trước điểm dừng phải làm gì |
| `hint_guidance` | string \| null | `hint` viết theo hướng này |
| `allowed_emotions` | `[emotion]` \| null | chỉ `emotion_self` / `emotion_other`; `answer` phải thuộc danh sách (không rỗng) — sai thì `EMOTION_NOT_ALLOWED` (thử lại) |
| `correct_desc`, `distractor_desc` | string \| null | chỉ `perspective` — mô tả phương án đúng / nhiễu |
| `roles` | `{constructive, avoidant, impulsive}` \| null | chỉ `problem_solving` — mô tả từng vai; vai vẫn cố định |

Ví dụ request có `guide`: `scripts/try_story_samples/self_management_guided.json`. `reflection`
không được có `guide`. Trường sai kiểu điểm dừng → `INVALID_INPUT`, thông điệp nêu id
điểm dừng.

Pydantic chỉ kiểm **toàn vẹn tham chiếu** (id không trùng, `after` / `target` tồn tại, một
`is_main`). Chính sách cấu trúc truyện (4–20 trang, vị trí `reflection`…) **không** kiểm ở đây —
backend đã kiểm khi lưu; service nhận đúng khung được gửi.

Response:

| Trường | Ghi chú |
|---|---|
| `request_id` | echo |
| `pages` | `{page_id: {text, scene}}` |
| `scenes` | `{scene_id: mô tả tiếng Anh}` |
| `checkpoints` | `{checkpoint_id: ...}` theo kiểu — xem docs 03. `problem_solving.options` khoá theo vai (`constructive` / `avoidant` / `impulsive`), `perspective.options` khoá theo `option_id` |
| `warnings` | `[{code, target_id, detail}]`; `detail` tiếng Việt |
| `prompt_version` | vd. `story.v2` |
| `usage` | cộng dồn |

## `POST /v1/images/portrait`

Sinh **2 phương án** chân dung nhân vật: toàn thân, mặt nhìn thẳng, nền trơn, phong cách cố định.

- Request: `{request_id, storage_prefix, description, forbidden_terms}` (mô tả ngoại hình, không tên).
- Response: `{request_id, portrait_keys: [key1, key2], usage}`.

Ví dụ: `docs/samples/images_portrait_request.json`, `docs/samples/images_portrait_response.json`.

## `POST /v1/images/scene`

Sinh 1 ảnh cho 1 cảnh. Backend gọi một lần cho mỗi cảnh (tối đa 4).

- Request: `{request_id, storage_prefix, scene_description, characters: [{description,
  portrait_key?}], forbidden_terms}`. `scene_description` lấy từ `scenes`. Ảnh tham chiếu truyền
  bằng **`portrait_key`** (service đọc lại từ Storage), không bằng base64. `portrait_key` không tồn
  tại → `INVALID_INPUT` (lỗi của backend, không retry).
- Response: `{request_id, image_key, reference_used, usage}`.

Ví dụ: `docs/samples/images_scene_request.json`, `docs/samples/images_scene_response.json`.

Cả hai endpoint ảnh chạy `assert_no_forbidden_terms` trên các mô tả (docs 04) kể cả khi provider
là mock.

## `POST /v1/tts/synthesize`

- Request: `{request_id, storage_prefix, text, voice_id}`. `text` đã có tên thật (TTS được miễn
  chốt chặn tên thật). **Không log `text`.**
- `voice_id`: tên giọng preset của VieNeu (vd. `Kim Thanh`) hoặc bí danh của nó. **Rỗng** → giọng
  mặc định `TTS_DEFAULT_VOICE` (chỉ để gọi tay / script — Node luôn gửi tường minh). Không có trong
  danh sách → `INVALID_INPUT` (422, không đoán giọng gần đúng). Mock nhận mọi `voice_id`.
- Chuẩn hoá chữ: bỏ ký tự điều khiển / định dạng vô hình, rút khoảng trắng, giữ dấu câu và đoạn.
  **Số → chữ do VieNeu tự làm** (khác bản cũ của tài liệu này, xem README "TTS"). Không còn chữ nào
  đọc được → `INVALID_INPUT`.
- Response: `{request_id, audio_key, duration_seconds, usage}`. `usage.units` = số giây audio làm
  tròn lên; `estimated_cost_micros = 0` (tự host).
- Lỗi: model lỗi → `PROVIDER_ERROR` (retryable); quá `TTS_TIMEOUT_SECONDS` → `TIMEOUT`. Service đọc
  **một đoạn mỗi lúc**: request đến khi đang đọc thì chờ — Node không được gửi song song.

Ví dụ: `docs/samples/tts_synthesize_request.json`, `docs/samples/tts_synthesize_response.json`.

## Lưu trữ: `storage_prefix` và key trả về

Service **upload ảnh / audio lên Storage rồi trả key, không trả bytes** (BullMQ giữ return value
của job trong Redis; base64 vài MB mỗi ảnh sẽ làm phình Redis). Chọn backend theo credential:
`CloudinaryStorage` khi đủ `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`,
không thì `SupabaseStorage` khi có `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, không thì `LocalStorage`
(cảnh báo trong log). `/health` báo `storage_backend` (`cloudinary` / `supabase` / `local`). Key trả
về giống nhau ở cả ba backend.

`storage_prefix` là chuỗi **opaque** do Node đặt: service `rstrip('/')` rồi nối tên file, không
parse ngữ nghĩa. Nhưng nó **được kiểm** vì thành đường dẫn file (với `LocalStorage` là filesystem
thật). Sai → `INVALID_INPUT`, không gọi provider, không ghi file nào:

- chỉ gồm `[A-Za-z0-9/_\-.]`, dài 1–200 ký tự;
- không bắt đầu bằng `/`, không có `\`, không có đoạn (giữa hai `/`) bằng `..`.

`characters[].portrait_key` (đường dẫn service **đọc**) cùng luật. `request_id` của ảnh / TTS cũng đi
vào tên file: `[A-Za-z0-9_\-.]`, 1–100 ký tự, khác `.` và `..` (Node gửi UUID).

Tên file **tất định theo `request_id`** để BullMQ chạy lại job thì ghi đè (upsert), không để file mồ
côi:

| Endpoint | Key |
|---|---|
| `/v1/images/portrait` | `<prefix>/<request_id>-1.png`, `<prefix>/<request_id>-2.png` |
| `/v1/images/scene` | `<prefix>/<request_id>-1.png` |
| `/v1/tts/synthesize` | `<prefix>/<request_id>-1.mp3` (vieneu) · `-1.wav` (mock) |

Ảnh hiện là **PNG** (mock; WebP cần Pillow ở M4a). Audio của VieNeu là **MP3 mono 48 kHz** (qua
`soundfile`, không ffmpeg; `TTS_AUDIO_FORMAT=wav` để lấy WAV); mock trả WAV rỗng 44 byte. Backend đọc
định dạng từ đuôi key, đừng giả định.

## `GET /health`

Không cần token, không gọi provider. Trả các khoá: `status`, `llm_provider`, `llm_model`,
`image_profile_portrait`, `image_profile_scene`, `tts_provider`, `tts_default_voice`, `storage_backend`. (`/ready` là
bí danh, không có trong OpenAPI.)

## `__force` (chỉ cho mock)

Field **cấp cao nhất** của body, optional, có ở mọi endpoint (không nằm trong phong bì con nào;
đặt trong object con thì bị từ chối như field lạ). Giá trị: `SAFETY_BLOCKED` · `PROVIDER_ERROR` ·
`TIMEOUT` · `OUTPUT_INVALID` · `INVALID_OUTPUT_ONCE`; giá trị khác → `INVALID_INPUT`.

- Provider của endpoint đó **không phải mock** (`LLM_PROVIDER=gemini`…) mà request có `__force` →
  `INVALID_INPUT`, trước khi làm gì khác (không lặng lẽ bỏ qua, để script E2E chạy nhầm môi trường
  không gọi Gemini thật).
- `SAFETY_BLOCKED` / `PROVIDER_ERROR` / `TIMEOUT` ném đúng mã đó. `OUTPUT_INVALID` ở
  `/v1/story/generate` sinh output sai cả hai lần (đi qua vòng thử lại thật, ra `OUTPUT_INVALID` có
  `usage`, `attempts = 2`); ở ảnh / TTS ném thẳng.
- `INVALID_OUTPUT_ONCE` (sai lần 1, đúng lần 2) chỉ có nghĩa ở `/v1/story/generate`; gửi cho ảnh /
  TTS → `INVALID_INPUT`.

## Lỗi

Mọi lỗi trả cùng một dạng, `usage` (optional, cùng shape `Usage`) nằm **cạnh** `error`, không nằm
trong nó:

```json
{
  "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false },
  "usage": { "provider": "gemini", "model": "…", "input_tokens": 5210, "output_tokens": 3874,
             "units": 0, "estimated_cost_micros": 0, "latency_ms": 17340, "attempts": 2 }
}
```

`message` tiếng Việt, không lặp lại giá trị đầu vào (lỗi validate chỉ giữ vị trí + lý do).

| Code | HTTP | `retryable` | Ý nghĩa với backend |
|---|---|---|---|
| `INVALID_INPUT` | 422 | false | Lỗi của backend (token sai, field lạ, `storage_prefix` bẩn, `__force` sai chỗ), không tính tiền. Code cũ trả 400, nay là 422 |
| `FORBIDDEN_TERM_DETECTED` | 422 | false | Backend chưa che tên, không tính tiền |
| `SAFETY_BLOCKED` | 422 | false | Bộ lọc an toàn của nhà cung cấp chặn, hoàn credit |
| `OUTPUT_INVALID` | 502 | false | AI trả sai sau khi đã thử lại, hoàn credit |
| `PROVIDER_ERROR` | 502 | true | Lỗi phía nhà cung cấp (429, 5xx, mạng, response rỗng) |
| `TIMEOUT` | 504 | true | Quá thời gian |

Backend (Node) đọc `body.error.retryable` **và** đối chiếu `body.error.code` với
`NON_RETRYABLE_ERROR_CODES` (4 mã `retryable: false`); tập này phải khớp `NON_RETRYABLE` ở
`app/errors.py`. Thiếu thân lỗi (service crash) → coi như `PROVIDER_ERROR`.

**Khi nào thân lỗi có `usage`** — khi ít nhất một lời gọi LLM đã trả response trong request đó, để
Admin đối soát tiền đã đốt (credit của phụ huynh vẫn hoàn như bảng trên):

| Lỗi | Có `usage`? |
|---|---|
| `INVALID_INPUT`, `FORBIDDEN_TERM_DETECTED` | không — chưa gọi |
| `SAFETY_BLOCKED` ở lần 1 hoặc 2 | có — response bị chặn vẫn mang token (`attempts = 1` ở lần 1) |
| `PROVIDER_ERROR` / `TIMEOUT` ở lần 1 | không — chưa có response nào |
| `PROVIDER_ERROR` / `TIMEOUT` ở lần 2 | có — số liệu của lần 1, `attempts = 2` |
| `OUTPUT_INVALID` | có — cả hai lần |
| Lần 2 hỏng khi lần 1 chỉ lệch độ dài | không ném lỗi — trả output lần 1 (fallback `DOWNGRADE`, docs 04) |

`attempts` đếm mọi lời gọi đã **bắt đầu**; token chỉ cộng từ lời gọi có response.

Số lời gọi Gemini tệ nhất cho một job (gồm cả BullMQ chạy lại): `PROVIDER_ERROR` / `TIMEOUT` = 6
(3 × 2), `SAFETY_BLOCKED` = 2, `OUTPUT_INVALID` = 2, hai mã còn lại = 0.
