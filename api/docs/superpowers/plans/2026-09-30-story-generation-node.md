# Luồng tạo truyện phía Node — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Plan này **cố ý không viết sẵn code** (yêu cầu của người làm). Mỗi task mô tả file, interface,
> hành vi và từng case test bằng lời; người thực hiện tự viết code theo TDD.

**Goal:** Viết lại module `stories` theo schema rev8 và nối luồng "Viết giúp tôi" vào service `ai`
qua BullMQ, có giữ/trừ/hoàn credit và ghi `ai_requests`.

**Architecture:** Logic dồn vào hàm thuần trong `src/modules/stories/lib/` (dựng khung, thay tên,
dựng request AI, lập kế hoạch ghi kết quả, phân loại lỗi) — unit test không cần DB. Lớp Prisma mỏng
ở các service. Worker là một hàm điều phối nhận dependency tiêm vào, nên test được bằng stub.

**Tech Stack:** Node (ESM), Express 5, Prisma 6, zod 4, BullMQ 5, `node --test`.

**Spec:** `BE/api/docs/superpowers/specs/2026-09-30-story-generation-node-design.md` (gọi tắt:
**spec**). Phụ thuộc `BE/ai/docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md` §11 (gọi
tắt: **spec AI**).

## Global Constraints

- **Không commit.** Quy ước dự án: "implement" chỉ là sửa file. Cuối mỗi task là bước
  "checkpoint" — chạy test, báo kết quả, dừng cho người review — thay cho bước commit.
- Không chạy `prisma migrate dev`. Plan này **không đổi schema**.
- Wire JSON của API Node dùng **camelCase** theo quy ước repo (`topicId`, `characterId`, `isMain`…).
  Tên snake_case trong spec là tên mô tả; payload gửi service `ai` giữ **snake_case** theo hợp đồng.
- Chữ truyện luôn lưu dạng token `{NVn}` trong DB.
- Khớp tên: ranh giới từ, phân biệt hoa thường, NFC, tên dài trước (spec §6).
- `ai_requests.attempts` có CHECK `<= 3` — không bao giờ ghi số lớn hơn 3.
- `wallet_ledger` append-only (trigger chặn UPDATE/DELETE); mọi dòng có `idempotency_key` duy nhất.
- Transaction Prisma nhiều câu lệnh (tạo truyện, ghi kết quả AI) đặt `timeout: 20000` — DB là
  Supabase cloud, mặc định 5s không đủ cho ~30 câu lệnh qua mạng.
- Thông báo lỗi trả cho client viết tiếng Việt, theo giọng các module hiện có.
- Chạy test: `npm test` trong `BE/api`.

## Điều chỉnh so với spec (phát hiện khi lập plan)

1. **Điểm dừng cảm xúc lúc dựng khung cần `answer_emotion` tạm.** Migration có CHECK
   `story_checkpoints_answer_emotion_check`: kiểu `emotion_self`/`emotion_other` **bắt buộc**
   `answer_emotion` NOT NULL. Khung trống không thoả. Xử lý như cảnh tạm: đặt `neutral`; "đã viết"
   xác định bằng `question`, không bằng `answer_emotion`. Sửa spec §5.2.
2. **Bỏ `prev_status` khỏi job.** Khi lỗi, nội dung không bị đụng, nên trạng thái đúng luôn tính lại
   được từ các trang: mọi trang có chữ → `ready`, còn trang trống → `draft`. Cách này dùng được cả ở
   chỗ dọn job kẹt (nơi không có `job.data`). Job chỉ mang `{ ai_request_id }`. Sửa spec §8.1, §8.4.
3. **Timeout theo job:** `AI_TIMEOUT_MS` chung bị bỏ; mỗi job có mặc định trong `JOB_CONFIG`
   (120s / 90s / 90s / 30s), ghi đè được bằng `AI_TIMEOUT_MS_<JOB>`. Xoá dòng `AI_TIMEOUT_MS` trong
   `docker-compose.yml` (để lại thì gây hiểu nhầm là còn tác dụng).
4. **`scripts/enqueue-ai-job.js` đổi cách dùng** thành `story_text <storyId>` — đi qua service sinh
   thật (giữ credit), vì processor giờ đọc DB chứ không nhận payload thô. Sửa dòng tương ứng ở
   spec AI §13.

## Review Focus

Các tình huống spec ngụ ý mà dễ bị bỏ sót nhất — mỗi dòng đã có test ở task sở hữu:

1. **Tên con trùng một phần tên nhân vật** (con "An", nhân vật "An Nhiên") — thay "An Nhiên" trước,
   không để lại "{NV1} Nhiên" hay "An" lẻ. → Task 3.
2. **Hai request `generate` gần như đồng thời** — đúng một `ai_request`, một `credit_hold`. → Task 9.
3. **Worker ghi kết quả đúng lúc job bị dọn vì kẹt** — chỉ một bên thắng; không vừa `succeeded` vừa
   hoàn credit. → Task 9, Task 10.
4. **Truyện bị xoá trong lúc đang sinh** — không ghi nội dung, credit vẫn bị trừ, không lỗi. → Task 10.
5. **Phụ huynh sửa chữ để trống lại một trang của truyện `ready`** — truyện về `draft`,
   `reviewed_at` giữ nguyên. → Task 6.

---

## Sơ đồ file

| File | Trách nhiệm |
|---|---|
| `src/queues/ai.jobs.js` | Tên queue, tên job (theo `ai_request_type`) |
| `src/queues/ai.queue.js` | Tạo Queue, `enqueueAiJob(name, data, { jobId })` |
| `src/clients/aiClient.js` | `JOB_CONFIG`, `callAi`, `AiServiceError`, `NON_RETRYABLE_ERROR_CODES` |
| `src/config/env.js` | `ai.timeoutMsByJob` |
| `prisma/seed_platform_settings.js` | Seed `story_layout.*`, `limits.*`, `custom_limits.*`, `ai_cost.story_text` |
| `src/modules/stories/lib/storySettings.js` | Đọc + kiểm cấu hình từ `platform_settings` |
| `src/modules/stories/lib/names.js` | Ngữ cảnh tên, `tokenizeNames`, tìm tên sót |
| `src/modules/stories/lib/skeleton.js` | Gán token, dựng khung, chọn `target` |
| `src/modules/stories/lib/completeness.js` | Điểm dừng đủ trường chưa; trạng thái truyện theo trang |
| `src/modules/stories/lib/customRules.js` | Luật truyện `custom` |
| `src/modules/stories/lib/aiRequest.js` | Nhãn `p…`/`k…`, dựng payload gửi AI |
| `src/modules/stories/lib/persistPlan.js` | Response AI → kế hoạch ghi DB |
| `src/modules/stories/lib/failure.js` | Phân loại lỗi: retry hay kết thúc, `failed` hay `blocked` |
| `src/modules/stories/stories.access.js` | Nạp truyện + kiểm quyền đọc/ghi |
| `src/modules/stories/stories.service.js` | Tạo, danh sách, chi tiết, sửa, xoá, đổi nhân vật |
| `src/modules/stories/stories.editor.service.js` | Sửa trang/điểm dừng, thêm/xoá (custom), review |
| `src/modules/stories/stories.generation.service.js` | `startGeneration`, `getGeneration` (kèm dọn job kẹt) |
| `src/modules/stories/stories.generation.store.js` | Các transaction phía worker: nạp input, `markProcessing`, `persistAiResult`, `finalizeFailure` |
| `src/modules/stories/stories.validation.js` / `.controller.js` / `.routes.js` | Viết lại |
| `src/modules/wallets/creditLedger.js` | `holdCredit`, `releaseCredit`, `consumeCredit` trong transaction |
| `src/workers/ai.processor.js` | Điều phối job, nhận dependency tiêm vào |
| `src/docs/paths/stories.paths.js` | Swagger cho module stories |
| `scripts/enqueue-ai-job.js` | Smoke test bằng tay |
| `tests/lib/*.test.js` | Unit test hàm thuần |
| `tests/integration/*.test.js` | Chạy khi có `TEST_DATABASE_URL` |

---

### Task 1: Hợp đồng client AI (phần Node của spec AI §11)

> Nếu plan của spec AI đã làm task này thì chỉ kiểm lại interface bên dưới rồi bỏ qua.

**Files:**
- Modify: `src/queues/ai.jobs.js`, `src/queues/ai.queue.js`, `src/clients/aiClient.js`,
  `src/config/env.js`, `docker-compose.yml` (khối `worker`)
- Test: `tests/aiClient.test.js` (viết lại)

**Interfaces:**
- Produces:
  - `AI_JOB = { STORY_TEXT: 'story_text', CHARACTER_PORTRAIT: 'character_portrait', SCENE_IMAGE: 'scene_image', NARRATION: 'narration' }`
  - `callAi(jobName, payload) → Promise<object>` — body JSON của service `ai`
  - `class AiServiceError extends Error { code, status, detail, retryable }`
  - `NON_RETRYABLE_ERROR_CODES` = `INVALID_INPUT`, `FORBIDDEN_TERM_DETECTED`, `SAFETY_BLOCKED`, `OUTPUT_INVALID`
  - `enqueueAiJob(jobName, data, { jobId }) → Promise<Job>`
  - `env.ai.timeoutMsByJob[jobName]` — số hoặc `undefined`

- [ ] **Step 1: Viết lại test (đỏ).** Trong `tests/aiClient.test.js`, giữ helper stub `fetch` hiện có
  và thay các case bằng:
  - thành công → trả nguyên body;
  - `story_text` gọi `POST {AI_SERVICE_URL}/v1/story/generate` kèm header `X-Internal-Token`; lặp
    lại cho `narration` → `/v1/tts/synthesize`;
  - body `{ error: { code: 'SAFETY_BLOCKED', retryable: false } }` → `AiServiceError`,
    `code = SAFETY_BLOCKED`, `retryable = false`;
  - `OUTPUT_INVALID` → không retryable;
  - `PROVIDER_ERROR` với `retryable: true` → retryable;
  - **mã lạ nhưng `retryable: false`** → không retryable (tin `retryable` của service);
  - **`INVALID_INPUT` với `retryable: true`** → vẫn không retryable (tập mã của Node thắng);
  - HTTP 500 không body → `PROVIDER_ERROR`, retryable;
  - hết giờ (đặt `AI_TIMEOUT_MS_STORY_TEXT=50` trước khi import) → `TIMEOUT`, retryable;
  - lỗi mạng → `PROVIDER_ERROR`, retryable;
  - tên job lạ → `INVALID_INPUT`, không retryable.
- [ ] **Step 2: Chạy test, xác nhận đỏ.** `npm test -- tests/aiClient.test.js`. Kỳ vọng: fail vì
  `AI_JOB.STORY_TEXT` và `error.code` chưa có.
- [ ] **Step 3: Cài.**
  - `ai.jobs.js`: bốn tên job như trên; bỏ `STORY_PAGE`.
  - `env.js`: bỏ `ai.timeoutMs`; thêm `ai.timeoutMsByJob` đọc `AI_TIMEOUT_MS_STORY_TEXT`,
    `_CHARACTER_PORTRAIT`, `_SCENE_IMAGE`, `_NARRATION` (không đặt thì `undefined`).
  - `aiClient.js`: `JOB_CONFIG` map tên job → `{ endpoint, timeoutMs }` với mặc định 120 000 /
    90 000 / 90 000 / 30 000; timeout thực = override trong env nếu có, không thì mặc định. Đọc
    `body.error.code` / `message` / `retryable`. `retryable = (body.error.retryable !== false) && !NON_RETRYABLE_ERROR_CODES.has(code)`.
    Thiếu cấu hình URL/token → `INVALID_INPUT`. Giữ comment giải thích vì sao import thẳng `env.js`.
  - `ai.queue.js`: `enqueueAiJob(jobName, data, { jobId })` — bỏ phong bì
    `{idempotencyKey, storagePrefix, input}`; comment cũ về jobId giữ ý.
  - `docker-compose.yml`: xoá dòng `AI_TIMEOUT_MS` của `worker`.
- [ ] **Step 4: Chạy test, xác nhận xanh.** Cả `npm test` (các test khác không được vỡ).
- [ ] **Step 5: Checkpoint.** Không commit; báo kết quả test.

---

### Task 2: Cấu hình truyện — seed + reader

**Files:**
- Create: `prisma/seed_platform_settings.js`, `src/modules/stories/lib/storySettings.js`
- Modify: `prisma/seed.js` (gọi seed mới **sau** `seedTopics`)
- Test: `tests/lib/storySettings.test.js`

**Interfaces:**
- Produces:
  - `parseStorySettings(rows: {key, value}[]) → StorySettings`
  - `loadStorySettings(db) → Promise<StorySettings>`
  - `StorySettings = { layouts: { short, medium, long }, limits: { page_min_words, page_max_words, sentence_max_words, question_max_words, option_max_words, hint_max_words, feedback_max_words, max_scenes }, customLimits: { minPages, maxPages, maxCheckpoints }, storyTextCost }`
  - `Layout = { pages: number, checkpoints: { type, after }[] }`

- [ ] **Step 1: Test đỏ.** `parseStorySettings` với bộ dòng đầy đủ → đúng cấu trúc trên, `limits`
  giữ tên snake_case (đi thẳng vào payload AI). Thiếu một khoá → ném lỗi **liệt kê đủ mọi khoá
  thiếu** (không dừng ở khoá đầu). Layout có `after` vượt `pages` → ném lỗi. `ai_cost.story_text`
  âm → ném lỗi.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.**
  - Reader: `loadStorySettings` đọc mọi dòng có key bắt đầu bằng `story_layout.`, `limits.`,
    `custom_limits.`, cộng `ai_cost.story_text`, rồi gọi `parseStorySettings`. Lỗi cấu hình là lỗi
    500 (thiếu seed), không phải lỗi người dùng.
  - Seed: giá trị đúng spec §5.1 (khớp `BE/ai/docs/03`). `ai_cost.story_text = 1` kèm comment "tạm —
    câu hỏi mở §10.3 của spec". `updatedBy` = user moderator mà `seed_topics.js` đã tạo (tìm theo
    email `pedagogy@storyweaver.ai`). Dùng `upsert` với `update: {}` — chạy lại seed **không ghi đè**
    giá trị Admin đã chỉnh.
- [ ] **Step 4: Chạy test xanh.** Chạy thử `npm run db:seed` trên DB dev; chạy lần hai không lỗi, không
  đổi giá trị.
- [ ] **Step 5: Checkpoint.**

---

### Task 3: Thay tên bằng token

**Files:**
- Create: `src/modules/stories/lib/names.js`
- Test: `tests/lib/names.test.js`

**Interfaces:**
- Produces:
  - `buildNameContext({ storyCharacters: { token, name, childId }[], children: { id, name }[] }) → { nameMap: { name, token }[], forbiddenTerms: string[] }`
  - `tokenizeNames(text: string|null, nameMap) → string|null`
  - `findLeftoverNames(text: string|null, forbiddenTerms) → string[]`

- [ ] **Step 1: Test đỏ.**
  - `buildNameContext`: tên nhân vật → token của nó; tên con **gắn với** nhân vật (qua `childId`)
    → cùng token nhân vật đó dù tên khác (con "An", nhân vật "Bé An"); tên con không phải nhân vật
    → chỉ có trong `forbiddenTerms`, không có trong `nameMap`; `forbiddenTerms` không trùng lặp.
  - `tokenizeNames`: "An" → `{NV1}`; "an toàn" không đổi; "Ân" không đổi; "An." và "An," đổi;
    "Bin Bin" được thay trước "Bin"; con "An" + nhân vật "An Nhiên" → "An Nhiên chơi với An" thành
    "{NV1} chơi với {NV2}" (Review Focus 1); đầu vào NFD "Đức" khớp tên NFC "Đức"; `null` → `null`;
    tên có ký tự regex (dấu chấm) không làm vỡ.
  - `findLeftoverNames`: trả tên con không phải nhân vật còn trong chữ; chữ đã thay token → rỗng.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.** Ranh giới từ dùng lookbehind/lookahead Unicode (`\p{L}\p{N}`, cờ `u`), escape
  ký tự regex trong tên, chuẩn hoá NFC cả chữ lẫn tên, sắp tên theo độ dài giảm dần. Dựng regex mới
  mỗi lần (tránh `lastIndex` của regex `g`).
- [ ] **Step 4: Chạy test xanh.**
- [ ] **Step 5: Checkpoint.**

---

### Task 4: Dựng khung, luật `custom`, độ đầy đủ

**Files:**
- Create: `src/modules/stories/lib/skeleton.js`, `src/modules/stories/lib/customRules.js`,
  `src/modules/stories/lib/completeness.js`
- Test: `tests/lib/skeleton.test.js`, `tests/lib/customRules.test.js`, `tests/lib/completeness.test.js`

**Interfaces:**
- Consumes: `Layout`, `customLimits` (Task 2)
- Produces:
  - `assignTokens(characters: { characterId, isMain }[]) → { characterId, token, isMain }[]` — chính là `{NV1}`, còn lại theo thứ tự gửi lên
  - `defaultTarget(storyCharacters) → string|null` — token nhân vật phụ đầu tiên
  - `buildSkeleton({ length, layouts, customLimits, storyCharacters }) → { pageCount, checkpoints: { type, afterPageOrder, targetToken, answerEmotion }[] }`
  - `assertCustomLayout({ pageCount, checkpoints: { type, afterPageOrder }[] }, customLimits)` — ném `ApiError` 422
  - `isCheckpointComplete(cp) → boolean`, `missingCheckpointFields(cp) → string[]`
  - `storyStatusFromPages(pages: { contentText }[]) → 'ready' | 'draft'`

- [ ] **Step 1: Test đỏ.**
  - `assignTokens`: nhân vật chính gửi ở vị trí thứ hai vẫn là `{NV1}`.
  - `buildSkeleton`: ba layout ra đúng số trang và vị trí; `perspective`/`emotion_other` có
    `targetToken = {NV2}`; kiểu cảm xúc có `answerEmotion = 'neutral'` (điều chỉnh 1), kiểu khác
    `null`; `custom` → 4 trang, 0 điểm dừng; layout cần `target` mà chỉ có một nhân vật → `ApiError`
    422.
  - `assertCustomLayout`: 3 trang → lỗi; 21 trang → lỗi; 7 điểm dừng → lỗi; đặt sau trang 1 → lỗi;
    `reflection` không ở trang cuối → lỗi; hai điểm dừng cùng trang → lỗi; khung hợp lệ → không ném.
  - `isCheckpointComplete` từng kiểu: cảm xúc cần `question` + `hint`; `perspective` cần `question`,
    `hint`, 3 phương án có chữ, **đúng một** `isCorrect`; `problem_solving` cần `question`, 3 phương
    án có `text` + `feedback`, đủ 3 `role` khác nhau; `reflection` chỉ cần `question`. Chuỗi toàn
    khoảng trắng coi như trống.
  - `storyStatusFromPages`: mọi trang có chữ → `ready`; một trang trống/khoảng trắng → `draft`.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.** Lỗi người dùng dùng `new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, …)`,
  thông báo tiếng Việt nêu rõ luật bị vi phạm.
- [ ] **Step 4: Chạy test xanh.**
- [ ] **Step 5: Checkpoint.**

---

### Task 5: Module `stories` — tạo, đọc, sửa, xoá, đổi nhân vật

**Files:**
- Create: `src/modules/stories/stories.access.js`
- Rewrite: `src/modules/stories/stories.service.js`, `stories.validation.js`,
  `stories.controller.js`, `stories.routes.js`
- Test: `tests/integration/_db.js`, `tests/integration/_fixtures.js`,
  `tests/integration/stories.crud.test.js`

**Interfaces:**
- Consumes: Task 2–4
- Produces:
  - `loadStoryForRead(user, storyId, db?)` — chủ truyện, hoặc role `moderator`/`admin`; không thấy → 404
  - `loadStoryForWrite(user, storyId, db?)` — chỉ chủ truyện; truyện đang `generating` → 409
  - `storiesService.{ createStory, getStories, getStoryById, updateStory, bindCharacters, deleteStory }`
  - `loadNameContextForStory(db, storyId) → { nameMap, forbiddenTerms }` (Task 6 và 8 dùng)
  - `formatStoryDetail(story)` — trang, cảnh, điểm dừng (kèm phương án) sắp theo thứ tự; `characters: { token, characterId, name, isMain }[]`

- [ ] **Step 1: Hạ tầng integration test.**
  - `_db.js`: import **đầu tiên** trong mọi file integration. Có `TEST_DATABASE_URL` thì gán vào
    `DATABASE_URL`; không có thì đặt `DATABASE_URL` giả để `env.js` import được và export
    `hasTestDb = false`. Mọi `test()` integration truyền `{ skip: !hasTestDb }`.
  - `_fixtures.js`: tạo phụ huynh (email/username ngẫu nhiên mỗi lần chạy), ví có số dư tuỳ chọn,
    con, nhân vật (có/không gắn con), lấy một topic đã seed. Ghi chú trong file: **không dọn dữ
    liệu** — `wallet_ledger` append-only và `users` bị Restrict, nên DB test tích luỹ dữ liệu; dùng
    project Supabase riêng cho test.
- [ ] **Step 2: Test đỏ (integration).**
  - Tạo truyện `medium` → 8 trang trống, 1 cảnh `description = ''`, 4 điểm dừng đúng vị trí/kiểu,
    `perspective.targetToken = {NV2}`, `emotion_self.answerEmotion = neutral`, status `draft`.
  - `situation` có tên nhân vật → lưu dạng token.
  - `situation` có tên con không phải nhân vật → 422, không tạo gì.
  - Nhân vật của phụ huynh khác → 400/404; hai `isMain` → 400 (zod).
  - Truyện `custom` → 4 trang, 0 điểm dừng.
  - `GET /:id` của người khác → 404; moderator đọc được.
  - `PUT /:id` khi đang `generating` → 409.
  - `PUT /:id/characters` khi đã có trang có chữ → 409; khi chưa có chữ → thay token và cập nhật
    `targetToken` của điểm dừng về nhân vật phụ đầu tiên mới.
  - `DELETE /:id` → xoá mềm; `GET` sau đó → 404.
- [ ] **Step 3: Chạy, xác nhận đỏ** (với `TEST_DATABASE_URL`).
- [ ] **Step 4: Cài.**
  - Validation zod (camelCase): `createStory` body `{ topicId, length, title, situation?, characters[{characterId, isMain}] (≥1, đúng một isMain), useAiImage?, useTts? }`; `getStories` query `{ status?, page, limit }`; params uuid.
  - `createStory`: đọc settings, kiểm topic `isActive`, nhân vật thuộc phụ huynh và chưa xoá, lấy
    danh sách con; `assignTokens` → `buildNameContext` → `tokenizeNames(situation)` →
    `findLeftoverNames` rỗng không thì 422 "nội dung chứa tên của con chưa có trong truyện" →
    `buildSkeleton`. Một transaction (`timeout: 20000`): story, story_characters, cảnh tạm, trang
    (tạo xong đọc lại id theo `pageOrder`), điểm dừng trỏ `afterPageId`. Trả `formatStoryDetail`.
  - `getStories`: truyện `private` của mình, chưa xoá, lọc `status`, phân trang theo khuôn cũ.
  - `updateStory`: `title`, `situation` (qua tên → token như trên), `useAiImage`, `useTts`.
  - `bindCharacters`: như test.
  - Routes: `router.use(auth)`; khai báo mọi route của spec §4.1–4.3 (route editor và generation trỏ
    tới controller sẽ cài ở Task 6 và 9 — tạm thời để các handler đó trả 501 để routes không gãy);
    `POST /:id/publish-version` → 501 "Chức năng đăng bán sẽ có ở bản sau".
- [ ] **Step 5: Chạy test xanh.** Chạy `npm test` không có `TEST_DATABASE_URL` → integration được
  skip, unit vẫn xanh.
- [ ] **Step 6: Checkpoint.**

---

### Task 6: Editor và review

**Files:**
- Create: `src/modules/stories/stories.editor.service.js`
- Modify: `stories.validation.js`, `stories.controller.js` (thay các handler 501 của editor)
- Test: `tests/integration/stories.editor.test.js`

**Interfaces:**
- Consumes: `loadStoryForWrite`, `loadNameContextForStory`, Task 4
- Produces: `editorService.{ updatePage, updateCheckpoint, addPage, deletePage, addCheckpoint, deleteCheckpoint, reviewStory }`

- [ ] **Step 1: Test đỏ.**
  - `updatePage`: chữ có tên → lưu token; tên con không phải nhân vật → 422; trang `origin = ai` →
    `ai_edited`; trang `human` giữ `human`; `audioKey` về `null`, `audioStatus = none`.
  - Trạng thái: truyện `draft` điền trang cuối cùng → `ready`; truyện `ready` xoá trắng một trang →
    `draft`, **`reviewedAt` giữ nguyên** (Review Focus 5).
  - `updateCheckpoint`: kiểu cảm xúc gửi `question` mà thiếu `answerEmotion` → 400; `perspective`
    gửi 2 phương án hoặc 2 đáp án đúng → 400; `problem_solving` thiếu vai → 400; `reflection` gửi
    `options` → 400; chữ có tên → token; `origin` `ai` → `ai_edited`; xoá `questionAudioKey`,
    `hintAudioKey`, audio của phương án.
  - `custom`: thêm trang thứ 21 → 422; xoá trang có điểm dừng sau nó → 409; xoá trang ở giữa →
    `pageOrder` liền mạch 1…N; thêm điểm dừng sau trang 1 → 422; thêm `reflection` không ở trang
    cuối → 422; thêm `emotion_other` không gửi `targetToken` → lấy nhân vật phụ đầu tiên.
  - Truyện không phải `custom` gọi thêm/xoá trang hoặc điểm dừng → 422.
  - `reviewStory`: còn trang trống hoặc điểm dừng thiếu trường → 422 kèm danh sách chỗ thiếu; đủ →
    đặt `reviewedAt`.
  - Mọi thao tác khi `generating` → 409.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.**
  - Mỗi thao tác sửa: nạp `loadStoryForWrite` → thay token → ghi → tính lại status bằng
    `storyStatusFromPages` và cập nhật nếu đổi — trong một transaction.
  - Đánh số lại `pageOrder` khi xoá: unique `(storyId, pageOrder)` nên trước hết dời các trang phía
    sau sang số âm tạm, rồi gán lại số dương.
  - Thêm trang `custom`: gắn vào cảnh có `sceneOrder` lớn nhất.
  - Thêm điểm dừng cảm xúc: `answerEmotion = 'neutral'` (CHECK).
  - Sau mỗi thêm/xoá của `custom`: dựng lại khung từ DB và gọi `assertCustomLayout` trước commit.
- [ ] **Step 4: Chạy test xanh.**
- [ ] **Step 5: Checkpoint.**

---

### Task 7: Sổ cái credit

**Files:**
- Create: `src/modules/wallets/creditLedger.js`
- Test: `tests/integration/creditLedger.test.js`

**Interfaces:**
- Produces (đều nhận `tx` là client transaction Prisma):
  - `holdCredit(tx, { userId, amount, aiRequestId })` — khoá ví `SELECT … FOR UPDATE` (raw query), thiếu → `ApiError` 402 "Không đủ credit"; trừ số dư; ghi `credit_hold`, `amount = -amount`, `idempotency_key = ai:<id>:hold`, `ref_type = ai_request`, `ref_id`
  - `releaseCredit(tx, { userId, amount, aiRequestId })` — `+amount`, `ai:<id>:release`
  - `consumeCredit(tx, { userId, aiRequestId })` — `amount = 0`, `balance_after` = số dư hiện tại, `ai:<id>:consume`
  - Cả ba **idempotent**: dòng ledger có key đó đã tồn tại → không làm gì.

- [ ] **Step 1: Test đỏ.** Hold rồi release → số dư như cũ, 2 dòng ledger; hold rồi consume → số dư
  giảm `amount`, 2 dòng; gọi release hai lần → một dòng; hold khi thiếu tiền → 402, không dòng nào;
  sau mọi case, `wallets.credit_balance` = tổng `amount` của ledger `wallet_type = credit` của user.
  Ví chưa tồn tại → 402 (không tự tạo ví ở đây).
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.** `amount` và `balance_after` là BigInt. Không tái dùng code
  `adminGrantCredits` (nó dùng `entry_type` không có trong rev8).
- [ ] **Step 4: Chạy test xanh.**
- [ ] **Step 5: Checkpoint.**

---

### Task 8: Dựng request AI, kế hoạch ghi kết quả, phân loại lỗi

**Files:**
- Create: `src/modules/stories/lib/aiRequest.js`, `src/modules/stories/lib/persistPlan.js`,
  `src/modules/stories/lib/failure.js`
- Test: `tests/lib/aiRequest.test.js`, `tests/lib/persistPlan.test.js`, `tests/lib/failure.test.js`
- Fixture: dùng `BE/ai/docs/samples/story_request.json` và `story_response.json` làm dữ liệu mẫu

**Interfaces:**
- Consumes: `tokenizeNames` (Task 3), `AiServiceError` (Task 1)
- Produces:
  - `labelPages(pages: { pageOrder }[]) → Map<pageOrder, 'p<n>'>`; `labelCheckpoints(checkpoints: { afterPageOrder }[]) → Map<afterPageOrder, 'k<i>'>` (i theo `afterPageOrder` tăng dần, bắt đầu 1)
  - `buildAiRequest(input) → payload` với `input = { aiRequestId, situation, topic: { title, guidance, caselCode }, characters: { token, isMain, appearance }[], pages, checkpoints: { type, afterPageOrder, targetToken }[], limits, nameContext, blockedKeywords: { keyword, severity }[] }`
  - `planPersist(response, { pages: { id, pageOrder }[], checkpoints: { id, type, afterPageOrder }[] }) → { scenes: { key, sceneOrder, description }[], pages: { id, contentText, sceneKey }[], checkpoints: { id, question, hint, answerEmotion, options: { optionOrder, text, role, isCorrect, feedback }[] }[] }`
  - `classifyFailure(error, { attemptsMade, maxAttempts }) → { action: 'retry' } | { action: 'finalize', status: 'failed'|'blocked', code, message }`

- [ ] **Step 1: Test đỏ — `buildAiRequest`.** Với dữ liệu dựng từ sample: payload bằng
  `story_request.json` (trừ `request_id` = `aiRequestId`); id trang `p1…p8`, điểm dừng `k1…k4`,
  `after` đúng, `target` chỉ có ở `perspective`/`emotion_other`; `appearance` "em trai của An" →
  "em trai của {NV1}"; `forbidden_terms` gồm cả tên con không phải nhân vật; `tone = 'gentle'`;
  trường snake_case đúng hợp đồng.
- [ ] **Step 2: Test đỏ — `planPersist`.** Với `story_response.json`: 3 cảnh, `sceneOrder` theo thứ tự
  **trang đầu tiên dùng cảnh đó**; cảnh không trang nào dùng bị bỏ; `p3` → trang `pageOrder = 3`;
  `k1` → `answerEmotion = angry`, có `hint`; `k2` → 3 phương án, đúng một `isCorrect` (`o1`),
  `role = null`; `k3` → 3 phương án có `role` + `feedback`, `isCorrect = null`, `hint = null`; `k4`
  → không phương án. Response thiếu một `page_id` hoặc checkpoint → ném `AiServiceError`
  `OUTPUT_INVALID` (không retryable).
- [ ] **Step 3: Test đỏ — `classifyFailure`.** Retryable, lần 1/3 → retry; retryable, lần 3/3 →
  finalize `failed`; `SAFETY_BLOCKED` lần 1 → finalize `blocked`; `FORBIDDEN_TERM_DETECTED` →
  `blocked`; `OUTPUT_INVALID` → `failed`; lỗi thường (không phải `AiServiceError`, ví dụ lỗi
  Prisma) → code `INTERNAL`, retryable.
- [ ] **Step 4: Chạy, xác nhận đỏ.**
- [ ] **Step 5: Cài** theo interface. Không đọc DB trong ba file này.
- [ ] **Step 6: Chạy test xanh.**
- [ ] **Step 7: Checkpoint.**

---

### Task 9: Bắt đầu sinh và theo dõi — phía API

**Files:**
- Create: `src/modules/stories/stories.generation.service.js`
- Create (phần dùng chung với worker): `src/modules/stories/stories.generation.store.js` — ở task
  này chỉ `finalizeFailure`; Task 10 thêm phần còn lại
- Modify: `stories.controller.js` (thay handler 501 của `generate` / `generation`)
- Test: `tests/integration/stories.generation.test.js`

**Interfaces:**
- Consumes: `holdCredit`, `releaseCredit` (Task 7), `loadStorySettings`, `storyStatusFromPages`
- Produces:
  - `startGeneration(user, storyId, { enqueue } = {}) → { aiRequestId }` — `enqueue` mặc định import động `enqueueAiJob` (tránh mở Redis lúc import, test tiêm stub)
  - `getGeneration(user, storyId, { now } = {}) → { aiRequestId, status, errorCode, errorMessage, createdAt, finishedAt } | null`
  - `finalizeFailure(db, { aiRequestId, status, code, message }) → boolean` — `false` nếu `ai_request` đã ở trạng thái kết thúc
  - `STALE_AFTER_MS = 600000`

- [ ] **Step 1: Test đỏ.**
  - Thành công: 202 `{ aiRequestId }`; truyện `generating`; `ai_request` `queued`,
    `creditsCharged` = giá, `idempotencyKey = story_text:<id>`; một `credit_hold`; `enqueue` được
    gọi với `(story_text, { ai_request_id }, { jobId: aiRequestId })`.
  - **Hai lời gọi song song** (`Promise.all`) → một thành công, một 409; đúng một `ai_request`, một
    `credit_hold` (Review Focus 2).
  - Không đủ credit → 402; truyện vẫn trạng thái cũ; không `ai_request`.
  - Truyện `custom` → 422.
  - `enqueue` ném lỗi → 503; `ai_request` `failed` với `ENQUEUE_FAILED`; có `credit_release`; truyện
    về trạng thái tính từ trang.
  - `getGeneration`: trả `ai_request` mới nhất; `errorCode` tách từ `errorMessage` dạng
    `"<CODE>: <message>"`; `ai_request` `processing` tạo cách đây 11 phút (tiêm `now`) → bị dọn:
    `failed`, `STALE_JOB`, hoàn credit, truyện về trạng thái tính từ trang; 9 phút → không dọn.
  - `finalizeFailure` gọi hai lần → lần hai trả `false`, không hoàn thêm.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài.**
  - `startGeneration`: kiểm quyền chủ truyện, `custom` → 422; đọc giá; transaction: `updateMany`
    story sang `generating` với điều kiện `status ≠ generating`, chưa xoá, đúng chủ — `count = 0` thì
    409; tạo `ai_request` (id sinh sẵn bằng `randomUUID`); `holdCredit`. Sau commit gọi `enqueue`;
    lỗi thì `finalizeFailure(... 'failed', 'ENQUEUE_FAILED' …)` rồi ném `ApiError` 503.
  - `finalizeFailure`: một transaction; câu đầu tiên là `updateMany` `ai_request` sang
    `status`/`errorMessage`/`finishedAt` **với điều kiện** đang `queued` hoặc `processing` — `count
    = 0` thì trả `false` (bên kia đã thắng); `releaseCredit`; nếu có truyện đang `generating` → đặt
    status theo `storyStatusFromPages`. `errorMessage` cắt 1000 ký tự.
  - Controller: `generate` trả **202** qua `ApiResponse.success(res, { statusCode: 202, … })`.
- [ ] **Step 4: Chạy test xanh.**
- [ ] **Step 5: Checkpoint.**

---

### Task 10: Worker — nạp input, ghi kết quả, điều phối

**Files:**
- Modify: `src/modules/stories/stories.generation.store.js` (thêm `markProcessing`,
  `loadGenerationInput`, `persistAiResult`)
- Rewrite: `src/workers/ai.processor.js`
- Modify: `src/worker.js` (log lỗi đọc `error.code` thay `errorKind` nếu có)
- Rewrite: `scripts/enqueue-ai-job.js`
- Test: `tests/aiProcessor.test.js` (unit, stub), `tests/integration/stories.persist.test.js`

**Interfaces:**
- Consumes: Task 8, `finalizeFailure`, `consumeCredit`, `loadNameContextForStory`, `callAi`
- Produces:
  - `markProcessing(db, aiRequestId, attempt) → boolean` — `updateMany` sang `processing`, `attempts = min(attempt, 3)`, điều kiện đang `queued`/`processing`
  - `loadGenerationInput(db, aiRequestId) → input của buildAiRequest`
  - `persistAiResult(db, { aiRequestId, response }) → boolean`
  - `createAiProcessor(deps) → (job) => Promise` với `deps = { markProcessing, loadInput, callAi, persist, finalize, logger }`; `export default` là processor dựng từ dependency thật

- [ ] **Step 1: Test đỏ — processor (unit, stub mọi dependency).**
  - Job `story_text` thành công → gọi theo thứ tự `markProcessing` → `loadInput` → `callAi` →
    `persist`; trả `{ aiRequestId, warnings }`.
  - `markProcessing` trả `false` → trả `{ skipped: true }`, không gọi AI.
  - `callAi` ném lỗi retryable ở lần 1/3 → ném lại **chính lỗi đó**, không gọi `finalize`.
  - Lỗi retryable ở lần 3/3 → gọi `finalize` với `failed`, ném `UnrecoverableError`.
  - `SAFETY_BLOCKED` lần 1 → `finalize` với `blocked`, `UnrecoverableError`.
  - `FORBIDDEN_TERM_DETECTED` → `logger.error` được gọi (đây là bug phía Node).
  - `persist` ném lỗi (DB) ở lần 1/3 → ném lại để BullMQ retry.
  - Job tên khác (`narration`…) → `UnrecoverableError` "chưa hỗ trợ", không đụng DB.
- [ ] **Step 2: Test đỏ — `persistAiResult` (integration).** Chuẩn bị: truyện `medium` đã tạo (Task
  5), `startGeneration` với `enqueue` stub, `markProcessing`, response = `story_response.json` với
  `request_id` thay bằng id thật.
  - Sau khi ghi: 3 cảnh mới, cảnh tạm đã xoá; 8 trang có chữ, `origin = ai`,
    `aiOriginalText = contentText`, trỏ đúng cảnh; 4 điểm dừng đủ trường, phương án đúng; truyện
    `ready`, `reviewedAt = null`; `ai_request` `succeeded`, token/provider/model/cost đã ghi; ledger
    có `hold` + `consume`.
  - Gọi lần hai → `false`, không dòng ledger mới, nội dung không đổi.
  - **Đua với dọn job kẹt** (Review Focus 3): chạy `finalizeFailure` và `persistAiResult` song song
    trên cùng `ai_request` → đúng một bên trả `true`; nếu `finalize` thắng thì truyện không có chữ AI
    và ledger là `hold` + `release`; nếu `persist` thắng thì `hold` + `consume`; không bao giờ có cả
    `release` lẫn `consume`.
  - **Truyện bị xoá mềm trước khi ghi** (Review Focus 4) → trả `true`; không trang nào đổi;
    `ai_request` `succeeded`; ledger `hold` + `consume`.
  - Truyện đã có chữ do người viết rồi sinh lại → chữ cũ bị thay, `reviewedAt` về `null`.
- [ ] **Step 3: Chạy, xác nhận đỏ.**
- [ ] **Step 4: Cài.**
  - `loadGenerationInput`: đọc `ai_request` → truyện (kèm topic → `eqSkill.caselCode`,
    story_characters → character, trang, điểm dừng) → con của chủ truyện → `blockedKeywords` đang
    bật → `loadStorySettings().limits`; ghép thành input của `buildAiRequest`.
  - `persistAiResult`: một transaction `timeout: 20000`. Câu đầu tiên: `updateMany` `ai_request`
    sang `succeeded` (kèm usage: `provider`, `modelName`, `inputTokens`, `outputTokens`,
    `providerCostMicros` BigInt từ `estimated_cost_micros`, `finishedAt`) **với điều kiện** đang
    `processing` — `count = 0` thì trả `false`. Nếu truyện chưa xoá: `planPersist`; dời `sceneOrder`
    của cảnh cũ sang số âm (tránh unique `(storyId, sceneOrder)`); tạo cảnh mới; cập nhật từng trang
    (chữ, `aiOriginalText`, `origin = ai`, `sceneId`, xoá audio); xoá cảnh cũ; cập nhật điểm dừng
    (`question`, `hint`; `answerEmotion` chỉ với kiểu cảm xúc, kiểu khác để `null`;
    `origin = ai`, xoá audio) và xoá/tạo lại phương án; truyện `ready`, `reviewedAt =
    null`. Cuối cùng `consumeCredit`.
  - Processor: `createAiProcessor` như interface; `attemptsMade` và `opts.attempts` lấy từ job;
    `warnings` khác rỗng → `logger.warn` kèm danh sách `code` (spec §10.2 — chưa có chỗ lưu).
  - `scripts/enqueue-ai-job.js`: `node scripts/enqueue-ai-job.js story_text <storyId>` — đọc chủ
    truyện rồi gọi `startGeneration` với `enqueue` thật; in `aiRequestId`; đóng queue và Prisma.
- [ ] **Step 5: Chạy test xanh.** Cả unit lẫn integration.
- [ ] **Step 6: Checkpoint.**

---

### Task 11: Swagger, dọn code cũ, cập nhật tài liệu

**Files:**
- Create: `src/docs/paths/stories.paths.js`
- Modify: `src/docs/swagger.js` — xoá khối `// Stories Paths` (từ `'/stories'` tới trước
  `'/backgrounds'`, hiện khoảng dòng 3021–3351), thay bằng spread `storiesPaths`; sửa mô tả tag
  `Stories` (bỏ "lựa chọn rẽ nhánh")
- Modify: `BE/docs/contracts/ai-service.md` — nếu plan spec AI chưa sửa: nêu job chỉ mang
  `ai_request_id`, request dựng trong worker
- Modify: spec AI §13, dòng `enqueue-ai-job.js`, theo điều chỉnh 4 (spec Node đã được sửa theo
  điều chỉnh 1–2 lúc lập plan)

- [ ] **Step 1: Swagger.** Mô tả đủ route của spec §4 với body camelCase, mã lỗi 402 / 409 / 422 /
  501 / 503, và ví dụ response chi tiết truyện (token + bảng `characters`).
- [ ] **Step 2: Kiểm tay.** Chạy `npm run dev`, mở `/api-docs`, thấy tag Stories mới, không còn route
  `choices`.
- [ ] **Step 3: Tìm tham chiếu cũ.** Tìm trong `src/` các chuỗi `AI_JOB.STORY_PAGE`, `errorKind`,
  `storagePrefix`, `storiesService.updateChoice` — phải không còn (trừ module ngoài phạm vi, ghi lại
  nếu có).
- [ ] **Step 4: Checkpoint.**

---

### Task 12: Kiểm thử đầu-cuối bằng tay (spec §9.3)

**Điều kiện:** service `ai` đã có M1 (mock) theo spec AI; `.env` gốc có `DATABASE_URL`, `JWT_SECRET`,
`INTERNAL_TOKEN`; đã chạy seed.

- [ ] **Step 1:** `docker compose up --build`. Service `ai` chạy với `LLM_PROVIDER=mock`.
- [ ] **Step 2:** Tạo phụ huynh, cấp credit (endpoint Admin cấp credit hoặc chèn tay một dòng
  `credit_grant` + cập nhật ví), tạo con + 2 nhân vật.
- [ ] **Step 3:** `POST /stories` (`medium`) → `POST /stories/:id/generate` → gọi
  `GET /stories/:id/generation` tới khi `succeeded`. Kỳ vọng DB: 8 trang có chữ, ≤ 4 cảnh, 4 điểm
  dừng đủ trường; ledger `hold` + `consume`; số dư giảm đúng giá.
- [ ] **Step 4:** Nhánh bị chặn: đặt `__force: SAFETY_BLOCKED` cho mock (theo cách spec AI §4.3 mô tả)
  rồi sinh lại → `blocked`; ledger `hold` + `release`; truyện giữ chữ cũ, status `ready`; log worker
  cho thấy dừng ở attempt 1/3.
- [ ] **Step 5:** `docker compose exec worker node scripts/enqueue-ai-job.js story_text <storyId>` chạy
  hết vòng.
- [ ] **Step 6:** Ghi kết quả (ảnh chụp số dư, log) vào báo cáo task; checkpoint cuối.

---

## Tự rà soát

- **Phủ spec:** §4.1 → Task 5; §4.2 → Task 6; §4.3 → Task 9; §4.4 → Task 4, 6, 9, 10; §5 → Task 2, 4,
  5; §6 → Task 3, 5, 6; §7 → Task 8, 10; §8.1 → Task 9; §8.2–8.3 → Task 10; §8.4–8.5 → Task 9; §8.6
  → Task 1, 11; §9 → Task 2–10, 12; §13 → Task 11, 12.
- **Tên nhất quán:** `loadStoryForWrite`, `loadNameContextForStory`, `storyStatusFromPages`,
  `finalizeFailure`, `persistAiResult`, `markProcessing`, `createAiProcessor` dùng cùng tên ở mọi
  task.
