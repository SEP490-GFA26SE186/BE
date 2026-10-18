# Thiết kế: AI Core Service — M1→M3 (luồng chữ) + đồng bộ hợp đồng với Node

- Ngày: 2026-09-28
- Phạm vi: `BE/ai/` (M1, M2, M3 trong `docs/09-roadmap.md`) + phần `BE/api/` và
  `BE/docs/contracts/` bắt buộc phải đổi theo
- Trạng thái: đã duyệt thiết kế, chờ lập implementation plan
- Bản này thay thế bản đầu (bản đầu giả định BullMQ/Redis đã bỏ và service không upload Storage —
  cả hai đều sai)
- Sửa 2026-09-30 (lúc lập plan): thêm mục 3.11 — tám quyết định bổ sung đã duyệt (fallback
  `DOWNGRADE`, số lời gọi tệ nhất, `usage` trong thân lỗi, token thinking + `OUTPUT_TRUNCATED`,
  kiểm `storage_prefix` + tên file tất định, chặn mạng chỉ ngoài loopback, `__force` cấp cao nhất,
  chỗ kiểm `OUTPUT_SCHEMA_INVALID`); các mục liên quan đã sửa theo

---

## 1. Bối cảnh và vấn đề

`BE/ai/docs/` mô tả một service, `BE/ai/app/` hiện đang là một service khác.

| | `docs/` (thiết kế hiện hành) | `app/` (code tồn dư) | Kết luận |
|---|---|---|---|
| Endpoint | `/v1/story/generate`, `/v1/images/portrait`, `/v1/images/scene`, `/v1/tts/synthesize` | `/v1/generate/story-page`, `/v1/generate/narration` | theo `docs/` |
| Đơn vị sinh chữ | cả truyện một lần | một trang + 3 lựa chọn A/B/C | theo `docs/` |
| Request | schema có kiểu chặt | phong bì lỏng `{jobId, idempotencyKey, storagePrefix, input}` | theo `docs/` |
| Mã lỗi | `INVALID_INPUT` / `FORBIDDEN_TERM_DETECTED` / `SAFETY_BLOCKED` / `OUTPUT_INVALID` / `PROVIDER_ERROR` / `TIMEOUT` | `blocked_content` / `invalid_input` / `provider_throttled` / … | theo `docs/` |
| Validator, guards, prompt | trung tâm của service | chưa có | phải viết mới |
| **Hàng đợi** | ~~bảng `ai_requests`~~ | **BullMQ + Redis** | **theo `app/` — `docs/01` sai** |
| **Ảnh / audio** | ~~trả base64~~ | **upload Storage, trả key** | **theo `app/` — `docs/05` sai** |

Hai dòng cuối là đính chính so với bản spec đầu. `docs/01-decisions.md` liệt kê "BullMQ / Redis"
trong mục **Đã bỏ**, nhưng thực tế nó đang chạy: `api/src/queues/ai.queue.js`,
`api/src/worker.js`, `api/src/workers/ai.processor.js`, và tài liệu đăng ký đồ án cũng ghi
*"Redis + BullMQ for async AI jobs"*.

`docs/01-decisions.md` mục "Đã bỏ" **đúng** ở những dòng còn lại — cây rẽ nhánh 3 lựa chọn, AI
viết lại một trang — và `BE/docs/db/schema_rev8.dbml` có
`ai_request_type = story_text | character_portrait | scene_image | narration`, khớp 1-1 với bốn
endpoint trong `docs/05-api-contract.md`.

**Kết luận:** phần *nội dung* của `docs/` là thiết kế thắng; phần *vận chuyển* (hàng đợi, storage)
thì `app/` đúng. Phần lõi giá trị của service — validator tất định, chốt chặn tên thật, prompt —
chưa tồn tại. Roadmap thực chất đang ở trước M1.

## 2. Mục tiêu và phạm vi

Dựng lại `BE/ai/` theo `docs/`, hoàn thành M1→M3, và đồng bộ hợp đồng với Node trong cùng một lần.

Thứ tự làm — **nối Gemini chữ sớm, trước validator**:

1. **M1 — khung service:** FastAPI, config, auth token, dạng lỗi thống nhất, `/health`, schema cho
   cả bốn endpoint (gồm `LlmStoryOutput`), ba mock provider, Storage. Mọi endpoint chạy được với mock.
2. **Thử Gemini sớm (spike)** — mục 2.1. Chạy truyện thật qua script, **chưa** nối vào endpoint.
3. **M2 — tiện ích tất định:** `text_utils`, `guards`, `validator` đủ bảng `docs/04`.
4. **M3 — hoàn thiện sinh truyện:** orchestrator (validate, vòng thử lại, trần token theo §8.1),
   nối `GeminiLLMProvider` vào `/v1/story/generate`, kiểm tra model lúc khởi động, `try_story.py`
   chạy toàn bộ pipeline.
5. **Đồng bộ Node:** `aiClient.js`, `ai.jobs.js`, `ai.processor.js`, `env.js`,
   `BE/docs/contracts/ai-service.md`. Làm được ngay sau M1 (hợp đồng đã cố định bằng schema),
   không phải chờ M3.

### 2.1 Spike Gemini — vì sao đi trước M2

Hai rủi ro lớn nhất của cả spec chỉ trả lời được bằng lời gọi thật, và câu trả lời có thể **đổi
thiết kế** — nên biết trước khi viết 22 luật validator:

- **Bộ lọc an toàn của Gemini** có chặn truyện EQ có xung đột (giật đồ chơi, ngã, khóc, hét) không
  (§9.3). Chặn thường xuyên → dừng hỏi, không tự nới ngưỡng.
- **Trần token đầu ra:** `TOKENS_PER_WORD` thực tế là bao nhiêu, và token "suy nghĩ" (thinking)
  của model có bị tính vào `max_output_tokens` rồi làm truyện cụt không. Chốt luôn cấu hình
  thinking (tắt, hay một budget cố định **cộng thêm** vào `max_output_tokens`) ở đây — mục 3.11.4.

Phạm vi spike — nhỏ, và mọi thứ viết ra đều **giữ lại** cho M3, không phải code vứt đi:

- `prompts/story.v1.md` bản nháp đầu.
- `GeminiLLMProvider` bản cơ bản: một lượt gọi, `response_schema = LlmStoryOutput`, cấu hình
  thinking tường minh, đọc `usage_metadata` (kể cả token thinking) + `finish_reason` + safety
  ratings. Chưa có vòng thử lại.
- `count_words` (kéo sớm từ M2 — cần để đo token/tiếng).
- `scripts/try_story.py --confirm`: chạy các sample request (tối thiểu: truyện chuẩn 8 trang + một
  truyện có xung đột mạnh + một truyện `custom` dài), in JSON thô, `finish_reason`, safety ratings,
  token vào/ra, token/tiếng đo được, output có parse được theo `LlmStoryOutput` không.

**Không** nối vào `/v1/story/generate`, **không** cho Node dùng: output chưa qua validator.

Kết quả spike ghi vào `docs/01-decisions.md` (`TOKENS_PER_WORD`, cấu hình thinking và giá trị
`LLM_THINKING_BUDGET`, mức độ bị chặn an toàn, SDK có tự retry không) trước khi bắt đầu M2. Nếu kết quả buộc đổi thiết kế (ví dụ phải đổi model, hoặc structured
output không dùng được với shape ở §5.4) thì sửa spec này trước, rồi mới làm tiếp.

**Gemini chỉ dùng cho chữ.** Sinh ảnh **không** dùng Gemini — ưu tiên model mã nguồn mở, miễn
phí (`docs/06` đang chọn `gemini-3.1-flash-image` là sai, sửa ở mục 12).

**Ngoài phạm vi:** M4a/M4b (adapter ảnh thật), M5 (VieNeu-TTS), M6 (Docker, log có cấu trúc). Ảnh
và TTS chỉ có schema + mock + đường upload Storage chạy thật.

**Cố ý không làm ở spec này:** `persistAiResult`, ghi `ai_requests`, giữ/trừ/hoàn credit — thuộc
spec Node `BE/api/docs/superpowers/specs/2026-09-30-story-generation-node-design.md`.

## 3. Quyết định đã chốt trong phiên thiết kế này

Chưa có trong `docs/01-decisions.md`, đã được người quyết định duyệt. Sẽ ghi ngược vào
`docs/01-decisions.md` khi cài đặt.

### 3.1 Chốt chặn tên thật: một tầng, chỉ kiểm request

`docs/04` mô tả một luật không tự nhất quán: *không phân biệt hoa thường + bỏ dấu + theo ranh giới
từ*, kèm ví dụ *"'An' không bị bắt nhầm trong 'an toàn'"*. Ba điều kiện này không cùng đúng được:
tiếng Việt tách tiếng bằng khoảng trắng nên `an` trong `an toàn` **là** một tiếng độc lập.

Hệ quả nếu cài đúng như docs viết:

| `forbidden_terms` | Câu bình thường | Sau khi bỏ dấu + lowercase | Bị chặn? |
|---|---|---|---|
| `Anh` | "{NV1} gọi **anh** ra chơi." | `anh` | có |
| `Chi` | "**Chị** dắt em vào lớp." | `chi` | có |
| `Nam` | "**Năm** nay {NV1} sáu tuổi." | `nam` | có |
| `Ly` | "Mẹ rót nước vào cái **ly**." | `ly` | có |
| `Đức` | "{NV1} có **đức** tính chăm chỉ." | `duc` | có |
| `An` | "{NV1} chơi **an** toàn ở nhà." | `an` | có |

Trẻ tên Anh / Chi / Nam / Ly / Hoa / Thu / Tâm / Bình gần như không bao giờ tạo được truyện. Đây là
nhóm tên phổ biến nhất, không phải trường hợp biên.

**Quyết định:** dựa trên việc rò rỉ thật trông như thế nào. Tên thật lọt ra là do backend quên
thay token; khi đó tên xuất hiện nguyên dạng như lưu trong DB — đúng dấu, đúng hoa thường.

- **Một tầng duy nhất** — ranh giới từ + **phân biệt hoa thường** + **giữ nguyên dấu**.
  `"An"` khớp `"An"`; không khớp `"an toàn"`; không khớp `"Ân"`.
  Dính → `FORBIDDEN_TERM_DETECTED`, không gọi AI.
- **Chỉ quét trường phụ huynh nhập:** `situation` và `characters[].description`. Tên trẻ chỉ có
  thể lọt vào từ đây. `topic.title` / `topic.guidance` do chuyên gia viết, không chứa tên trẻ —
  quét chúng chỉ sinh chặn nhầm (guidance mở đầu câu bằng "Anh chị em…" dính `Anh`).
- **Không kiểm output.** Request sạch thì Gemini không thể biết tên thật; chữ trùng trong output
  ("An toàn là trên hết.", "Hoa nở ngoài sân.") là trùng từ thông dụng, không phải rò rỉ. Kiểm
  output chỉ sinh báo nhầm, đốt thêm một lời gọi retry, và — tệ hơn — `detail` của issue dễ mang
  chính tên thật vào prompt lần thử lại. Bỏ bước 7 của `docs/04` và luật "Không chứa
  `forbidden_terms`" (`docs04:8`) trong bảng validator.
- **Không có tầng cảnh báo lỏng** (bỏ dấu + bỏ hoa thường): với trẻ tên Anh, gần như truyện nào
  cũng dính, warning thành nhiễu và Moderator sẽ bỏ qua cả warning thật.

Rủi ro còn lại: backend vừa quên thay token vừa viết sai hoa thường/sai dấu tên → lọt. Hai lỗi
phải xảy ra đồng thời; chấp nhận. Chữ hoa đầu câu trong `situation` ("An toàn là…" với trẻ tên
An) vẫn có thể chặn nhầm; hiếm, phụ huynh sửa câu là qua, và thất bại ở đây không tốn credit.

Vẫn đúng `CLAUDE.md` ("Gemini không bao giờ thấy tên thật. Chạy `assert_no_forbidden_terms`
trước mọi lời gọi ra ngoài") — luật đó nói về đầu vào.

### 3.2 LLM trả list, wire trả dict

`docs/samples/story_response.json` dùng dict khoá động (`pages: {"p1": …}`). JSON Schema mà Gemini
nhận cho structured output không diễn đạt được "object với khoá tuỳ ý", mà mỗi truyện có bộ
`page_id` khác nhau.

**Quyết định:** hai shape tách biệt.

- LLM trả list: `pages: [{page_id, scene_id, text}]`, `scenes: [{scene_id, description}]`,
  `checkpoints: [{checkpoint_id, type, …}]` — schema cố định, dùng được `response_schema` chặt.
- Service map sang dict đúng `docs/05` **sau khi** validate xong.

Thứ tự bắt buộc: **parse → validate trên list → map sang dict.** Map trước thì `page_id` trùng bị
dict nuốt im lặng và mất luật "đủ mọi id, không id lạ".

Shape response của `/v1/story/generate` trong `docs/05` và `docs/samples/` **không đổi**.

### 3.3 `SCENE_DESCRIPTION_MAX_WORDS` là hằng của service

`limits` do backend gửi không có giới hạn cho mô tả cảnh, nhưng công thức trần token đầu ra cần nó.
Thêm vào config (mặc định 30), ghi README là giá trị của service chứ không phải backend gửi. Nếu
sau này backend muốn kiểm soát thì thêm vào `limits`.

### 3.4 Hai luật validator thêm ngoài bảng `docs/04`

- `PREACHY_PHRASE` (mức `WARN`) — `docs/07` nêu "không giảng đạo lý" là nguyên tắc số 5 và nói
  thẳng là kiểm tra tất định được, danh sách cụm cấm lấy từ cấu hình. Để `WARN` vì cụm như
  "bài học" có thể xuất hiện chính đáng trong ngữ cảnh lớp học.
- `PAGE_SENTENCE_TOO_LONG` (mức `DOWNGRADE_AFTER_RETRY`) — `limits.sentence_max_words` có trong mọi
  request và `docs/03` ghi "Câu — tối đa 15", nhưng bảng `docs/04` dòng 13 chỉ liệt kê câu hỏi /
  phương án / gợi ý / phản hồi. Không có luật này thì đó là field gửi mà không ai đọc. Để mức hạ cấp
  thay vì `RETRY` cứng: một câu 16 tiếng không đáng làm hỏng cả truyện và tốn credit.

### 3.5 `extra="forbid"` và `snake_case`

- **`extra="forbid"`** trên mọi request model. Lý do chính: nếu backend gõ nhầm `forbiden_terms`,
  `extra="ignore"` sẽ lặng lẽ coi danh sách là rỗng và **gọi Gemini với tên thật trong payload** —
  đúng thứ `CLAUDE.md` bảo vệ gắt nhất. Hệ quả: Node bắt buộc phải sửa trước khi gọi được; vì lần
  này mình sửa cả hai bên nên không có giai đoạn lệch.
- **Wire `snake_case`**, đúng `docs/samples/`. Bỏ alias camelCase của code cũ.

### 3.6 BullMQ + Redis vẫn dùng; `ai_requests` là bản ghi, không phải hàng đợi

`docs/01-decisions.md` xếp "BullMQ / Redis" vào mục **Đã bỏ** — sai, phải chuyển về "Đã chốt".

Phân vai:

- **BullMQ (Redis)** — hàng đợi thực thi. `attempts: 3`, backoff exponential 2s,
  `concurrency: 3`. Nằm hoàn toàn ở Node. Service `ai` không có Redis, vẫn stateless.
- **Bảng `ai_requests`** — bản ghi: trạng thái, `credits_charged`, `input_tokens`,
  `output_tokens`, `output_units`, provider, model. Dùng cho credit, audit, đối soát Admin.
  `ai_request_status` (`queued/processing/succeeded/failed`) phản chiếu vòng đời job.

Ba bất biến của `BE/docs/contracts/ai-service.md` **giữ nguyên**: service `ai` không đọc/ghi
Postgres; `api` không được cấp `AI_SERVICE_URL` nên mọi yêu cầu sinh nội dung buộc đi qua queue;
service `ai` không dedupe theo `idempotency_key` (stateless, không làm được — chống trùng là việc
của BullMQ `jobId` + unique constraint ở DB).

### 3.7 Service upload Storage và trả key — đảo lại `docs/05`

`docs/05` nói ảnh/audio trả base64, service không upload. Sai trong kiến trúc có BullMQ:
**BullMQ lưu return value của job trong Redis**, nên trả base64 vài MB mỗi ảnh sẽ phình Redis rất
nhanh — Redis là bộ nhớ, không phải object storage.

**Quyết định:** giữ cơ chế của code cũ.

- `app/storage/` **giữ lại**: `Storage` protocol + `SupabaseStorage` + `LocalStorage` fallback.
  Đây là phần code cũ còn nguyên giá trị.
- Request ảnh/TTS có `storage_prefix` — **chuỗi opaque** do Node quyết định; service chỉ nối tên
  file vào sau, **không parse**, không đoán bên trong có story id hay không.
- Response trả **key**, không trả bytes.
- `/v1/story/generate` không có binary → không có `storage_prefix`, trả JSON thuần như cũ.

### 3.8 Ngân sách thời gian — một bất biến ba tầng

```
AI_TIMEOUT_MS (Node)  >  2 × LLM_TIMEOUT_SECONDS  +  overhead
```

`AI_TIMEOUT_MS` hiện là **12000** (`api/src/config/env.js:26`), đặt cho contract cũ — sinh *một
trang*. `docs/samples/story_response.json` ghi `latency_ms: 8400` cho **một** lời gọi truyện 8
trang; có thử lại nội bộ là ~17s.

Nếu giữ 12s: Gemini đang viết → Node abort → `TIMEOUT` → retryable → BullMQ chờ 2s chạy lại từ đầu
→ abort tiếp → 3 lần. **Ba lần sinh truyện đầy đủ bị vứt đi, tiền Gemini mất thật, job vẫn
failed.** Không sửa được từ phía `ai/`.

**Quyết định:** `LLM_TIMEOUT_SECONDS = 45` (thay vì 60) → nội bộ tệ nhất 90s. Timeout **theo loại
job** ở Node:

| Job | Endpoint | `timeoutMs` |
|---|---|---|
| `story_text` | `/v1/story/generate` | 120 000 |
| `character_portrait` | `/v1/images/portrait` | 90 000 |
| `scene_image` | `/v1/images/scene` | 90 000 |
| `narration` | `/v1/tts/synthesize` | 30 000 |

Một giá trị chung không dùng được: `narration` một trang không cần 120s.

Bất biến này **không cưỡng chế được bằng code** (hai service, hai process). Ghi vào
`BE/docs/contracts/ai-service.md` §6 và vào `BE/ai/README.md`.

### 3.9 Hai tầng retry — phân vai, và bảng phân loại lỗi

Giữ cả hai tầng vì chúng chữa hai bệnh khác nhau:

| Tầng | Sửa được | Không sửa được |
|---|---|---|
| **BullMQ** (3 lần, backoff 2s) | lỗi nhất thời: mạng đứt, Gemini 429/5xx, service restart | output sai schema — chạy lại cùng prompt vẫn sai |
| **Nội bộ service** (1 lần, kèm danh sách lỗi) | LLM trả output sai khung / sai độ dài | Gemini sập, hết quota |

Phải phân loại đúng, nếu không hai tầng nhân nhau:

| Mã | HTTP | `retryable` | BullMQ retry? | Lời gọi Gemini tệ nhất |
|---|---|---|---|---|
| `INVALID_INPUT` | 422 | false | không | 0 |
| `FORBIDDEN_TERM_DETECTED` | 422 | false | không | 0 |
| `SAFETY_BLOCKED` | 422 | false | không | 2 |
| `OUTPUT_INVALID` | 502 | false | không | 2 (đã thử lại nội bộ) |
| `PROVIDER_ERROR` | 502 | true | có, 3 lần | 6 (3 × 2) |
| `TIMEOUT` | 504 | true | có, 3 lần | 6 (3 × 2) |

Cột cuối là **số lời gọi mỗi lần chạy job × số lần BullMQ chạy job**:

- `SAFETY_BLOCKED` — lần 1 trả output sai khung, lần thử lại nội bộ bị bộ lọc chặn → 2 lời gọi. Không
  retryable nên BullMQ không nhân tiếp.
- `OUTPUT_INVALID` — đúng 2 lời gọi (lần 1 + 1 lần thử lại nội bộ), không retryable.
- `PROVIDER_ERROR` / `TIMEOUT` — mỗi lần chạy job, lần 1 có thể trả output sai rồi lần thử lại nội
  bộ mới gặp 5xx / hết giờ → 2 lời gọi; retryable nên BullMQ chạy tối đa 3 lần → 3 × 2 = 6. Lời gọi
  đã trả response ở mỗi lần chạy được báo trong `usage` của thân lỗi (mục 3.11.3), nên Admin thấy
  được tiền đã đốt.

Bảng chỉ đúng khi SDK `google-genai` **không tự retry** bên trong một lời gọi — nếu có, nó nhân thêm
một tầng thứ ba. `GeminiLLMProvider` tắt (hoặc xác minh là không có) retry tự động của SDK (mục 9.3).

Hiện Node tra `errorKind` vào set cứng `{blocked_content, invalid_input}` (`aiClient.js:16,31`).
Mã mới không khớp cái nào → mọi lỗi thành retryable → `SAFETY_BLOCKED` ngốn 6 lời gọi. Đây là điều
mà chính comment trong `aiClient.js` nói là phải tránh.

**Quyết định:** Node đọc `body.error.retryable` **và** đối chiếu `body.error.code` với
`NON_RETRYABLE_ERROR_CODES` mới. Thiếu thân lỗi (service crash trước khi vào handler) → mặc định
`PROVIDER_ERROR`, retryable — giữ nguyên hành vi hiện tại.

### 3.10 NFR 15s — giữ số, định nghĩa lại đơn vị

Tài liệu đăng ký đồ án ghi *"story page generation ≤ 15s via BullMQ"*. Nhóm đã chốt AI viết **cả
truyện một lần**, nên đơn vị "một trang" không còn.

**Quyết định:** giữ nguyên NFR 15s, hiểu là **độ trễ nhận việc** — thời gian từ lúc phụ huynh bấm
tạo truyện tới lúc giao diện phản hồi. BullMQ vốn bất đồng bộ: request trả ngay sau khi enqueue,
UI hiện tiến trình. Thời gian sinh truyện thực tế là **một số đo riêng**, đo bằng
`scripts/try_story.py` và ghi vào báo cáo, không phải NFR.

Không phải sửa tài liệu đã nộp.

### 3.11 Tám quyết định bổ sung (duyệt 2026-09-30)

Phát hiện khi rà spec lúc lập plan; đã được duyệt. Các mục khác đã sửa theo.

1. **Fallback `DOWNGRADE`.** Nếu lần 1 chỉ có issue `DOWNGRADE` (có thể kèm `WARN`) — tức lần 1 lẽ
   ra đã được *nhận* nếu nó là lần 2 — mà lần 2 **hỏng vì bất kỳ lý do gì** (còn issue `RETRY`, bị
   cắt cụt / không parse được, hoặc provider ném `PROVIDER_ERROR` / `TIMEOUT` / `SAFETY_BLOCKED`),
   service **trả output của lần 1**, hạ các issue `DOWNGRADE` của lần 1 thành `warnings` (cộng
   `WARN` của lần 1), **không** ném lỗi. Lý do: lần thử lại để sửa một trang 80 tiếng mà làm hỏng
   khung (hay gặp lỗi provider) thì không được biến một truyện dùng được thành lỗi. `usage` vẫn
   cộng cả hai lần, gồm cả token của lời gọi bị chặn (mục 8.3). Mục 8 bước 7. *(Mở rộng sang lỗi
   provider: fix round 1 của Task 12, 2026-10-04.)*
2. **Số lời gọi tệ nhất** trong bảng 3.9 tính cả thử lại nội bộ: `PROVIDER_ERROR` / `TIMEOUT` = 6
   (3 × 2), `SAFETY_BLOCKED` = 2, `OUTPUT_INVALID` = 2.
3. **`usage` trong thân lỗi.** Thân lỗi có thêm `usage` (optional, cùng shape `Usage`) khi **ít nhất
   một lời gọi LLM đã trả response** trong request đó: `OUTPUT_INVALID`; `SAFETY_BLOCKED` (response
   bị chặn vẫn có `usage_metadata`); `PROVIDER_ERROR` / `TIMEOUT` xảy ra ở lần 2. Chưa có response
   nào (lỗi đầu vào, lỗi mạng / hết giờ ở lần 1) → không có `usage`. Để Admin đối soát được tiền đã
   đốt vào lần sinh hỏng; credit của phụ huynh vẫn hoàn như cũ. Mục 4.3, 8.3.
4. **Token thinking.** `GeminiLLMProvider` đặt cấu hình thinking **tường minh** (không dựa vào mặc
   định của model): tắt, hoặc một budget cố định `LLM_THINKING_BUDGET` **cộng thêm** vào
   `max_output_tokens` — chọn bằng spike (§2.1) và ghi vào `docs/01-decisions.md`. `finish_reason =
   MAX_TOKENS` là issue riêng `OUTPUT_TRUNCATED` (`RETRY`), không lẫn vào `OUTPUT_SCHEMA_INVALID`;
   lần thử lại khi có `OUTPUT_TRUNCATED` **nâng** `max_output_tokens` lên
   `LLM_TRUNCATION_RETRY_FACTOR` (mặc định 1.5) lần thay vì lặp lại cùng trần. Mục 4.4, 7.3, 8.
5. **`storage_prefix` opaque nhưng được kiểm.** Không parse ngữ nghĩa, nhưng phải: chỉ gồm
   `[A-Za-z0-9/_\-.]`, không có đoạn `..`, không bắt đầu bằng `/`, không có `\`, dài tối đa 200 →
   sai thì `INVALID_INPUT`. Tên file **tất định theo `request_id`** (`<prefix>/<request_id>-<n>.<ext>`)
   để BullMQ chạy lại job thì **ghi đè** (upsert) file cũ thay vì để lại file mồ côi. Mục 5.6.
6. **Chặn mạng trong test chỉ chặn kết nối ngoài loopback.** Trên Windows, event loop của asyncio
   dựng self-pipe bằng `socket.socketpair()`, mà CPython trên Windows giả lập hàm này bằng một kết
   nối TCP tới `127.0.0.1`. Vá `socket.socket` toàn bộ sẽ làm vỡ chính event loop của test. Nên vá
   `socket.socket.connect` và `socket.getaddrinfo`: cho qua `127.0.0.1` / `::1` / `localhost` (và
   socket AF_UNIX), mọi địa chỉ khác ném ngay. Mục 10.2.
7. **`__force` là field cấp cao nhất, optional, trên mọi endpoint**, khai báo bằng alias Pydantic
   (tên field `force_`, alias `__force` — Pydantic coi tên bắt đầu bằng `_` là thuộc tính private
   nên không đặt thẳng được). Giá trị: `SAFETY_BLOCKED` · `PROVIDER_ERROR` · `TIMEOUT` ·
   `OUTPUT_INVALID` · `INVALID_OUTPUT_ONCE`. Provider cấu hình cho endpoint đó **không phải mock** mà
   request có `__force` → 422 `INVALID_INPUT`. Phía Node đã gửi `__force` ở cấp cao nhất với đúng
   các mã này. Mục 4.3.
8. **`OUTPUT_SCHEMA_INVALID` (#1) và `OUTPUT_TRUNCATED` (#22)** có mặt trong registry để test phủ
   bảng `docs/04` đếm được dòng `docs04:1`, nhưng hàm `check` của chúng không sinh issue — việc
   kiểm thật diễn ra ở bước parse của orchestrator (`ValidationContext` cần một output **đã parse**,
   mà hai lỗi này chính là không có output đó). Orchestrator dựng `Issue` với `code` / `severity`
   lấy từ registry, không viết cứng lần hai. Mục 7.3, 8.

## 4. Kiến trúc `BE/ai`

### 4.1 Số phận code cũ

Giữ, viết lại nội dung:

| File | Xử lý |
|---|---|
| `app/main.py` | Giữ kiến trúc "endpoint không tự đặt status code, chỉ `raise AiError`, một exception handler duy nhất". Giữ cả bốn handler (`AiError`, `RequestValidationError`, `NotImplementedError`, `Exception`); ghi đè `RequestValidationError` vẫn cần. Đổi dạng thân lỗi, bảng mã, router. |
| `app/deps.py` | Giữ gần nguyên; đổi lỗi trả về thành `INVALID_INPUT`. |
| **`app/storage/`** | **Giữ toàn bộ** (`__init__.py`, `supabase.py`, `local.py`) — mục 3.7. |
| `app/errors.py` | Viết lại bảng mã theo `docs/05`. |
| `app/config.py` | Viết lại danh sách env. |
| `app/api/health.py` | Viết lại theo `docs/05`: `/health` không cần token, trả provider + profile đang dùng cho chữ / chân dung / cảnh / giọng đọc + `storage_backend`. Giữ `/ready` làm alias. |

Xoá: `app/api/v1/story_page.py` · `app/api/v1/narration.py` · `app/schemas/envelope.py` ·
`app/providers/{base,mock,gemini,__init__}.py` · `tests/{conftest,test_errors,test_story_page}.py`.

`tests/test_auth.py` giữ ý, sửa theo mã lỗi mới.

### 4.2 Cây thư mục

```
app/
  main.py  config.py  errors.py  deps.py
  api/health.py
  api/v1/story.py  api/v1/images.py  api/v1/tts.py
  schemas/  common.py  story.py  images.py  tts.py  llm.py
  prompts/story.v1.md
  providers/
    llm/    base.py  mock.py  gemini.py
    image/  base.py  mock.py
    tts/    base.py  mock.py
  storage/  __init__.py  supabase.py  local.py      ← giữ từ code cũ
  core/
    story.py  mapping.py  usage.py
    text_utils.py  guards.py
    validator/  __init__.py  rules.py  context.py  issues.py
  content_rules.yaml
scripts/try_story.py
tests/  conftest.py  fixtures/  unit/  api/  providers/
```

`validator/` là package: registry 22 luật + context + issue types trong một file sẽ phình.

Chỗ để sẵn cho mốc sau (không tạo lần này):
`providers/image/{port,registry,adapters,decorators,safety}`, `providers/tts/vieneu.py`,
`prompts/image_style.v1.md`, `app/image_models.yaml`, `app/workflows/`.

### 4.3 Bảng mã lỗi

```python
class ErrorCode(StrEnum):
    INVALID_INPUT           = "INVALID_INPUT"            # 422
    FORBIDDEN_TERM_DETECTED = "FORBIDDEN_TERM_DETECTED"  # 422
    SAFETY_BLOCKED          = "SAFETY_BLOCKED"           # 422
    OUTPUT_INVALID          = "OUTPUT_INVALID"           # 502
    PROVIDER_ERROR          = "PROVIDER_ERROR"           # 502
    TIMEOUT                 = "TIMEOUT"                  # 504

NON_RETRYABLE: frozenset[ErrorCode] = frozenset({
    INVALID_INPUT, FORBIDDEN_TERM_DETECTED, SAFETY_BLOCKED, OUTPUT_INVALID,
})
```

Thân lỗi theo `docs/05`, bọc trong khoá `error`:

```json
{ "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false } }
```

Khi đã có ít nhất một lời gọi LLM trả response (mục 3.11.3), thân lỗi có thêm `usage` cùng shape
`Usage` của response thành công:

```json
{
  "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false },
  "usage": {
    "provider": "gemini", "model": "…", "input_tokens": 5210, "output_tokens": 3874,
    "units": 0, "estimated_cost_micros": 0, "latency_ms": 17340, "attempts": 2
  }
}
```

`usage` nằm **cạnh** `error`, không nằm trong nó — `error` giữ đúng ba khoá Node đang đọc. `AiError`
mang một field optional `usage: Usage | None`; handler duy nhất ở `main.py` thêm khoá khi field khác
`None`.

`NON_RETRYABLE` ở đây và `NON_RETRYABLE_ERROR_CODES` ở `aiClient.js` **phải khớp nhau** — giữ đúng
tinh thần của `BE/docs/contracts/ai-service.md` §5: bảng lỗi được thực thi bằng code ở hai nơi.

Bỏ so với code cũ:

- `PROVIDER_THROTTLED` / 429 — không có trong `docs/05`. Gemini 429 map vào `PROVIDER_ERROR`
  (`retryable: true`), BullMQ vẫn retry đúng với backoff.
- `status: "succeeded" | "failed"` ở cấp cao nhất. Response thành công là chính nội dung.

Giữ: cờ `__force` của mock — thứ duy nhất cho người làm Node test được từng nhánh lỗi mà không cần
API key. Theo mục 3.11.7:

- **Cấp cao nhất** của body, không nằm trong phong bì `input` như code cũ. Khai báo trên model gốc
  dùng chung của mọi request: field `force_`, kiểu `ForceCode | None`, mặc định `None`, alias
  `__force`. Vì `extra="forbid"`, không khai báo thì `__force` bị từ chối như field lạ.
- `ForceCode`: `SAFETY_BLOCKED` · `PROVIDER_ERROR` · `TIMEOUT` · `OUTPUT_INVALID` ·
  `INVALID_OUTPUT_ONCE`. Giá trị khác → `INVALID_INPUT` (lỗi validate của Pydantic).
- Provider cấu hình cho endpoint đó (`LLM_PROVIDER` cho chữ, `TTS_PROVIDER` cho giọng đọc; ảnh hiện
  chỉ có mock) **không phải mock** mà có `__force` → 422 `INVALID_INPUT`, trước khi làm gì khác.
  Không lặng lẽ bỏ qua: bỏ qua thì một script E2E chạy nhầm môi trường sẽ gọi Gemini thật mà tưởng
  đang test nhánh lỗi.
- Hành vi ở mock: `SAFETY_BLOCKED` / `PROVIDER_ERROR` / `TIMEOUT` ném đúng mã đó. `OUTPUT_INVALID` ở
  `/v1/story/generate` sinh output sai **cả hai lần** (đi qua vòng thử lại thật, ra `OUTPUT_INVALID`
  có `usage`, `attempts = 2`); ở ảnh / TTS ném thẳng `OUTPUT_INVALID`. `INVALID_OUTPUT_ONCE` chỉ có
  nghĩa ở `/v1/story/generate` (sai lần 1, đúng lần 2) — gửi cho ảnh / TTS → `INVALID_INPUT`.
- `SAFETY_BLOCKED` ở mock chữ mô phỏng Gemini: lời gọi đã "trả response" nên lỗi có `usage`
  (`attempts = 1`); `PROVIDER_ERROR` / `TIMEOUT` ở lần 1 thì không có `usage`.

### 4.4 Config

```
INTERNAL_TOKEN=
LLM_PROVIDER=mock                  # mock | gemini
TTS_PROVIDER=mock
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=
LLM_TIMEOUT_SECONDS=45             # mục 3.8
LLM_TEMPERATURE=                   # trống = mặc định SDK
LLM_RETRY_TEMPERATURE=             # trống = không gửi (mặc định model); xem mục 8.2
LLM_THINKING_BUDGET=0              # 0 = tắt thinking; > 0 = budget cố định cộng thêm vào trần (3.11.4); chốt ở spike
LLM_TRUNCATION_RETRY_FACTOR=1.5    # lần thử lại sau OUTPUT_TRUNCATED nhân trần token với hệ số này
TOKENS_PER_WORD=2.8
SCENE_DESCRIPTION_MAX_WORDS=30
IMAGE_PROFILE_PORTRAIT=mock        # chỉ để /health báo; profile thật chọn ở M4b
IMAGE_PROFILE_SCENE=mock
SUPABASE_URL=                      # trống → LocalStorage
SUPABASE_SERVICE_KEY=
SUPABASE_BUCKET=story-assets
PRICE_TEXT_INPUT_PER_MTOK_MICROS=0
PRICE_TEXT_OUTPUT_PER_MTOK_MICROS=0
LOG_LEVEL=INFO
```

Chưa khai biến của M4b/M5 (`COMFYUI_URL`, `HF_API_TOKEN`, `ALLOW_NONCOMMERCIAL_MODELS`,
`IMAGE_DEV_MAX_CALLS`, `VIENEU_MODEL_PATH`, `TTS_BITRATE`, `IMAGE_TIMEOUT_SECONDS`,
`IMAGE_OUTPUT_WIDTH`, `PRICE_IMAGE_PER_UNIT_MICROS`) — khai sớm mà chưa ai đọc chỉ là code chết.

Xoá: `AI_PROVIDER` (tách thành `LLM_PROVIDER` / `TTS_PROVIDER`), `PROVIDER_TIMEOUT_SECONDS`.

**Không có `DATABASE_URL`, không có `REDIS_URL`** — bất biến của `BE/docs/contracts`, có test kiểm.

### 4.5 Dependencies

Thêm `google-genai` (runtime), `pyyaml` (runtime — đọc `app/content_rules.yaml`, mục 7.3; hiện chỉ có
mặt gián tiếp qua `uvicorn[standard]`, không được dựa vào đó) và `respx` (dev). Chưa thêm `Pillow` /
`ffmpeg`.

## 5. Schemas

### 5.1 Quy ước

Wire `snake_case`. Mọi request có `request_id`; mọi response echo `request_id` + `usage`
(+ `prompt_version` nếu có prompt). Thân lỗi có `usage` khi đã có lời gọi LLM trả response (mục
3.11.3). Mọi request có field optional `__force` (mục 4.3).

Service **không** nhận `idempotency_key`: nó stateless, không dedupe được, nhận vào chỉ tạo ảo giác
được bảo vệ. Chống trùng là việc của BullMQ `jobId` + unique constraint ở DB. `request_id` đủ để
đối chiếu log hai bên.

```python
class Usage(BaseModel):
    provider: str
    model: str | None
    input_tokens: int = 0
    output_tokens: int = 0
    units: int = 0                 # số ảnh / số giây audio
    estimated_cost_micros: int = 0
    latency_ms: int
    attempts: int = 1

class Warning(BaseModel):
    code: str
    target_id: str | None
    detail: str
```

### 5.2 Request sinh truyện

Theo `docs/05` + `docs/samples/story_request.json`: `topic{title, competency, guidance}`,
`characters[{token, description, is_main}]`, `situation`, `tone`, `pages[]`,
`checkpoints[{id, type, after, target?}]`, `limits{…}`, `forbidden_terms[]`,
`blocked_keywords[{keyword, severity}]`.

- `competency` — enum 5 năng lực CASEL (`docs/02`)
- `tone` — `gentle | playful`
- `severity` — `warn | block`
- `token` — khớp `^\{NV\d+\}$`
- `limits` — **bắt buộc**, không có giá trị mặc định viết cứng (`CLAUDE.md`)

### 5.3 Ranh giới: Pydantic kiểm gì, registry kiểm gì

**Pydantic (request) — chỉ toàn vẹn tham chiếu.** Lỗi ở đây là `INVALID_INPUT`:

- `page_id` không trùng nhau; `checkpoint.id` không trùng nhau
- `checkpoint.after` thuộc `pages`; tối đa 1 checkpoint mỗi trang
- đúng một `is_main = true`
- `target` bắt buộc với `emotion_other` / `perspective`, và phải là token đã khai
- token khớp `{NVn}`

**Pydantic KHÔNG kiểm chính sách cấu trúc truyện** — không kiểm "4–20 trang", "reflection chỉ ở
cuối", "không đặt sau trang 1". `docs/03` nói rõ bảng đó là để hiểu ngữ cảnh, *"service không tự áp
dụng"*; backend đã kiểm khi lưu. Service phải chấp nhận đúng khung được gửi, kể cả truyện `custom`.
Nhét các luật đó vào đây là vi phạm *"không tự thay đổi cấu trúc truyện"*.

**Registry (output) — mọi thứ trong bảng `docs/04`.** Lỗi ở đây là `OUTPUT_INVALID` hoặc
`warnings`. Mục 7.

### 5.4 Shape LLM

`response_schema` của Gemini không diễn đạt tốt `oneOf`, mà 5 kiểu checkpoint có shape khác nhau.
Dùng **một model checkpoint phẳng, field theo kiểu là optional**; registry mới là chỗ ép đúng kiểu:

```python
class LlmPage(BaseModel):
    page_id: str
    scene_id: str
    text: str

class LlmScene(BaseModel):
    scene_id: str
    description: str

class LlmOption(BaseModel):
    option_id: str | None = None   # perspective: "o1"…
    role: str | None = None        # problem_solving: constructive|avoidant|impulsive
    text: str
    feedback: str | None = None    # chỉ problem_solving

class LlmCheckpoint(BaseModel):
    checkpoint_id: str
    type: str
    question: str
    answer: str | None = None      # BẮT BUỘC theo kiểu — cưỡng chế ở validator/rules.py
    hint: str | None = None
    options: list[LlmOption] = []

class LlmStoryOutput(BaseModel):
    pages: list[LlmPage]
    scenes: list[LlmScene]
    checkpoints: list[LlmCheckpoint]
```

Cố ý để Pydantic **không** bắt "thiếu `answer` cho `emotion_self`": `ValidationError` nói
`checkpoints.0.answer: Field required` — `checkpoints.0` là chỉ số mảng, không phải `k1`, và qua
union thì báo lỗi cho cả 5 nhánh. `docs/04` yêu cầu lần thử lại gửi kèm **danh sách lỗi cụ thể**;
registry sinh được câu ghép thẳng vào prompt, Pydantic thì không. Nếu cả hai cùng kiểm, luật bị
nhân đôi và lần retry mất thông tin.

Rủi ro: field trông như optional. Chặn bằng comment tại chỗ và bằng
`test_all_checkpoint_types_covered` (mục 10).

### 5.5 Response sinh truyện

Đúng `docs/samples/story_response.json`: `pages: {page_id: {scene, text}}`, `scenes: {scene_id: str}`,
`checkpoints: {checkpoint_id: …}` với union 4 shape theo `type` (`emotion_self` / `emotion_other`
chung shape), `warnings[]`, `prompt_version`, `usage`.

`problem_solving.options` ra wire là dict khoá theo vai (`constructive` / `avoidant` / `impulsive`);
`perspective.options` là dict khoá theo `option_id`.

### 5.6 Ảnh và TTS — có `storage_prefix`, trả key

Đổi so với `docs/05` theo mục 3.7.

| Endpoint | Request | Response |
|---|---|---|
| `POST /v1/images/portrait` | `{request_id, storage_prefix, description, forbidden_terms}` | `{request_id, portrait_keys: [k1, k2], usage}` |
| `POST /v1/images/scene` | `{request_id, storage_prefix, scene_description, characters[{description, portrait_key?}], forbidden_terms}` | `{request_id, image_key, reference_used, usage}` |
| `POST /v1/tts/synthesize` | `{request_id, storage_prefix, text, voice_id}` | `{request_id, audio_key, duration_seconds, usage}` |

`storage_prefix` là **chuỗi opaque**: service `rstrip('/')` rồi nối tên file, không parse ngữ
nghĩa. Nhưng **được kiểm** (mục 3.11.5), vì service ghi file theo nó — với `LocalStorage` là đường
dẫn filesystem thật:

- chỉ gồm `[A-Za-z0-9/_\-.]`; dài 1–200 ký tự;
- không bắt đầu bằng `/`; không có `\`; không có đoạn (giữa hai `/`) bằng `..`.

Sai → `INVALID_INPUT` (lỗi validate của Pydantic, không gọi provider). Với ảnh / TTS, `request_id`
cũng đi vào tên file nên cũng được kiểm: `[A-Za-z0-9_\-.]`, 1–100 ký tự, không phải `.` / `..` (Node
gửi UUID, luôn qua). `characters[].portrait_key` của ảnh cảnh là đường dẫn service **đọc** — kiểm
cùng luật với `storage_prefix` (một kiểu `StorageKey` dùng chung), nếu không `../` đọc được file
ngoài thư mục của `LocalStorage`.

Tên file **tất định theo `request_id`** để BullMQ chạy lại job thì ghi đè (upsert) thay vì để lại file
mồ côi:

| Endpoint | Key |
|---|---|
| `/v1/images/portrait` | `<prefix>/<request_id>-1.png`, `<prefix>/<request_id>-2.png` |
| `/v1/images/scene` | `<prefix>/<request_id>-1.png` |
| `/v1/tts/synthesize` | `<prefix>/<request_id>-1.wav` |

(Đuôi theo định dạng mock — mục 9.6.) `SupabaseStorage.upload` đã gửi `x-upsert: true`;
`LocalStorage.upload` ghi đè file sẵn có.

Ảnh cảnh nhận ảnh tham chiếu bằng **`portrait_key`** (đọc lại từ Storage) chứ không bằng base64 —
cùng lý do 3.7, và tránh payload HTTP vài MB.

Hai endpoint ảnh **vẫn chạy `assert_no_forbidden_terms`** dù là mock. TTS miễn trừ — `docs/04` nói
rõ TTS được phép nhận tên thật, chạy trên server của nhóm. Chốt chặn tên thật có hiệu lực thật ngay
từ M1.

## 6. `text_utils` và `guards`

```python
def count_words(text: str) -> int
def split_sentences(text: str) -> list[str]
```

Không có `strip_accents` / `normalize_for_match`: chúng chỉ phục vụ tầng cảnh báo lỏng đã bỏ ở
mục 3.1.

**`count_words`** — `docs/04`: tách khoảng trắng; `{NV1}` tính 1 tiếng; bỏ dấu câu đứng riêng. Cài:
split theo whitespace, giữ token chứa ít nhất một ký tự chữ/số **hoặc** khớp `{NVn}`.
`"brừm brừm."` = 2; `"{NV1},"` = 1; `"—"` = 0; `"..."` = 0.

**`split_sentences`** — cắt ở `.` `!` `?` `…`. **Không cắt ở `:`**: `docs/samples` dùng dấu hai chấm
cho lời thoại (`"{NV1} nói nhỏ: con giận vì em lấy xe của con."`), cắt ở đó sẽ đếm sai thành hai câu
ngắn và luật 15 tiếng mất tác dụng đúng chỗ dễ vi phạm nhất.

**`guards`** — một tầng theo mục 3.1, chỉ chạy trên request, trước khi gọi AI:
`situation`, `characters[].description`; ảnh: `description`, `scene_description`,
`characters[].description`. Không quét output. TTS miễn trừ.

Chuẩn hoá cả hai phía về **NFC** trước khi so: giữ nguyên dấu không có nghĩa là so byte thô —
`"Đức"` gõ từ bàn phím macOS/iOS có thể ra NFD, lưu DB là NFC, và so thô sẽ lọt. NFC không đổi hoa
thường hay dấu nên không làm lỏng luật. Có test riêng.

## 7. Validator

### 7.1 Mức độ

```python
class Severity(StrEnum):
    RETRY                 = "retry"      # sai → thử lại
    WARN                  = "warn"       # nhận, ghi warnings
    DOWNGRADE_AFTER_RETRY = "downgrade"  # lần 1 thử lại; lần 2 nhận + warning
```

`DOWNGRADE_AFTER_RETRY` diễn đạt đúng hai dòng liền nhau trong `docs/04` — *"vượt độ dài > 10% → thử
lại"* và *"vẫn vượt sau lần thử lại → nhận, ghi warnings"*. Không có nó thì logic "đang ở lần thứ
mấy" sẽ rải vào từng hàm check.

### 7.2 Kiểu dữ liệu

```python
@dataclass(frozen=True)
class Issue:
    code: str                 # machine id, SCREAMING_SNAKE
    target_id: str | None     # "p3" | "k1" | "s2" | None
    detail: str               # tiếng Việt, câu người đọc được
    severity: Severity

@dataclass(frozen=True)
class ValidationContext:
    frame: StoryGenerateRequest
    output: LlmStoryOutput
    attempt: int

@dataclass(frozen=True)
class Rule:
    code: str
    severity: Severity
    doc_row: str                                # "docs04:11"
    check: Callable[[ValidationContext], Iterable[Issue]]

RULES: tuple[Rule, ...] = (...)
```

`detail` viết **tiếng Việt**: nó đi vào prompt lần thử lại và vào `warnings[].detail` trả cho backend
để Moderator đọc — là nội dung, không phải log. `code` tiếng Anh. Ngoại lệ có chủ ý so với quy tắc
"log tiếng Anh" của `CLAUDE.md`, ghi chú tại chỗ.

`doc_row` cho phép viết test khẳng định không sót dòng nào trong bảng `docs/04`.

### 7.3 Registry

| # | `code` | Severity | Nguồn |
|---|---|---|---|
| 1 | `OUTPUT_SCHEMA_INVALID` | RETRY | docs04:1 |
| 2 | `PAGE_IDS_MISMATCH` | RETRY | docs04:2 |
| 3 | `CHECKPOINT_IDS_MISMATCH` | RETRY | docs04:2 |
| 4 | `PAGE_SCENE_MISSING` | RETRY | docs04:3 |
| 5 | `SCENE_COUNT_EXCEEDED` | RETRY | docs04:3 |
| 6 | `SCENE_DESCRIPTION_MISSING` | RETRY | docs04:3 |
| 7 | `EMOTION_ANSWER_INVALID` | RETRY | docs04:4 |
| 8 | `EMOTION_HINT_MISSING` | RETRY | docs03 |
| 9 | `PERSPECTIVE_OPTIONS_INVALID` | RETRY | docs04:5 |
| 10 | `PERSPECTIVE_ANSWER_INVALID` | RETRY | docs04:5 |
| 11 | `PROBLEM_SOLVING_ROLES_INVALID` | RETRY | docs04:6 |
| 12 | `PROBLEM_SOLVING_FIELD_MISSING` | RETRY | docs04:6 |
| 13 | `REFLECTION_SHAPE_INVALID` | RETRY | docs03 |
| 14 | `UNKNOWN_CHARACTER_TOKEN` | RETRY | docs04:7 |
| 15 | `BLOCKED_KEYWORD_BLOCK` | RETRY | docs04:9 |
| 16 | `BLOCKED_KEYWORD_WARN` | WARN | docs04:10 |
| 17 | `PAGE_LENGTH_OUT_OF_RANGE` | DOWNGRADE | docs04:11+12 |
| 18 | `CHECKPOINT_TEXT_TOO_LONG` | RETRY | docs04:13 |
| 19 | `EMOTION_SPOILED_BY_PAGE` | WARN | docs04:14 |
| 20 | `PREACHY_PHRASE` | WARN | docs07 (mục 3.4) |
| 21 | `PAGE_SENTENCE_TOO_LONG` | DOWNGRADE | docs03 (mục 3.4) |
| 22 | `OUTPUT_TRUNCATED` | RETRY | docs04:1 (mục 3.11.4) |

Ghi chú:

- **#1 và #22 đăng ký để test phủ bảng đếm được, không tự kiểm** (mục 3.11.8). `check` của chúng trả
  rỗng; issue được orchestrator dựng ở bước parse (mục 8 bước 5), với `code` / `severity` tra từ
  registry. `docs04:1` ("JSON đúng schema") có hai nguyên nhân tách biệt: model trả JSON sai
  (`OUTPUT_SCHEMA_INVALID`) và model bị cắt ở trần token (`OUTPUT_TRUNCATED`). Tách riêng vì cách
  chữa khác nhau: cắt cụt phải nâng trần ở lần thử lại, JSON sai thì không.

- **`docs04:8` (không chứa `forbidden_terms` trong output) cố ý không có rule** — mục 3.1. Test
  phủ bảng `docs/04` liệt kê nó trong `DOCS04_ROWS_INTENTIONALLY_SKIPPED` kèm lý do, chứ không lờ đi.
  `docs04:1` **được** phủ — bởi #1 và #22 (xem trên); không được đưa vào danh sách bỏ qua dù hai
  rule này không tự sinh issue.
- **#2 / #3 chạy trên list, không trên dict** — lý do thứ tự parse → validate → map ở mục 3.2. Một
  luật bắt cả ba: thiếu id, id lạ, **id trùng**.
- **#8 và #13 suy ra từ `docs/03`**, không phải quyết định mới: bảng "Các kiểu điểm dừng" ghi
  `emotion_*` phải có `question` + `answer` + `hint`, còn `reflection` chỉ có `question` và không
  chấm. #13 bắt LLM tự ý thêm `answer` / `options` vào `reflection`.
- **#18** so từng ô với giới hạn tương ứng: `question` ↔ `question_max_words`,
  `options[].text` ↔ `option_max_words`, `hint` ↔ `hint_max_words`,
  `options[].feedback` ↔ `feedback_max_words`.
- **#19** kiểm **trang mà `checkpoint.after` trỏ tới**: nếu trang đó chứa một từ trong
  `emotion_lexicon[answer]` thì câu hỏi cảm xúc thành vô nghĩa (`docs/03`). Mức `WARN`, không retry.
- **#17 biên số** — `docs/04`: ngắn hơn tối thiểu **hoặc** vượt tối đa quá 10%.
  `words < page_min_words` → issue; `words > page_max_words * 1.10` → issue.
  Với `max = 70`: 76 tiếng qua, 78 tiếng trượt — khớp gợi ý "9% / 11%" trong `docs/08`.
- **#19 và #20 đọc `app/content_rules.yaml`:**

```yaml
emotion_lexicon:
  happy:   [vui, thích, sung sướng, ...]
  sad:     [buồn, tủi, ...]
  angry:   [giận, tức, bực, cáu, nổi giận]
  scared:  [sợ, hoảng, ...]
  neutral: [bình thường, ...]
preachy_phrases: [bài học, con phải nhớ, phải biết, ngoan hơn, ...]
```

YAML chứ không phải env: danh sách dài và sẽ sửa thường xuyên khi nhóm đọc truyện thật.

### 7.4 Cách chạy

```python
def validate(ctx: ValidationContext) -> list[Issue]:
    return [issue for rule in RULES for issue in rule.check(ctx)]
```

Không dừng sớm: orchestrator cần **toàn bộ** lỗi để nhét vào prompt lần 2.

## 8. Orchestrator

```python
async def generate_story(req: StoryGenerateRequest, llm: LLMProvider) -> StoryGenerateResponse
```

Tám bước, đúng `docs/04`:

1. `assert_no_forbidden_terms(req)` — trên `situation`, `characters[].description` (mục 3.1).
   Dính → `FORBIDDEN_TERM_DETECTED`, **không gọi AI**.
2. Dựng prompt từ `prompts/story.v1.md`.
3. `max_output_tokens = estimate(frame, limits)` — mục 8.1.
4. Gọi LLM lần 1, yêu cầu JSON theo `response_schema` của `LlmStoryOutput`.
5. Parse (mục 3.11.8):
   - `finish_reason = MAX_TOKENS` → `Issue(OUTPUT_TRUNCATED, RETRY)`, **không parse** (JSON cụt,
     có parse lọt cũng là truyện thiếu);
   - parse hỏng → `Issue(OUTPUT_SCHEMA_INVALID, RETRY)`.

   Cả hai **không ném exception** — đi chung một đường với mọi lỗi khác, bỏ qua bước 6.
6. `issues = validate(ctx)`.
7. Quyết định:
   - lần 1, có `RETRY` hoặc `DOWNGRADE` → gọi lại lần 2 kèm danh sách lỗi; có `OUTPUT_TRUNCATED` thì
     trần token lần 2 = trần lần 1 × `LLM_TRUNCATION_RETRY_FACTOR`, làm tròn lên (mục 3.11.4)
   - lần 2, còn `DOWNGRADE` mà không còn `RETRY` → **nhận** output lần 2, hạ `DOWNGRADE` thành
     `warnings`
   - lần 2 hỏng — còn `RETRY` (kể cả `OUTPUT_TRUNCATED` / `OUTPUT_SCHEMA_INVALID`) **hoặc**
     provider ném `PROVIDER_ERROR` / `TIMEOUT` / `SAFETY_BLOCKED` — **và lần 1 chỉ có `DOWNGRADE` /
     `WARN`** → **nhận output lần 1**, hạ `DOWNGRADE` của lần 1 thành `warnings` (mục 3.11.1).
     Issue / lỗi của lần 2 bị bỏ, chỉ ghi log; `usage` cộng cả hai lần
   - lần 2, còn `RETRY`, lần 1 có `RETRY` → `OUTPUT_INVALID` (502), kèm `usage` (mục 8.3); lần 1 có
     `RETRY` mà provider ném lỗi ở lần 2 → lỗi đó, kèm `usage`
   - `WARN` → `warnings`, **chỉ của lần có output được nhận** (không trộn warning của output bị bỏ)
8. `map_to_response()` → dict theo id + `warnings` + `prompt_version` + `usage`.

Tối đa **1 lần thử lại nội bộ**, đúng `docs/04`. Bước 7 của `docs/04`
(`assert_no_forbidden_terms(output)`) **cố ý bỏ** — mục 3.1.

### 8.1 Trần token đầu ra

`docs/04`: `max_output_tokens = tổng_số_tiếng_tối_đa × TOKENS_PER_WORD × 1.3`.

| Thành phần | Cộng vào |
|---|---|
| mỗi trang | `page_max_words` |
| `emotion_self` / `emotion_other` | `question_max + hint_max + 1` |
| `perspective` | `question_max + hint_max + 3 × option_max` |
| `problem_solving` | `question_max + 3 × (option_max + feedback_max)` |
| `reflection` | `question_max` |
| mỗi cảnh | `scene_description_max_words` (mục 3.3) |

`TOKENS_PER_WORD` từ env, mặc định 2.8 (đo được 2.557 trên một sample; xem `docs/01-decisions.md`). `scripts/try_story.py` in hệ số đo được để chốt một trong
bốn câu hỏi đang mở của `docs/01-decisions.md`.

Công thức trên là trần cho **chữ trả về**. Nếu spike chốt bật thinking, `LLM_THINKING_BUDGET` được
**cộng thêm** vào giá trị gửi SDK — token thinking không được ăn vào phần của truyện (mục 3.11.4).
Lần thử lại sau `OUTPUT_TRUNCATED` nhân phần chữ với `LLM_TRUNCATION_RETRY_FACTOR` (budget thinking
giữ nguyên).

### 8.2 Lần thử lại

Hội thoại nhiều lượt, không dựng lại prompt phẳng:

```
[user]   <prompt gốc>
[model]  <JSON lần 1, nguyên văn>
[user]   Bản trên có các lỗi sau, hãy sửa và trả lại TOÀN BỘ JSON:
         - k1 (emotion_self): thiếu 'answer'; phải là 1 trong happy|sad|angry|scared|neutral
         - p3: 84 tiếng, vượt tối đa 70 quá 10%
         Giữ nguyên mọi page_id, checkpoint_id và kiểu điểm dừng.
```

Danh sách là `[i.detail for i in issues if i.severity is not WARN]`, sẵn có từ registry. Lượt
`[model]` là chữ thô của lần 1 kể cả khi nó hỏng hoặc bị cắt cụt — detail của `OUTPUT_TRUNCATED`
nói rõ "JSON bị cắt giữa chừng vì quá dài; viết gọn hơn, trả lại TOÀN BỘ JSON". Nếu chữ lần 1
**rỗng** (vd. `MAX_TOKENS` trước khi có chữ) thì **không** gửi lượt `[model]` rỗng: gửi một lượt
`[user]` duy nhất = prompt gốc + danh sách lỗi. Câu cuối
nhắc lại `CLAUDE.md` (*"page_id, checkpoint_id vào thế nào ra thế ấy"*) vì lần sửa là lúc model dễ
tự ý cấu trúc lại nhất.

Chọn multi-turn vì model sửa bài của chính nó tốt hơn khi thấy đúng lượt trước. Lần 2 dùng
`LLM_RETRY_TEMPERATURE`, **mặc định trống = không gửi** (nhiệt độ mặc định của model). Bản đầu
của spec đặt 0.4 để model bám danh sách lỗi; đã đổi (2026-10-04, `docs/01-decisions.md`) vì tài
liệu Gemini 3 khuyến nghị mạnh giữ mặc định 1.0 — thấp hơn có thể gây lặp / giảm chất lượng. Lần
thử lại bám lỗi nhờ chính lượt hội thoại kèm danh sách lỗi; biến vẫn giữ để đặt giá trị cho model
khác nếu đo thấy có lợi.

### 8.3 Usage

Cộng dồn qua các lần gọi:

```python
Usage(
    provider, model,
    input_tokens  = sum(mọi attempt),
    output_tokens = sum(mọi attempt),
    units = 0,
    estimated_cost_micros = in*PRICE_TEXT_INPUT_PER_MTOK_MICROS//1_000_000
                          + out*PRICE_TEXT_OUTPUT_PER_MTOK_MICROS//1_000_000,
    latency_ms = tổng thời gian tường,
    attempts = số lời gọi LLM,
)
```

Cộng dồn chứ không lấy lần cuối: lần thử lại tốn tiền thật, backend phải thấy để trừ credit đúng.
`attempts` cho phép Admin đếm tỉ lệ phải retry và đối chiếu với `ai_requests.input_tokens`.

`usage` luôn trả kể cả khi thành công sau retry, và kể cả khi trả output lần 1 theo fallback
`DOWNGRADE` (vẫn cộng cả hai lần gọi).

**Khi ném lỗi** (mục 3.11.3): nếu đã có ít nhất một lời gọi LLM trả response, `AiError` mang `usage`
cộng dồn tới thời điểm lỗi và thân lỗi có khoá `usage`. Cụ thể:

| Lỗi | Có `usage`? |
|---|---|
| `INVALID_INPUT`, `FORBIDDEN_TERM_DETECTED` | không — chưa gọi |
| `SAFETY_BLOCKED` ở lần 1 hoặc 2 | có — response bị chặn vẫn mang `usage_metadata` |
| `PROVIDER_ERROR` / `TIMEOUT` ở lần 1 | không — chưa có response nào |
| `PROVIDER_ERROR` / `TIMEOUT` ở lần 2 | có — số liệu của lần 1 |
| `SAFETY_BLOCKED` / `PROVIDER_ERROR` / `TIMEOUT` ở lần 2 khi lần 1 chỉ có `DOWNGRADE` / `WARN` | không ném lỗi — trả output lần 1 (fallback 3.11.1); `usage` của response cộng cả hai lần (token lời gọi bị chặn nếu có) |
| `OUTPUT_INVALID` | có — cả hai lần |

`attempts` trong `usage` của lỗi đếm mọi lời gọi đã **bắt đầu** (kể cả lời gọi hỏng mạng); token chỉ
cộng từ lời gọi có response. Credit của phụ huynh vẫn hoàn như `docs/05` nói; số liệu này để Admin
đối soát chi phí thật với nhà cung cấp.

### 8.4 Ánh xạ lỗi provider

| Nguồn | Mã |
|---|---|
| tên thật trong request | `FORBIDDEN_TERM_DETECTED` 422 |
| Gemini chặn an toàn (`finish_reason` = safety / prompt blocked) | `SAFETY_BLOCKED` 422 |
| `finish_reason = MAX_TOKENS` | không phải lỗi provider — issue `OUTPUT_TRUNCATED`, thử lại với trần cao hơn |
| hết giờ | `TIMEOUT` 504 |
| 429, 5xx, lỗi mạng, response rỗng | `PROVIDER_ERROR` 502 |
| còn lỗi `RETRY` sau lần 2 | `OUTPUT_INVALID` 502 |

`retryable` và hành vi BullMQ: bảng ở mục 3.9.

### 8.5 Log

INFO ghi: `request_id`, số trang, số checkpoint, `attempts`, danh sách `code` của issues, token,
latency. **Không log nội dung truyện ở INFO** — đã tokenized nhưng vẫn là nội dung của trẻ; để
DEBUG. Không log API key, không log chữ gửi vào TTS, không log dữ liệu ảnh.

## 9. Provider và Storage

### 9.1 Port LLM — cố ý story-specific

```python
@dataclass(frozen=True)
class StoryLLMCall:
    frame: StoryGenerateRequest      # mock dùng; gemini bỏ qua
    contents: list[Turn]             # multi-turn, gồm lượt sửa lỗi nếu là lần 2
    response_schema: type[BaseModel]
    max_output_tokens: int
    temperature: float | None

@dataclass(frozen=True)
class LLMResult:
    text: str
    input_tokens: int
    output_tokens: int             # gồm cả token thinking — đều tính tiền như output
    finish_reason: str             # đã chuẩn hoá: "STOP" | "MAX_TOKENS" | ...

class LLMProvider(Protocol):
    name: str
    model: str | None
    async def generate_story(self, call: StoryLLMCall) -> LLMResult: ...
```

`frame` nằm trong port dù Gemini không dùng — đó là cái giá để `MockLLMProvider` sinh được output
hợp lệ theo khung mà không phải bóc ngược prompt. Comment rõ tại chỗ thay vì giấu bằng một lớp trừu
tượng nữa.

Orchestrator giữ toàn bộ prompt / retry / validate. Provider làm đúng một việc: gửi các lượt, trả
JSON thô + số token.

Provider ném `AiError` cho lỗi của chính nó. `SAFETY_BLOCKED` ném kèm token của response bị chặn
(đọc từ `usage_metadata`) để orchestrator cộng vào `usage` của lỗi (mục 8.3); `PROVIDER_ERROR` /
`TIMEOUT` không có token.

### 9.2 `MockLLMProvider` — khung-aware

Đọc `pages[]` / `checkpoints[]` rồi sinh output **hợp lệ theo đúng khung đó**: đủ id, `scene` gom
trang không vượt `max_scenes`, `emotion_*` có `answer` trong bộ 5, `perspective` đúng 3 phương án với
`answer` trỏ hợp lệ, `problem_solving` đủ 3 vai có `text` + `feedback`, mọi ô trong `limits`, chỉ
dùng token đã khai.

Happy path của mock **đi qua validator thật**, không bypass. Node tích hợp được với khung bất kỳ, kể
cả truyện `custom` 20 trang.

`__force` (mục 4.3) mock đọc từ `call.frame` — vì thế không phải thêm field vào port.
`INVALID_OUTPUT_ONCE` sinh output sai lần đầu, đúng lần hai — đúng kịch bản `docs/08` mà không cần
Gemini; `OUTPUT_INVALID` sai cả hai lần.

### 9.3 `GeminiLLMProvider`

Theo `CLAUDE.md`: **đọc tài liệu `google-genai` hiện hành trước khi viết**, không dựa vào trí nhớ tên
hàm. Tên API cụ thể (client async, cấu hình generate, chỗ đọc `usage_metadata`) xác minh lúc cài;
khác biệt so với docs thì ghi vào README.

`response_schema = LlmStoryOutput`, `response_mime_type = "application/json"`.

Hai điểm cần xác minh khi cài:

- SDK có nhận thẳng model Pydantic làm `response_schema` không, hay phải quy sang dict JSON Schema.
- Field `str | None` (như `answer`, `feedback`) có ra `nullable: true` đúng không. Nếu SDK bắt mọi
  field phải required thì đổi sang `str = ""`; registry vẫn bắt lỗi y như cũ.

**Kiểm tra model lúc khởi động** (`docs/06`): khi `LLM_PROVIDER=gemini`, liệt kê model trong
`lifespan` và báo lỗi rõ ràng nếu `GEMINI_TEXT_MODEL` không tồn tại, thay vì để request đầu tiên mới
chết. Mặc định là `mock` nên `pytest` không chạm vào.

**Safety settings:** không hạ ngưỡng. Bị chặn → `SAFETY_BLOCKED`.

**Thinking** (mục 3.11.4): đặt cấu hình thinking tường minh theo `LLM_THINKING_BUDGET`; trần gửi SDK
= trần chữ + budget. Tên field cấu hình thinking của SDK (budget hay level, tuỳ đời model) xác minh
ở tài liệu hiện hành. `output_tokens` = token chữ + token thinking.

**Retry của SDK:** tắt hoặc xác minh không có — bảng 3.9 giả định mỗi lời gọi của provider là đúng
một request ra Gemini.

**`finish_reason`:** chuẩn hoá về chuỗi tên enum (`STOP`, `MAX_TOKENS`, `SAFETY`…). `MAX_TOKENS`
**không** ném lỗi — trả `LLMResult` bình thường để orchestrator dựng `OUTPUT_TRUNCATED`.

Rủi ro đã biết: truyện EQ cho trẻ có xung đột (giật đồ chơi, ngã, khóc, hét — xem
`docs/samples/story_response.json`), có khả năng chạm bộ lọc của Gemini. Chưa biết mức độ cho tới khi
chạy thật. `try_story.py` in `finish_reason` và safety ratings. Nếu chạm thường xuyên, đó là **quyết
định mới** — dừng hỏi, không tự nới ngưỡng.

### 9.4 `prompts/story.v1.md`

Bố cục: vai trò → 7 nguyên tắc nội dung (`docs/07`) → quy tắc cấu trúc (giữ nguyên `page_id` /
`checkpoint_id` / kiểu; trang ngay trước mỗi kiểu checkpoint phải phục vụ nó theo `docs/03`) → ràng
buộc độ dài (chèn từ `limits`) → token nhân vật → cảnh → định dạng JSON.

**Chi tiết dễ vỡ: prompt chứa `{NV1}` nguyên văn.** Không dùng f-string hay `str.format()` — cả hai
nổ ở `{NV1}`. Dùng `string.Template` với cú pháp `$page_count`, `$page_max_words`… Có test render
prompt với sample request để chặn.

`prompt_version` đọc từ front matter của chính file (`version: story.v1`), không viết cứng trong code.

### 9.5 Storage

Giữ thiết kế của code cũ: chọn backend theo credential có sẵn (`SupabaseStorage` nếu có
`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, không thì `LocalStorage` + log cảnh báo). `httpx` gọi REST
API của Supabase Storage, không kéo SDK `supabase-py`.

**Mở rộng protocol:** code cũ chỉ có `upload()` vì luồng cũ chỉ ghi. Luồng mới **đọc lại** —
`/v1/images/scene` nhận `portrait_key` và cần bytes của chân dung làm ảnh tham chiếu (mục 5.6). Nên:

```python
class Storage(Protocol):
    @property
    def backend(self) -> str: ...
    async def upload(self, key: str, data: bytes, content_type: str) -> str: ...
    async def download(self, key: str) -> bytes: ...      # MỚI
```

`download` của key không tồn tại → `INVALID_INPUT` (backend gửi sai key, không phải lỗi nhất thời,
không nên để BullMQ retry 3 lần).

`LocalStorage.download` đọc từ thư mục tạm; `SupabaseStorage.download` gọi REST API. Cả hai có test
với `respx` (Supabase) và filesystem thật trong `tmp_path` (Local).

`/health` báo `storage_backend` để nhìn là biết đang chạy backend nào.

### 9.6 Mock ảnh và TTS

`MockImageProvider` sinh PNG đơn sắc đúng kích thước (không cần Pillow ở mốc này).
`MockTTSProvider` sinh WAV rỗng 44 byte + `duration_seconds` ước theo độ dài chữ. Cả hai **đi qua
đường upload Storage thật** rồi trả key — nhờ vậy luồng end-to-end (queue → worker → HTTP → có file
trên Storage) chạy được đầy đủ trước khi có model thật. Đây là giá trị chính của mock trong kiến trúc
có BullMQ.

**Sai lệch có chủ ý, phải ghi README:** `docs/05` nói TTS là **AAC** và ảnh là **WebP**; mock trả
**WAV** và **PNG** (AAC cần ffmpeg ở M5, WebP cần Pillow ở M4a). Backend nên đọc định dạng từ đuôi
key chứ không giả định. Test contract khẳng định đúng sai lệch này để nó không trôi đi im lặng.

## 10. Test (`BE/ai`)

### 10.1 Bố cục

```
tests/
  conftest.py                  # client, token header, chặn mạng
  fixtures/
    frames.py                  # make_frame(length=...), make_limits()
    llm_outputs.py             # valid_output(frame) + hàm làm hỏng có chủ đích
  unit/    test_text_utils · test_guards · test_validator_registry
           test_validator_rules · test_mapping · test_usage
           test_max_output_tokens · test_prompt_render
  api/     test_health · test_auth · test_story_generate
           test_images_mock · test_tts_mock · test_errors · test_storage_flow
  providers/ test_gemini_provider
```

`fixtures/llm_outputs.py` là then chốt: `valid_output(frame)` sinh output hợp lệ cho khung bất kỳ,
mỗi test rule chỉ làm hỏng **đúng một thứ**. Test rule nào trượt thì chắc chắn do rule đó, không phải
do fixture viết tay thiếu field.

### 10.2 Chặn mạng bằng code

Fixture `autouse` trong `conftest.py` vá `socket.socket.connect` và `socket.getaddrinfo` để ném ngay
khi có ai kết nối tới địa chỉ **ngoài loopback**. Quy tắc *"test không bao giờ gọi mạng"* rất dễ vỡ
âm thầm — một `import` lỡ tay hay một provider quên mock là `pytest` bắt đầu tiêu quota Gemini mà
không ai biết.

Cho qua `127.0.0.1`, `::1`, `localhost` và socket AF_UNIX (mục 3.11.6): trên Windows, event loop của
asyncio dựng self-pipe bằng `socket.socketpair()`, CPython giả lập bằng kết nối TCP tới `127.0.0.1`.
Vá cả lớp `socket.socket` hoặc chặn cả loopback thì chính test async vỡ trước khi chạy tới provider.
Có test cho chính fixture: kết nối tới một IP công khai ném lỗi, tạo event loop mới vẫn chạy.

`LocalStorage` dùng trong test nên đường Storage vẫn chạy được sau khi chặn mạng.

### 10.3 Test `GeminiLLMProvider`

`docs/08` và `CLAUDE.md` nêu `respx`. Vấn đề: `respx` chỉ hoạt động nếu `google-genai` thật sự đi qua
`httpx` — chưa xác minh được, không thiết kế dựa vào giả định đó.

Cài: `GeminiLLMProvider(client=None)` — `None` thì tự dựng client thật, test tiêm client giả. Test
phủ đúng phần thuộc về mình: dựng config gọi, đọc `usage_metadata`, map `finish_reason` →
`SAFETY_BLOCKED`, map 429/5xx → `PROVIDER_ERROR`, timeout → `TIMEOUT`.

Giữ `respx` trong dev-dependencies vì `SupabaseStorage` gọi HTTP thô thật (và M4b sẽ thêm ComfyUI,
HF Inference) — ở đó nó đúng công cụ. Ghi khác biệt vào README.

### 10.4 Phủ theo `docs/08`

- `text_utils`: `{NV1}` = 1 tiếng; `"—"` = 0;
  `split_sentences` không cắt ở dấu hai chấm.
- `guards`: `"An"` khớp `"An"`; không khớp `"an toàn"`, `"Ân"`, `"Anh"`; `"Anh"` không khớp
  `"anh"`; đúng ranh giới từ (`"An,"` khớp); `"Đức"` dạng NFD khớp `"Đức"` dạng NFC. `topic.guidance` chứa tên → **không** chặn (không quét).
  Test orchestrator: output chứa chữ trùng `forbidden_terms` vẫn thành công, không có warning.
- `validator`: mỗi rule một case đạt + một case trượt; biên độ dài **76 tiếng qua / 78 tiếng trượt**
  (max 70).
- Ba test kết cấu:
  1. `test_all_docs04_rows_covered` — hằng số `DOCS04_ROWS`; mọi dòng phải có ≥1 rule mang `doc_row`
     đó, trừ các dòng trong `DOCS04_ROWS_INTENTIONALLY_SKIPPED` (hiện chỉ `docs04:8`). `docs04:1`
     được phủ bởi #1 và #22 dù `check` của chúng trả rỗng (mục 3.11.8).
  2. `test_all_checkpoint_types_covered` — mọi giá trị enum `CheckpointType` phải xuất hiện trong ít
     nhất một rule.
  3. `test_rule_codes_unique`.
- Vòng thử lại: `ScriptedLLMProvider([bad, good])` → thành công, `attempts == 2`, lỗi `DOWNGRADE`
  thành `warnings`. `ScriptedLLMProvider([bad, bad])` → `OUTPUT_INVALID` 502, thân lỗi có `usage`
  cộng hai lần.
- Fallback `DOWNGRADE` (mục 3.11.1): lần 1 chỉ có trang dài quá 10% (+ một `WARN`), lần 2 thiếu một
  `page_id` → thành công với **output lần 1**, `warnings` gồm `PAGE_LENGTH_OUT_OF_RANGE` và `WARN` của
  lần 1, không có issue nào của lần 2, `usage.attempts == 2`, token cộng cả hai. Đối chứng: lần 1 có
  `RETRY` + lần 2 có `RETRY` → `OUTPUT_INVALID`.
- Cắt cụt (mục 3.11.4): lần 1 `finish_reason = MAX_TOKENS` → issue `OUTPUT_TRUNCATED` (không phải
  `OUTPUT_SCHEMA_INVALID`), lần 2 được gọi với `max_output_tokens` = lần 1 × 1.5 (làm tròn lên); lần
  1 JSON hỏng mà `STOP` → lần 2 giữ nguyên trần.
- `usage` trong lỗi: `SAFETY_BLOCKED` ở lần 1 có `usage` (`attempts = 1`); `PROVIDER_ERROR` ở lần 1
  không có; `TIMEOUT` ở lần 2 có `usage` với token của lần 1, `attempts = 2`.
- Từng kiểu checkpoint: thiếu vai, thừa phương án, `answer` ngoài bộ 5, `answer` trỏ vào phương án
  không tồn tại.
- API: bốn endpoint chạy mock; `X-Internal-Token` sai → `INVALID_INPUT`; `/health` không cần token;
  field lạ → `INVALID_INPUT`; `__force` từng nhánh, gửi ở **cấp cao nhất** của body; `__force` giá
  trị lạ → `INVALID_INPUT`; `__force` khi `LLM_PROVIDER=gemini` → `INVALID_INPUT` và provider không
  được gọi; `INVALID_OUTPUT_ONCE` cho ảnh / TTS → `INVALID_INPUT`.
- Storage: `storage_prefix` được nối tên file chứ không bị parse; `LocalStorage` fallback khi thiếu
  credential; key trả về khớp prefix; key tất định theo `request_id` — gọi hai lần cùng request thì
  cùng key và file bị ghi đè, không sinh file thứ hai; `storage_prefix` sai luật (`../x`, `/abs`,
  `a\b`, ký tự ngoài bộ, dài 201) → `INVALID_INPUT` và không có file nào được ghi.
- **Bất biến kiến trúc:** test khẳng định `Settings` không có field `database_url` / `redis_url` —
  cưỡng chế bằng code cái mà `BE/docs/contracts/ai-service.md` §1 nói là bất biến.

## 11. Thay đổi phía `BE/api` và hợp đồng

> **Tình trạng 2026-09-30:** các dòng Node dưới đây đã làm xong trong plan Node
> (`BE/api/docs/superpowers/plans/2026-09-30-story-generation-node.md`) — kể cả `__force` cấp cao
> nhất. `AI_TIMEOUT_MS` chung đã bỏ hẳn, thay bằng `AI_TIMEOUT_MS_<JOB>` (điều chỉnh 3 của plan đó).
> Phần còn lại cho phía `ai`: kiểm tương thích hợp đồng, viết nốt §2/§4/§5 của
> `BE/docs/contracts/ai-service.md`, sửa khối `ai` trong `docker-compose.yml` + `.env.example` gốc
> (`AI_PROVIDER` → `LLM_PROVIDER` …), và `BE/README.md`. Node bỏ qua khoá `usage` trong thân lỗi
> (mục 3.11.3) — thêm vào không phá gì; đọc nó để ghi chi phí là việc của Node sau này.

| File | Sửa |
|---|---|
| `src/queues/ai.jobs.js` | `AI_JOB` → `story_text`, `character_portrait`, `scene_image`, `narration` (khớp `ai_request_type` trong `schema_rev8.dbml`) |
| `src/clients/aiClient.js` | `JOB_CONFIG` (endpoint + `timeoutMs` theo job) thay `ENDPOINT_BY_JOB`; đọc `body.error.code` + `body.error.retryable` thay `body.errorKind`; `NON_RETRYABLE_ERROR_CODES` = 4 mã ở mục 3.9 |
| `src/config/env.js` | `AI_TIMEOUT_MS` thành **mặc định** cho job không khai; thêm override theo job |
| `src/workers/ai.processor.js` | bỏ phong bì `{jobId, idempotencyKey, storagePrefix, input}`. Phần còn lại **thuộc spec Node** `BE/api/docs/superpowers/specs/2026-09-30-story-generation-node-design.md` §8: job chỉ mang `ai_request_id`, processor dựng payload từ DB, `persistAiResult` cài đầy đủ |
| `tests/aiClient.test.js` | theo mã lỗi mới và `JOB_CONFIG` |
| `scripts/enqueue-ai-job.js` | theo tên job mới |
| `BE/docs/contracts/ai-service.md` | viết lại §2 endpoint, §3 request, §4 response, §5 bảng lỗi, §6 ngân sách thời gian |
| `BE/README.md` | cập nhật sơ đồ luồng và mục NFR theo mục 3.10 |

`JOB_CONFIG` đề xuất:

```js
const JOB_CONFIG = {
  [AI_JOB.STORY_TEXT]:         { endpoint: '/v1/story/generate',  timeoutMs: 120_000 },
  [AI_JOB.CHARACTER_PORTRAIT]: { endpoint: '/v1/images/portrait', timeoutMs:  90_000 },
  [AI_JOB.SCENE_IMAGE]:        { endpoint: '/v1/images/scene',    timeoutMs:  90_000 },
  [AI_JOB.NARRATION]:          { endpoint: '/v1/tts/synthesize',  timeoutMs:  30_000 },
};

const NON_RETRYABLE_ERROR_CODES = new Set([
  'INVALID_INPUT', 'FORBIDDEN_TERM_DETECTED', 'SAFETY_BLOCKED', 'OUTPUT_INVALID',
]);
```

Giữ nguyên: BullMQ `attempts: 3` + backoff exponential 2s; `UnrecoverableError` khi
`retryable === false`; `api` không được cấp `AI_SERVICE_URL`; service `ai` không có `DATABASE_URL`.

## 12. Tài liệu cập nhật trong cùng lần sửa

`CLAUDE.md` bắt buộc: đổi hợp đồng thì sửa `docs/05` + `docs/samples/` cùng lúc.

| File | Sửa gì |
|---|---|
| `BE/ai/docs/01-decisions.md` | **Chuyển "BullMQ / Redis" từ "Đã bỏ" sang "Đã chốt"** kèm phân vai với `ai_requests` (mục 3.6). Thêm mục 3.1–3.5, 3.7–3.10 vào "Đã chốt". Thêm mục 3.11. Sau spike (§2.1): chuyển `TOKENS_PER_WORD` từ "Đang mở" sang "Đã chốt", ghi cấu hình thinking (`LLM_THINKING_BUDGET`), SDK có tự retry không, và mức độ bị bộ lọc an toàn chặn. |
| `BE/ai/docs/04-ai-pipeline.md` | Viết lại mục "Chốt chặn tên thật" theo mục 3.1 (một tầng, chỉ request, chỉ trường phụ huynh nhập), kèm bảng ví dụ tên Việt trùng từ thông dụng. Bỏ bước 7 khỏi luồng và dòng "Không chứa `forbidden_terms`" khỏi bảng validator. Thêm bốn dòng (#8, #13, #20, #21). Chính sách thử lại: cắt cụt (`OUTPUT_TRUNCATED`) nâng trần ×1.5; fallback `DOWNGRADE` (3.11.1). |
| `BE/ai/docs/05-api-contract.md` | `snake_case`; `extra="forbid"`; `usage` cộng dồn qua retry; **ảnh/TTS nhận `storage_prefix` và trả key, không trả base64** (mục 3.7), luật kiểm `storage_prefix` + tên file tất định (5.6); bảng lỗi thêm cột `retryable`; thân lỗi có `usage` optional (3.11.3); `__force` cấp cao nhất (4.3). |
| `BE/ai/docs/06-image-adapters.md` | Bỏ Gemini khỏi bảng "Model" (chân dung / cảnh / dev) và khỏi ví dụ `IMAGE_PROFILE_*`; ghi rõ hướng là model mã nguồn mở, miễn phí. Model cụ thể để ngỏ tới spec M4 (mục 15). |
| `BE/ai/docs/09-roadmap.md` | Thêm `SCENE_DESCRIPTION_MAX_WORDS`, `LLM_TEMPERATURE`, `LLM_RETRY_TEMPERATURE`, `LLM_THINKING_BUDGET`, `LLM_TRUNCATION_RETRY_FACTOR`, `SUPABASE_*`; `LLM_TIMEOUT_SECONDS` 60 → 45. |
| `BE/ai/docs/samples/` | Thêm `story_llm_output.json` (shape list mà LLM trả). Cập nhật sample ảnh/TTS nếu có. |
| `BE/ai/README.md` | Viết lại toàn bộ; hiện mô tả contract cũ. Thêm mục "bất biến ngân sách thời gian" (3.8) và "sai lệch mock" (9.6). |
| `BE/ai/.env.example` | Theo mục 4.4. |
| `BE/docs/contracts/ai-service.md` | Mục 11. |
| `BE/README.md` | Mục 11. |
| `BE/docker-compose.yml` (khối `ai`), `BE/.env.example` | `AI_PROVIDER` → `LLM_PROVIDER` + `TTS_PROVIDER`; thêm `GEMINI_TEXT_MODEL`; bỏ biến đã xoá ở mục 4.4. Không thêm `DATABASE_URL` / `REDIS_URL`. |

## 13. Định nghĩa "xong"

- `pytest` (BE/ai) xanh, không có test nào chạm mạng.
- `npm test` (BE/api) xanh với `aiClient.test.js` đã cập nhật.
- Bốn endpoint chạy được với mock; `/v1/story/generate` đi qua validator thật với khung bất kỳ kể cả
  `custom`; ảnh/TTS mock ghi được file lên `LocalStorage`.
- `docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId>` (script nhận id truyện và đi qua `startGeneration`) chạy hết vòng
  queue → worker → HTTP → response, và nhánh `SAFETY_BLOCKED` dừng ở **attempt 1/3** (không có
  attempt 2, 3).
- Spike (§2.1) đã chạy, kết quả đã ghi vào `docs/01-decisions.md` trước khi làm M2.
- `python scripts/try_story.py --confirm` gọi Gemini thật **qua toàn bộ pipeline** (validator +
  thử lại), ra truyện hợp lệ, in `TOKENS_PER_WORD` đo được.
- Tài liệu ở mục 12 đã cập nhật.

## 14. Rủi ro đã biết

| Rủi ro | Xử lý |
|---|---|
| `google-genai` không nhận Pydantic làm `response_schema`, hoặc không hỗ trợ nullable | Quy sang dict JSON Schema, hoặc đổi field sang `str = ""`. Registry không đổi. |
| Bộ lọc an toàn của Gemini chặn nội dung xung đột trong truyện trẻ em | Phát hiện sớm ở spike (§2.1), trước khi viết validator. `try_story.py` in `finish_reason` + safety ratings. Nếu chạm thường xuyên → dừng hỏi, không tự nới ngưỡng. |
| `respx` không chặn được `google-genai` | Đã tránh: test bằng client tiêm vào (10.3). |
| Backend leak tên thật kèm sai dấu/sai hoa thường | Lọt. Hai lỗi phải xảy ra đồng thời; chấp nhận (3.1). |
| Tên trẻ trùng chữ hoa đầu câu trong `situation` ("An toàn…") | Chặn nhầm `FORBIDDEN_TERM_DETECTED`; không tốn credit, phụ huynh sửa câu. Chấp nhận (3.1). |
| Hai tầng retry nhân nhau, đốt quota Gemini | Bảng phân loại 3.9 (tệ nhất 6 lời gọi cho lỗi retryable), cưỡng chế ở cả hai bên bằng code. `usage` trong thân lỗi cho Admin thấy tiền đã đốt (3.11.3). Test `enqueue-ai-job.js` khẳng định dừng ở attempt 1/3. |
| Node timeout ngắn hơn thời gian sinh truyện → vứt bỏ công việc đã trả tiền | Bất biến 3.8, timeout theo loại job. **Không cưỡng chế được bằng code** (hai process) — chỉ có tài liệu + review. |
| Base64 ảnh phình Redis qua job result | Đã tránh: service upload Storage, job result chỉ mang key (3.7). |
| `TOKENS_PER_WORD = 2.0` chưa đo, trần token có thể cắt cụt output dài | Spike (§2.1) đo và chốt trước M2, kèm cấu hình thinking. Cắt cụt biểu hiện thành issue riêng `OUTPUT_TRUNCATED` → thử lại với trần ×1.5, nhìn thấy được trong log (3.11.4). |
| Token thinking ăn vào `max_output_tokens`, truyện bị cụt dù chữ ngắn | Thinking đặt tường minh; budget cộng thêm vào trần, không chia phần với chữ (3.11.4). |
| Lần thử lại làm hỏng một output lần 1 chỉ lệch độ dài | Fallback `DOWNGRADE`: trả output lần 1 kèm warning (3.11.1). |
| SDK `google-genai` tự retry bên trong → nhân thêm tầng thứ ba lên bảng 3.9 | Tắt / xác minh ở spike, ghi `docs/01` (9.3). |
| `storage_prefix` bẩn ghi file ra ngoài thư mục (`../`) ở `LocalStorage` | Kiểm charset + đoạn `..` + `/` đầu (3.11.5). |
| BullMQ chạy lại job ảnh / TTS để lại file mồ côi | Tên file tất định theo `request_id`, upsert (3.11.5). |
| Chặn mạng trong test làm vỡ event loop trên Windows | Chỉ chặn ngoài loopback (3.11.6). |

## 15. Câu hỏi vẫn mở (không chặn M1–M3)

Từ `docs/01-decisions.md`, thuộc M4b/M5:

- Chọn bộ phân loại an toàn ảnh cụ thể cho model mã nguồn mở.
- Server ComfyUI có GPU đặt ở đâu.
- Chọn model ảnh mã nguồn mở chính cho chân dung và cho cảnh (ứng viên trong `docs/06`, ví dụ
  `flux2-klein-4b`), chạy qua ComfyUI hay HF Inference.

Phát sinh từ bản thiết kế này:

- Truyện `custom` có cho phụ huynh tự viết `topic.title` / `topic.guidance` không? Nếu có, hai
  trường đó phải thêm vào danh sách quét của mục 3.1 — quyết định "chỉ quét trường phụ huynh nhập"
  dựa trên giả định chúng do chuyên gia viết.
- ~~`ai_requests` do ai ghi và ghi lúc nào~~ — đã trả lời ở spec Node
  (`2026-09-30-story-generation-node-design.md` §8).
