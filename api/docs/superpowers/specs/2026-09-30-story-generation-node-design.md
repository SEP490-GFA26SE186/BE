# Thiết kế: Luồng tạo truyện phía Node — `stories` theo rev8 + sinh chữ qua AI

- Ngày: 2026-09-30
- Phạm vi: `BE/api/` — viết lại module `stories` theo `docs/db/schema_rev8.dbml`, nối luồng sinh chữ
  vào service `ai` qua BullMQ
- Trạng thái: đã duyệt thiết kế, chờ lập implementation plan
- Phụ thuộc: `BE/ai/docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md` (gọi tắt: **spec
  AI**) — hợp đồng HTTP, bảng mã lỗi, `aiClient.js` / `ai.jobs.js` mới ở §11 của spec đó

---

## 1. Bối cảnh

Service `ai` (spec AI) nhận một **khung truyện** đã dựng sẵn và điền nội dung. Phía Node hiện chưa có
gì nối vào:

- Module `stories` (viết 2026-09-26) theo mô hình cũ — template + stage + choice rẽ nhánh. Sau
  commit `db migration` (2026-09-28) Prisma là rev8, không còn model `template`, `templateStage`,
  `storyChoice`… nên module này **chết khi chạy**.
- Không chỗ nào gọi `enqueueAiJob`. `persistAiResult` trong `ai.processor.js` để trống có chủ đích.
- `wallet_ledger` có `credit_hold` / `credit_release` / `credit_consume` nhưng chưa ai dùng.
  `ai_requests` chưa ai ghi.
- `platform_settings` có chỗ cho `story_layout.<length>`, `limits.*`, `ai_cost.<type>` nhưng chưa
  seed.

Hành trình đích lấy từ `docs/db/schema-guide.md` §2, bước 4–7: chọn bài học → hệ thống dựng khung →
"Viết giúp tôi" → AI điền chữ → phụ huynh xem lại.

## 2. Phạm vi

**Làm:**

- Viết lại toàn bộ module `stories` theo rev8: tạo truyện + dựng khung, đọc, sửa, xoá, editor trang
  và điểm dừng, review.
- Sinh chữ bằng AI: endpoint, giữ/trừ/hoàn credit, `ai_requests`, worker, `persistAiResult`, polling.
- Seed `platform_settings` cho khung, giới hạn, giá.

**Không làm:**

- Ảnh chân dung, ảnh cảnh, giọng đọc — spec sau, khi đã có model thật (ảnh dùng model mã nguồn mở).
- Đăng bán (`publish-version`) — đi cùng spec chợ truyện. Route trả `501`.
- Các module khác đang lệch rev8 (mục 11).
- Thêm `child_id` vào `stories` hay vào request. Truyện **đã trỏ được tới bé** qua nhân vật chính:
  `story_characters (is_main)` → `characters.child_id` → `child_profiles`. Truyện đến tay con qua
  `bookshelf_items` (module `bookshelf` sẵn có) sau khi review — một truyện đưa được cho nhiều con.
- Gửi tuổi bé thành trường riêng cho AI. Tuổi đã đi vào AI qua `characters.appearance` do phụ huynh
  viết ("bé trai 6 tuổi…"); mọi chủ đề nhắm 5–8 tuổi và `limits` cố định nên tuổi ít đổi cách viết.
  Nếu sau này cần: thêm `reader_age` vào hợp đồng `/v1/story/generate`, tính từ
  `child_profiles.birth_date` của bé gắn với nhân vật chính.

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| 3.1 | **Dựng khung ngay khi tạo truyện**, kèm một **cảnh tạm** | Khớp `schema-guide`; phụ huynh tự viết được không cần AI; `custom` và truyện AI chung editor. `story_pages.scene_id` NOT NULL nên cần cảnh tạm — rẻ hơn đổi schema |
| 3.2 | **Mỗi lần AI viết tính một lần** `ai_cost.story_text`: giữ → thành công trừ / lỗi hoàn. Viết lại là lần tính mới | Khớp `ai_requests.credits_charged` theo lần gọi; giá chỉnh bằng `platform_settings` |
| 3.3 | **Polling**, `POST /generate` trả `202` | Sinh truyện ~10–30s, polling đủ; không thêm hạ tầng. WebSocket để dành cho đồng bộ cha–con |
| 3.4 | **Viết lại = ghi đè toàn bộ**, xoá `reviewed_at`; frontend hỏi xác nhận | Đơn vị sinh là cả truyện; AI viết lại từng trang đã bỏ (`BE/ai/docs/01`) |
| 3.5 | **Chỉ ghi đè khi thành công** | Lỗi thì chữ cũ còn nguyên, không mất công phụ huynh |
| 3.6 | Gửi AI **id ngắn** `p1…pN`, `k1…kM`, không gửi uuid | Model phải chép lại mọi id; chép sai 1 ký tự của uuid 36 ký tự là `PAGE_IDS_MISMATCH` → retry → tốn tiền |
| 3.7 | **Dựng request AI trong worker**, lúc chạy job; job chỉ mang `ai_request_id` | Mỗi lần BullMQ retry đọc DB mới nhất; Redis không giữ nội dung truyện |

## 4. Endpoint

Dưới `/api/v1/stories`, giữ khuôn routes → controller → service + `validate` (zod) của repo. Chỉ
**phụ huynh sở hữu** truyện gọi được, trừ `GET` cho Moderator/Admin đọc.

### 4.1 Truyện

| Method | Route | Việc |
|---|---|---|
| `POST` | `/` | Tạo truyện `draft` (mục 5). Body: `topic_id`, `length`, `title`, `situation?`, `characters[{character_id, is_main}]`, `use_ai_image`, `use_tts`. Trả `201` + chi tiết |
| `GET` | `/` | Danh sách truyện của mình, phân trang |
| `GET` | `/:id` | Chi tiết: trang, cảnh, điểm dừng, phương án, nhân vật. Chữ **giữ dạng token**, kèm bảng `token → tên` để frontend thay khi hiển thị |
| `PUT` | `/:id` | Sửa `title`, `situation`, `use_ai_image`, `use_tts` |
| `PUT` | `/:id/characters` | Đổi nhân vật — chỉ khi chưa trang nào có chữ (đổi nhân vật sau khi có chữ làm token trong chữ trỏ sai người) |
| `DELETE` | `/:id` | Xoá mềm (`deleted_at`) |

### 4.2 Editor

| Method | Route | Việc |
|---|---|---|
| `PUT` | `/:id/pages/:pageId` | Sửa chữ trang. `origin = ai` → `ai_edited`. Chữ đi qua `tokenizeNames` trước khi lưu. Xoá `audio_key`, `audio_status = none` |
| `PUT` | `/:id/checkpoints/:cpId` | Sửa `question`, `hint`, `answer_emotion`, phương án. Kiểm đủ trường theo kiểu (bảng "Các kiểu điểm dừng" trong `BE/ai/docs/03`). `origin = ai` → `ai_edited` |
| `POST` | `/:id/pages` | **Chỉ `custom`**. Thêm trang (gắn vào cảnh tạm / cảnh cuối) |
| `DELETE` | `/:id/pages/:pageId` | **Chỉ `custom`**. Không xoá trang đang có điểm dừng đặt sau nó |
| `POST` | `/:id/checkpoints` | **Chỉ `custom`**. Thêm điểm dừng |
| `DELETE` | `/:id/checkpoints/:cpId` | **Chỉ `custom`** |
| `POST` | `/:id/review` | Đặt `reviewed_at`. Chỉ nhận khi mọi trang có chữ và mọi điểm dừng đủ trường theo kiểu |
| `POST` | `/:id/publish-version` | `501` — chờ spec chợ truyện |

Luật `custom` (kiểm ở mọi thao tác thêm/xoá, lấy từ `custom_limits.*`): 4–20 trang; 0–6 điểm dừng
có chấm; tối đa 1 điểm dừng mỗi trang; không đặt sau trang 1; `reflection` chỉ ở trang cuối.

### 4.3 Sinh chữ

| Method | Route | Việc |
|---|---|---|
| `POST` | `/:id/generate` | `202 {ai_request_id}`. `402` không đủ credit · `409` đang sinh · `422` truyện `custom` |
| `GET` | `/:id/generation` | `ai_request` mới nhất của truyện: `status`, `error_code`, `error_message`, `created_at`, `finished_at`. Frontend gọi mỗi 2–3s tới khi `succeeded` / `failed` / `blocked` |

### 4.4 Vòng đời trạng thái

```
stories.status:     draft ──generate──▶ generating ──thành công──▶ ready
                                          └──lỗi──▶ trạng thái trước khi sinh
ai_requests.status: queued ─▶ processing ─▶ succeeded | failed | blocked
```

- `ready` = **mọi trang có chữ**, do ai viết cũng được. Tách khỏi `reviewed_at` (phụ huynh đã xem
  xong). Sửa tay chữ trang: nếu sau khi sửa mọi trang có chữ → `ready`, còn trang trống → `draft`;
  **không** xoá `reviewed_at`. Viết lại bằng AI thì xoá.
- Trong `generating`: **mọi thao tác sửa trả `409`**.
- `blocked` khi service AI trả `SAFETY_BLOCKED` hoặc `FORBIDDEN_TERM_DETECTED` — tách lỗi nội dung
  khỏi lỗi hệ thống cho Admin.

## 5. Dựng khung

### 5.1 Cấu hình trong `platform_settings`

```jsonc
// story_layout.short
{ "pages": 6,  "checkpoints": [
  {"type": "emotion_self", "after": 2}, {"type": "perspective", "after": 3},
  {"type": "problem_solving", "after": 4}, {"type": "reflection", "after": 6} ] }
// story_layout.medium
{ "pages": 8,  "checkpoints": [
  {"type": "emotion_self", "after": 2}, {"type": "perspective", "after": 4},
  {"type": "problem_solving", "after": 5}, {"type": "reflection", "after": 8} ] }
// story_layout.long
{ "pages": 10, "checkpoints": [
  {"type": "emotion_self", "after": 2}, {"type": "perspective", "after": 4},
  {"type": "problem_solving", "after": 6}, {"type": "emotion_other", "after": 8},
  {"type": "reflection", "after": 10} ] }

// limits.* — mỗi khoá một số
limits.page_min_words = 20      limits.page_max_words = 70     limits.sentence_max_words = 15
limits.question_max_words = 15  limits.option_max_words = 12   limits.hint_max_words = 20
limits.feedback_max_words = 25  limits.max_scenes = 4

// custom_limits.*
custom_limits.min_pages = 4     custom_limits.max_pages = 20   custom_limits.max_checkpoints = 6

ai_cost.story_text = <số credit — câu hỏi mở 10.3>
```

Giá trị khớp `BE/ai/docs/03-story-structure.md`. Không viết cứng trong code: Admin chỉnh không cần
deploy. Seed trong `prisma/seed.js`.

### 5.2 `POST /` — một transaction

1. Kiểm `topic_id` tồn tại, `is_active`; mọi `character_id` thuộc phụ huynh, chưa xoá; đúng một
   `is_main`.
2. Tạo `stories` (`private`, `draft`). `situation` qua `tokenizeNames` (mục 6) trước khi lưu.
3. Tạo `story_characters`: nhân vật chính là `{NV1}`, còn lại `{NV2}`, `{NV3}`… theo thứ tự gửi lên.
4. Tạo **cảnh tạm**: `scene_order = 1`, `description = ''`.
5. Tạo N trang trống (`page_order` 1…N, `origin = human`, `content_text = null`) trỏ cảnh tạm.
6. Tạo điểm dừng theo layout, `after_page_id` = trang có `page_order = after`. Kiểu
   `emotion_self` / `emotion_other` đặt **`answer_emotion = 'neutral'` tạm**: migration có CHECK
   `story_checkpoints_answer_emotion_check` bắt buộc kiểu cảm xúc phải có `answer_emotion`. Cùng lý
   do với cảnh tạm. Điểm dừng "đã viết" xác định bằng `question`, không bằng `answer_emotion`; editor
   bắt gửi `answer_emotion` cùng `question` với kiểu cảm xúc.

`custom`: 4 trang trống, không điểm dừng.

**`target`:** `emotion_other` / `perspective` bắt buộc có `target_token` (CHECK trong schema). Mặc
định **nhân vật phụ đầu tiên** (`{NV2}`). Layout có hai kiểu này mà truyện chỉ có một nhân vật →
`422` **ngay lúc tạo**, không để dồn tới lúc sinh.

## 6. Thay tên bằng token — lớp chặn chính

Spec AI §3.1: service `ai` chỉ kiểm lại request, không kiểm output. Chốt thật nằm ở đây.

```js
tokenizeNames(text, nameMap) // nameMap: [{ name, token }]
```

- **Nguồn tên:** `characters.name` của mọi nhân vật trong truyện **+** `child_profiles.name` của mọi
  con của phụ huynh. Tên con có thể xuất hiện trong chuyện kể dù đứa trẻ đó không là nhân vật; tên
  con không phải nhân vật thì không có token — khi đó `tokenizeNames` **không thay** mà chỉ đưa vào
  `forbidden_terms` (xem dưới).
- **Cách khớp:** ranh giới từ, **phân biệt hoa thường**, chuẩn hoá NFC hai phía, **tên dài trước**
  ("Bin Bin" trước "Bin"). Giống hệt cách service `ai` khớp — hai bên không lệch nhau.
- **Thay lúc lưu:** `stories.situation`, `story_pages.content_text`, chữ điểm dừng và phương án. DB
  luôn lưu dạng token (ghi chú của schema).
- **Thay lúc gửi:** `characters.appearance` lưu nguyên văn ("em trai của An") → thay ngay khi dựng
  request.
- Nhân vật tên "Mẹ", "Bố" cũng bị thay — đúng: trong truyện, mẹ là `{NV3}`.
- **Tên con không phải nhân vật lọt vào `situation`:** không có token để thay. `POST /` và `PUT /:id`
  trả `422` kèm thông báo "nội dung chứa tên của con chưa có trong truyện" — thay vì để AI nhận
  `FORBIDDEN_TERM_DETECTED` sau khi đã giữ credit.

## 7. Request gửi `/v1/story/generate`

Dựng trong worker (quyết định 3.7) bằng hàm thuần `buildAiRequest(rows)`.

| Trường | Nguồn |
|---|---|
| `request_id` | `ai_requests.id` |
| `topic.title`, `topic.guidance` | `topics` |
| `topic.competency` | `eq_skills.casel_code` qua `topics.skill_id` |
| `characters[]` | `story_characters` + `appearance` qua `tokenizeNames`; `is_main` |
| `situation` | `stories.situation` (đã là token) |
| `tone` | Tạm cố định `gentle` — câu hỏi mở 10.1 |
| `pages` | `["p1" … "pN"]` theo `page_order` |
| `checkpoints` | `{id: "k<i>", type, after: "p<page_order>", target?}`, `i` theo `page_order` của trang đứng trước |
| `limits` | `limits.*` |
| `forbidden_terms` | Mọi tên ở mục 6 |
| `blocked_keywords` | `blocked_keywords` có `is_active`: `{keyword, severity}` |

## 8. Credit, `ai_requests`, worker

### 8.1 `POST /:id/generate` — một transaction

1. `UPDATE stories SET status = 'generating' WHERE id = $1 AND owner_id = $2 AND status <> 'generating'
   AND deleted_at IS NULL` → 0 dòng thì `409` (hoặc `404` nếu không phải của mình). Bấm đúp / hai tab
   không tạo hai job. Truyện `custom` → `422` (kiểm trước bước này).
2. `SELECT … FROM wallets WHERE user_id = $1 FOR UPDATE`. `credit_balance < cost` → `402`.
3. Tạo `ai_requests`: `request_type = story_text`, `story_id`, `status = queued`,
   `credits_charged = cost`, `idempotency_key = story_text:<ai_request.id>`.
4. `wallet_ledger`: `credit_hold`, `amount = -cost`, `balance_after`,
   `idempotency_key = ai:<id>:hold`, `ref_type = ai_request`, `ref_id`. Trừ `wallets.credit_balance`.

Sau commit: `aiQueue.add('story_text', { ai_request_id }, { jobId: ai_request.id })`.

**Enqueue lỗi** (Redis sập) → bù trừ trong một transaction: `ai_request` → `failed`, ghi
`credit_release`, truyện về trạng thái tính từ trang (8.4); trả `503`. Không dùng outbox pattern — quá nặng cho nhu
cầu này.

**Quy ước sổ cái:**

| Loại | `amount` | Ý nghĩa |
|---|---|---|
| `credit_hold` | `-cost` | Trừ khỏi số dư ngay — không tiêu được hai lần |
| `credit_release` | `+cost` | Hoàn khi lỗi |
| `credit_consume` | `0` | Dòng đánh dấu: khoản giữ đã thành tiêu thật |

Giữ bất biến "số dư = tổng sổ cái" của `wallets`.

### 8.2 Worker — `ai.processor.js`

1. Đọc `ai_request`. Đã ở trạng thái kết thúc (`succeeded` / `failed` / `blocked`) → **trả về, không
   làm gì**: lần chạy trước đã commit nhưng worker chết trước khi báo BullMQ.
2. `status = processing`, `attempts = job.attemptsMade + 1`.
3. Đọc DB, `buildAiRequest`, `callAi('story_text', payload)`.
4. **Thành công** → `persistAiResult` (8.3).
5. **Lỗi** → `classifyFailure(error, job)`:

| Trường hợp | Xử lý |
|---|---|
| `retryable` và `attemptsMade + 1 < attempts` | Ném lại — BullMQ retry. Không đụng credit |
| Không `retryable`, **hoặc** lần cuối | `finalizeFailure` (8.4), rồi ném `UnrecoverableError` |

### 8.3 `persistAiResult` — một transaction

Hàm thuần `planPersist(aiResponse, rows)` tính toàn bộ thay đổi; phần Prisma chỉ thực thi.

1. Khoá lại: `ai_request` phải đang `processing`, không thì bỏ qua (idempotent).
2. Truyện đã bị xoá (`deleted_at`) → không ghi nội dung; vẫn làm bước 7–8 (AI đã làm xong, tiền
   Gemini đã mất).
3. Tạo `story_scenes` mới theo thứ tự `scenes` trong response (`scene_order` 1…, `description`).
4. Cập nhật từng trang theo `page_order` (`p3` → `page_order = 3`): `content_text`,
   `ai_original_text` = cùng giá trị, `origin = ai`, `scene_id` mới, `audio_key = null`,
   `audio_status = none`.
5. Xoá cảnh cũ (giờ không trang nào trỏ tới).
6. Điểm dừng theo `k<i>`: `question`, `hint`, `answer_emotion` (kiểu cảm xúc), `origin = ai`, xoá
   các `*_audio_key`. Xoá rồi tạo lại `checkpoint_options`:
   - `perspective`: 3 phương án theo `option_id`; `is_correct = (option_id === answer)`.
   - `problem_solving`: 3 phương án, `role` = khoá vai, `text`, `feedback`.
7. `stories`: `status = ready`, `reviewed_at = null`.
8. `ai_requests`: `succeeded`, `provider`, `model_name`, `input_tokens`, `output_tokens`,
   `provider_cost_micros = usage.estimated_cost_micros`, `finished_at`.
   `wallet_ledger`: `credit_consume`, `idempotency_key = ai:<id>:consume`.

### 8.4 `finalizeFailure` — một transaction

- `ai_requests.status`: `blocked` nếu `SAFETY_BLOCKED` / `FORBIDDEN_TERM_DETECTED`, còn lại `failed`.
  `error_message = "<code>: <message>"`, `finished_at`.
- `wallet_ledger`: `credit_release`, `+cost`, `idempotency_key = ai:<id>:release`; cộng lại
  `wallets.credit_balance`.
- `stories.status` **tính lại từ các trang**: mọi trang có chữ → `ready`, còn trang trống → `draft`.
  Khi lỗi nội dung không bị đụng, nên trạng thái đúng luôn suy ra được — không cần mang trạng thái cũ
  trong `job.data`, và dùng được cả ở chỗ dọn job kẹt (8.5) vốn không có `job.data`.
- `FORBIDDEN_TERM_DETECTED` nghĩa là `tokenizeNames` đã lọt tên — **bug**, log mức `error`.

**Idempotency** của 8.3 và 8.4 dựa trên hai thứ: kiểm trạng thái `ai_request` ở đầu transaction, và
unique constraint trên `wallet_ledger.idempotency_key`. BullMQ chạy lại bao nhiêu lần cũng không trừ
hay hoàn hai lần.

### 8.5 Job kẹt — dọn lười

`GET /:id/generation` gặp `ai_request` `queued` / `processing` có `created_at` quá **10 phút** →
chạy `finalizeFailure` với lỗi `STALE_JOB`. 10 phút > tệ nhất 3 × 120s + backoff (spec AI §3.8).
Không cần cron. Truyện kẹt mà không ai mở thì không ảnh hưởng ai; lần mở đầu tiên sẽ dọn.

Race: worker có thể vẫn đang chạy đúng lúc dọn. Kiểm trạng thái ở bước 1 của 8.3 làm worker thua
cuộc bỏ qua — credit đã hoàn, nội dung không ghi. Chấp nhận: chỉ xảy ra khi job đã quá 10 phút.

### 8.6 Thay đổi so với spec AI §11

Spec AI §11 mô tả `ai.processor.js` "gửi payload có kiểu + `request_id`; `persistAiResult` vẫn để
trống". Spec này thay thế dòng đó: job chỉ mang `{ ai_request_id }`, processor dựng
payload từ DB và `persistAiResult` được cài đầy đủ. `aiClient.js`, `ai.jobs.js`, `env.js`,
`JOB_CONFIG`, `NON_RETRYABLE_ERROR_CODES` giữ như spec AI §11 — spec này **dùng**, không đổi.

Thứ tự làm: spec AI M1 (mock) + phần Node của spec AI §11 → spec này. Với `LLM_PROVIDER=mock`, toàn
bộ luồng chạy được trước khi có Gemini.

## 9. Kiểm thử

Repo dùng `node --test`, chưa có test DB (Postgres là Supabase cloud, không có container local).
Nên **logic dồn vào hàm thuần**, lớp Prisma mỏng.

### 9.1 Unit — không cần DB

| Hàm | Test |
|---|---|
| `tokenizeNames` | ranh giới từ; phân biệt hoa thường; NFC; "Bin Bin" trước "Bin"; "An" không ăn "an toàn"; tên cuối câu kèm dấu câu (`"An."`) |
| `buildSkeleton(layout, characters)` | 3 layout; `custom`; `target = {NV2}`; `422` khi thiếu nhân vật phụ |
| `buildAiRequest(rows)` | id `p…` / `k…`; `appearance` đã thay token; `forbidden_terms` gồm tên con không phải nhân vật; `competency` đúng |
| `planPersist(response, rows)` | `p3` → `page_order = 3`; `is_correct` từ `answer`; đủ 3 `role`; cảnh cũ bị xoá |
| `classifyFailure(error, job)` | retry / final; `blocked` vs `failed`; thiếu thân lỗi → retryable |
| luật `custom` | 4–20 trang; ≤ 6 điểm dừng; không sau trang 1; `reflection` cuối |

### 9.2 Integration — chạy khi có `TEST_DATABASE_URL`

Trỏ một project Supabase riêng cho test; thiếu biến thì skip.

- Hai `POST /generate` song song → đúng một `ai_request`, một `credit_hold`.
- Không đủ credit → `402`, không có dòng ledger.
- `persistAiResult` chạy hai lần → một `credit_consume`, nội dung ghi một lần.
- Lỗi retryable ba lần → một `credit_release`, truyện về trạng thái cũ.
- Job kẹt quá 10 phút → `GET /generation` dọn, hoàn credit.
- Số dư ví = tổng `wallet_ledger` sau mọi case.

### 9.3 End-to-end — tay, `docker compose`, `LLM_PROVIDER=mock`

Tạo truyện `medium` → `POST /generate` → polling tới `ready` → DB có 8 trang có chữ, ≤ 4 cảnh, 4
điểm dừng đủ trường, ledger `hold` + `consume`. Lặp với `__force: SAFETY_BLOCKED` → `blocked`,
ledger `hold` + `release`, truyện về `draft`.

## 10. Câu hỏi mở

1. **`tone`** lấy từ đâu — schema không có cột. Tạm cố định `gentle`. Nếu phụ huynh được chọn thì
   thêm `stories.tone` (sửa DBML → migration tay → `migrate deploy`).
2. **`warnings`** của service AI lưu ở đâu — `ai_requests` không có cột. Tạm log + để trong return
   value của job.
3. **Giá `ai_cost.story_text`** cụ thể — việc của nhóm khi chốt gói credit.

## 11. Ngoài phạm vi, ghi lại cho nhóm

- Các module vẫn gọi model không còn trong rev8, sẽ lỗi khi gọi tới: `templates`, `orders`,
  `reading-sessions`, `content-library`, `plans`, `notifications`.
- **Lỗi quyền riêng tư:** `characters.service.js` `requestPortraitGeneration` đưa `character.name`
  vào prompt chân dung — tên thật sang model ảnh. Sửa riêng, không chờ spec ảnh.

## 12. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Viết lại `stories` đè phần việc của thành viên khác | Báo nhóm trước khi làm |
| Phụ huynh gõ tên sai hoa thường ("an") → lọt `tokenizeNames` | Service `ai` cũng không bắt. Chấp nhận, như spec AI §3.1 |
| `202` mất trên đường về | Frontend polling `GET /generation` vẫn thấy job |
| Redis mất job | Dọn lười sau 10 phút (8.5) |
| Lưu DB lỗi sau khi AI đã trả | BullMQ retry, gọi AI lại, tốn thêm một lần Gemini. Hiếm; chấp nhận |
| Không có test DB tự động trên CI | Hàm thuần + integration có điều kiện + E2E tay |

## 13. Định nghĩa "xong"

- `npm test` (BE/api) xanh; unit 9.1 đủ.
- Integration 9.2 xanh khi chạy với `TEST_DATABASE_URL`.
- E2E 9.3 chạy được cả nhánh thành công và nhánh `blocked`.
- Seed `platform_settings` chạy được trên DB trống.
- Swagger cập nhật theo endpoint mới; `publish-version` trả `501`.
- Spec AI §11 đã trỏ sang mục 8.6 của spec này.
