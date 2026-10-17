# 01 — Nhật ký quyết định

Đọc file này trước khi đề xuất bất kỳ thay đổi thiết kế nào. Thứ nằm ở mục **Đã bỏ** không được
đưa trở lại nếu chưa được hỏi.

## Đã chốt

**Cấu trúc truyện**
- Truyện **tuyến tính**, không rẽ nhánh. Độ dài Ngắn / Vừa / Dài = 6 / 8 / 10 trang.
- Tương tác qua **điểm dừng** chèn giữa các trang. Với truyện AI viết, kiểu và vị trí điểm dừng do
  **backend** quyết theo độ dài (bảng trong `docs/03-story-structure.md`).
- Truyện **tự viết** có cấu trúc tự do (`length = custom`): 4–20 trang, 0–6 điểm dừng có chấm,
  tối đa 1 điểm dừng mỗi trang, không đặt sau trang 1, `reflection` chỉ ở cuối.
- Bốn kiểu điểm dừng: nhận diện cảm xúc, đặt mình vào vị trí người khác, giải quyết tình huống,
  liên hệ bản thân (không chấm).
- Nhận diện cảm xúc dùng **bộ 5 cảm xúc cố định**: vui, buồn, giận, sợ, bình thường.
- Giải quyết tình huống có **3 phương án theo 3 vai cố định**: xây dựng, né tránh, bốc đồng.

**Tạo truyện**
- Hai chế độ dùng chung một editor: **Viết giúp tôi** (AI viết cả truyện **một lần**, phụ huynh
  sửa tay nếu cần) và **Tự viết** (hoàn toàn thủ công, không dùng AI cho chữ).
- Không có AI viết lại từng trang hay điền từng điểm dừng — để chi phí mỗi truyện cố định.
  Sinh lại cả truyện tính như một lần tạo mới.
- Không có bước dàn ý trước.
- Phụ huynh chọn nhân vật bằng danh sách tích — **không có ô gán vai**.
- Đầu vào: con, nhân vật, **bài học** (gắn 1 năng lực CASEL), chuyện thật (tuỳ chọn), độ dài,
  cờ `use_ai_image`, `use_tts`.

**Độ dài**
- Đếm theo **tiếng** (tách khoảng trắng). Mỗi trang mục tiêu 40–60, tối đa 70, tối thiểu 20.
- **Mục tiêu cũng do backend gửi** (2026-10-15, người dùng chốt): `limits.page_target_min_words` /
  `page_target_max_words` trong `platform_settings` -> request -> prompt ("nhắm khoảng 40–60, không dưới
  20, không quá 70"). Lý do: khi prompt chỉ nói "20 đến 70", cả Gemini lẫn Claude viết 29–35 tiếng một
  trang. Validator vẫn chỉ cưỡng chế min/max; mục tiêu không phải luật. Service và Node kiểm
  `min <= target_min <= target_max <= max`.

**Chuyện thật phụ huynh kể** *(2026-10-15, người dùng chốt)*
- Truyện **giữ diễn biến chính** (ai làm gì, theo thứ tự nào) để trẻ nhận ra chuyện của mình; chỉ làm
  nhẹ chi tiết nguy hiểm / đáng sợ, và khi làm nhẹ vẫn giữ hành động và cảm xúc. Thay câu cũ "làm cảm
  hứng, không chép nguyên văn" — với câu đó, Claude bỏ hẳn việc "ném đồ chơi vào tường" của
  `conflict_strong`.
- Mỗi câu tối đa 15 tiếng. Giới hạn cho câu hỏi, phương án, gợi ý, phản hồi: xem docs 03.
- Con số do backend gửi trong request; service không viết cứng.

**Nhân vật và tên thật**
- Backend thay tên bằng `{NV1}`, `{NV2}`… kèm mô tả không có tên. Gemini không thấy tên thật.
- Chữ lưu kèm token; tên thật chỉ thay vào ở backend khi hiển thị và khi gửi TTS.

**Tranh**
- Tối đa 4 cảnh mỗi truyện; AI gom trang thành cảnh; mỗi cảnh 1 ảnh.
- Chân dung nhân vật (sinh 2 phương án, phụ huynh chọn 1) làm ảnh tham chiếu.
- Lớp adapter theo runtime, model là dữ liệu cấu hình (docs 06).
- Không nhận ảnh upload từ người dùng.

**Giọng đọc**
- VieNeu-TTS tự host, nhận chữ đã thay tên thật. Không log chữ.

**Chữ — Gemini** *(spike `scripts/try_story.py`, 2026-09-30; số liệu thô ở `out/try_story/`, không
commit)*. **Spike TẠM DỪNG, mới xong MỘT PHẦN** (1 trong 3 sample đo được; xem "Đang mở" cuối file):
các số dưới đây là kết quả của một mẫu, chưa phải kết luận cuối. Gemini **chỉ dùng cho chữ** — không
dùng sinh ảnh (spec §2.1).
- **Model chữ: `gemini-3.8-flash`** (đặt qua `GEMINI_TEXT_MODEL`). Lý do: trong danh sách model key
  gọi được (`models.list`, lọc `generateContent` + "flash"), đây là model Flash chữ **mới nhất,
  bản ổn định** (không `-preview`, không `-lite`, không `-image`/`-tts`, không họ `omni`). Các bản
  ổn định cũ hơn cũng có: `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`,
  `gemini-2.5-flash`.
- **Thinking: tắt, `LLM_THINKING_BUDGET=0`** (provider gửi `ThinkingConfig(thinking_budget=0)`).
  Model chấp nhận (không lỗi 400) và response **không có** `thoughts_token_count` → thinking thật sự
  tắt. Tài liệu chính thức chỉ liệt kê `thinking_level` low/medium/high (mặc định medium) cho
  3.8-flash và gọi `thinking_budget` là tham số cũ "backward compatibility" — nếu Google bỏ hẳn
  tham số cũ thì phải chuyển sang `thinking_level` (không còn "tắt", chỉ còn `low`) và đặt
  `LLM_THINKING_BUDGET` > 0 làm phần dự trữ cộng vào trần. Chưa đổi provider vì cấu hình hiện tại
  chạy đúng.
- **Token thinking CÓ tính vào `max_output_tokens`** (tài liệu chính thức: "including thought
  tokens") → giữ quy tắc spec 3.11.4: budget thinking **cộng thêm** vào trần chữ. Spike không đo lại
  điểm này bằng lời gọi có thinking (hết ngân sách lời gọi, xem dưới).
- **Nhiệt độ:** không gửi (`LLM_TEMPERATURE` rỗng) → mặc định của model (1.0, đúng khuyến nghị
  Gemini 3).
- **Nhiệt độ lần thử lại: mặc định cũng không gửi** (`LLM_RETRY_TEMPERATURE` **mặc định không đặt**,
  rỗng = không gửi; chốt
  2026-10-04 trước Task 12). Spec 8.2 từng đặt 0.4 để model bám danh sách lỗi, nhưng tài liệu chính
  thức Gemini 3 "strongly recommend keeping the temperature at its default value of 1.0 … below 1.0
  may lead to unexpected behavior" (lặp, giảm chất lượng). Giữ biến cấu hình để đặt được một giá
  trị cho model khác nếu đo thấy có lợi; lần thử lại bám lỗi nhờ lượt hội thoại kèm danh sách lỗi.
- **`TOKENS_PER_WORD = 2.8`** (mặc định trong `Settings`). Đo được **2.557** = `candidates_token_count`
  (1148, gồm cả khung JSON: key, id, dấu ngoặc) ÷ tổng `count_words` mọi ô của output (449 tiếng:
  trang, mô tả cảnh, câu hỏi, đáp án, gợi ý, phương án, phản hồi). 2.8 ≈ 2.557 × 1.1 (biên ~10%),
  rồi công thức trần còn nhân 1.3. Mới có **một** mẫu đo (truyện chuẩn 8 trang) — đo lại khi có
  thêm lời gọi thật (Task 14).
- **Không bị cắt:** truyện chuẩn 8 trang `finish_reason = STOP`, 1148 / 2413 token trần.
- **Structured output dùng được:** `response_schema = LlmStoryOutput` (class Pydantic, có
  `nullable` và `default: []`) được API chấp nhận; output parse được thành `LlmStoryOutput`,
  `page_id` / `checkpoint_id` khớp khung, 4 cảnh, đúng field theo kiểu điểm dừng. Không cần đổi
  shape §5.4.
- **An toàn:** truyện chuẩn (giành xe, khóc to) **không bị chặn** (`STOP`, không có
  `prompt_feedback.block_reason`). Model 3.8-flash **không trả** safety ratings nào (cả candidate lẫn
  prompt) khi không chặn. Sample xung đột mạnh (`conflict_strong.json`) **chưa đo được** — xem
  "Đang mở".
- **SDK không tự retry:** provider đặt `HttpRetryOptions(attempts=1)`; mỗi lỗi 503 trong spike là
  đúng một request (không thấy SDK thử lại).
- Chất lượng (ghi nhận, không phải lỗi): mỗi trang 29–32 tiếng — trên mức tối thiểu 20 nhưng dưới
  mục tiêu 40–60. Validator M2 chỉ cưỡng chế min/max; prompt có thể cần nhấn mục tiêu.

**Chữ — Claude là provider chính** *(2026-10-15, người dùng chốt; thay Gemini)*
- **Production: `LLM_PROVIDER=claude`** (Anthropic API, `ANTHROPIC_API_KEY` trong container, tính tiền
  theo token). **Máy dev: `claude_code`** (CLI `claude` đang đăng nhập qua `claude-agent-sdk`) — không
  bao giờ phục vụ phụ huynh thật (gói subscription cho dùng cá nhân); image Docker không cài SDK.
- `GeminiLLMProvider` **giữ lại** trong code như một lựa chọn cấu hình, không còn là hướng chính.
  Không có dự phòng tự động giữa hai provider (quyết định riêng nếu cần).
- **Cấu hình đã đo được** (`claude_code`, alias `sonnet` -> `claude-sonnet-5-5`):
  `LLM_CLAUDE_EFFORT=low`, `LLM_CLAUDE_THINKING` để trống (thinking không tắt được trên model này qua
  CLI), `LLM_THINKING_BUDGET=12000` (8000 trước 2026-10-16) làm phần dự trữ cộng vào trần. Production dùng id đầy đủ
  `LLM_CLAUDE_MODEL=claude-sonnet-5-5`. Model, effort, thinking đều là cấu hình, không viết cứng.
- **Số đo 2026-10-15** (mỗi mẫu một lần, `out/try_story/20261015-2144*`): `story_request` 8 trang 26 s,
  `custom_long` 20 trang 56,5 s; cả hai 1 lần gọi, `STOP`, validator 0 issue, 4 cảnh, đúng khung.
  Tiếng/trang trung bình 31,6 và 35,5 (min 28, max 39). `conflict_strong` 8 trang: 37 s, 1 lần gọi,
  `STOP`, **không bị chặn**, 0 issue. Token ra gồm cả thinking (CLI không tách), nên
  `TOKENS_PER_WORD` cho Claude **chưa đo được**.
- **Số đo sau khi prompt nhắm 40–60 tiếng và giữ diễn biến chính** (2026-10-15/16, mỗi mẫu một lần,
  `LLM_THINKING_BUDGET=8000`): `story_request` 48 s, 46,0 tiếng/trang; `conflict_strong` 49 s, 44,5
  tiếng/trang, giữ cảnh ném đồ chơi; `custom_long` 20 trang **90,5 s**, 45,8 tiếng/trang, **14.205 /
  14.698 token** (97% trần). Cả ba: 1 lần gọi, `STOP`, 0 issue. Dự trữ thinking nâng lên 12000.
- Không gửi nhiệt độ (anthropic 1.x bỏ tham số; model trả 400). Không bật refusal fallback phía server:
  truyện bị từ chối phải ra `SAFETY_BLOCKED`, không lặng lẽ chạy lại trên model khác. Chi tiết: README
  "Claude".

**Kiến trúc service `ai` + hợp đồng với Node** *(spec `docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md`;
số mục trong ngoặc là số mục của spec đó)*
- **BullMQ + Redis dùng thật** (§3.6): BullMQ là hàng đợi thực thi, nằm hoàn toàn ở Node
  (`attempts: 3`, backoff mũ 2s, `concurrency: 3`); service `ai` không có Redis, vẫn stateless. Bảng
  `ai_requests` là **bản ghi** (trạng thái, credit đã trừ, token, provider, model) cho credit, audit,
  đối soát Admin — không phải hàng đợi. Service `ai` không đọc/ghi Postgres, không dedupe theo
  idempotency (chống trùng là việc của BullMQ `jobId` + unique constraint ở DB).
- **Chốt chặn tên thật một tầng, chỉ kiểm request** (§3.1): ranh giới từ + phân biệt hoa thường +
  giữ nguyên dấu (so sau khi chuẩn hoá NFC); chỉ quét `situation` và `characters[].description`
  (ảnh: các mô tả); **không kiểm output**, không có tầng cảnh báo lỏng. Lý do và bảng ví dụ tên Việt:
  `docs/04`.
- **LLM trả list, wire trả dict** (§3.2): Gemini nhận `response_schema` cố định
  (`pages: [{page_id, scene_id, text}]` …); service validate trên list rồi mới map sang dict theo id
  (parse -> validate -> map). Mẫu: `docs/samples/story_llm_output.json` <-> `story_response.json`.
- **`SCENE_DESCRIPTION_MAX_WORDS`** (§3.3) là hằng của service (mặc định 30), không phải trường
  `limits` backend gửi.
- **Hai luật validator ngoài bảng gốc** (§3.4): `PREACHY_PHRASE` (WARN) và `PAGE_SENTENCE_TOO_LONG`
  (DOWNGRADE). Cùng #8, #13 suy ra từ docs 03 (xem `docs/04`).
- **`extra="forbid"` trên mọi request, wire `snake_case`** (§3.5): gõ nhầm tên field (`forbiden_terms`)
  phải là lỗi, không được im lặng coi `forbidden_terms` là rỗng rồi gửi tên thật cho Gemini.
- **Service upload Storage và trả key, không trả base64** (§3.7): BullMQ giữ return value của job
  trong Redis, base64 vài MB mỗi ảnh sẽ làm phình Redis. Request ảnh/TTS có `storage_prefix` (chuỗi
  opaque do Node đặt, có kiểm ký tự); ảnh cảnh đọc chân dung lại bằng `portrait_key`.
- **Ngân sách thời gian** (§3.8): `AI_TIMEOUT_MS_<JOB>` (Node) > 2 x `LLM_TIMEOUT_SECONDS` + overhead.
  `LLM_TIMEOUT_SECONDS = 150`; timeout Node theo loại job: truyện 320s, chân dung / cảnh 90s, TTS 30s.
  (Người dùng chốt nâng đồng loạt, không làm timeout theo độ dài truyện: 45s / 120s -> 90s / 200s
  (2026-10-15, 20 trang ~57s) -> 150s / 320s (2026-10-16, 20 trang 90,5s, 14.205 / 14.698 token sau khi
  prompt nhắm 40–60 tiếng). **Biên an toàn tạm**: đo adapter API với `LLM_CLAUDE_THINKING=between_tools`
  rồi hạ lại nếu nhanh hơn.)
  Không cưỡng chế được bằng code (hai process) — ghi ở `README.md` và `BE/docs/contracts/ai-service.md`.
- **Hai tầng retry** (§3.9): BullMQ (3 lần, lỗi nhất thời) + nội bộ service (1 lần, output sai khung).
  Phân loại bằng `retryable` trong thân lỗi; `NON_RETRYABLE` ở `app/errors.py` phải khớp
  `NON_RETRYABLE_ERROR_CODES` ở Node. `INVALID_INPUT` trả **422** (code cũ trả 400).
- **NFR "15 giây"** (§3.10) hiểu là độ trễ nhận việc (bấm tạo -> UI phản hồi), không phải thời gian
  sinh truyện; thời gian sinh đo riêng bằng `scripts/try_story.py`.
- **Tám quyết định bổ sung** (§3.11): (1) fallback `DOWNGRADE` — lần 2 hỏng mà lần 1 chỉ lệch độ
  dài thì trả output lần 1 kèm warning; (2) số lời gọi tệ nhất: `PROVIDER_ERROR` / `TIMEOUT` = 6,
  `SAFETY_BLOCKED` = 2, `OUTPUT_INVALID` = 2; (3) thân lỗi có `usage` optional khi đã có lời gọi trả
  response; (4) thinking đặt tường minh, budget cộng thêm vào trần, `MAX_TOKENS` ra
  `OUTPUT_TRUNCATED` và lần thử lại nâng trần x `LLM_TRUNCATION_RETRY_FACTOR`; (5) `storage_prefix`
  được kiểm + tên file tất định theo `request_id`; (6) chặn mạng trong test chỉ chặn ngoài loopback;
  (7) `__force` cấp cao nhất, chỉ ở mock; (8) `OUTPUT_SCHEMA_INVALID` / `OUTPUT_TRUNCATED` có trong
  registry nhưng được orchestrator dựng ở bước parse.

**Lưu file ảnh / audio — Cloudinary** *(2026-10-17, người dùng chốt)*
- Thêm `CloudinaryStorage` bên cạnh Supabase / Local; chọn theo credential (đủ `CLOUDINARY_*` ->
  Cloudinary). Gọi REST bằng httpx, không SDK (cùng lý do với Supabase).
- Upload `type=authenticated` vì file là của trẻ (tên thật, chuyện thật): không có link công khai.
  `public_id` = `CLOUDINARY_FOLDER` + key, bỏ đuôi với ảnh / audio. Audio vào `resource_type=video`.
- DB dev chuyển sang Postgres local (`docker-compose.localdb.yml`), Supabase vẫn là DB dùng chung.

**Chi phí** *(backend làm)*
- Chỉ bán gói; mỗi gói cấp credit theo tháng. Mỗi loại `ai_request_type` có đơn giá credit.
- Service chỉ trả `usage`; không biết credit, không trừ tiền.

**EQ** *(backend làm, service chỉ cần biết để không lấn sân)*
- Chấm theo 5 năng lực CASEL; chỉ lần chọn đầu của lần chơi đầu; tính trên toàn bộ lịch sử.
- Service **không** nhận, không tính, không trả điểm.

## Đang mở — dừng lại hỏi nếu đụng tới

- **Cloudinary đã chạy thử với tài khoản thật (2026-10-17)**: upload / tải lại / ghi đè đúng; link Node
  ký mở được, link công khai 404, chữ ký sai 401. Link cho client: Node ký "signed delivery
  URL" (`api/src/clients/assetUrl.js`, không gọi mạng, đi qua CDN) và trả `...Url` cạnh mỗi `...Key`.
  Link **không hết hạn** (hết hạn cần token auth — gói trả phí); muốn có hạn thì đổi sang
  `private_download_url` có `expires_at` (đi qua API, không qua CDN).

- **Adapter `claude` (API) chưa chạy thật lần nào** — việc kế tiếp: đo 20 trang với
  `LLM_CLAUDE_THINKING=between_tools` để quyết có hạ timeout 150s / 320s không. (chưa có key / profile `ant auth login`). Số đo ở
  trên là của `claude_code`; API có thể khác (tắt thinking được bằng `between_tools`, tốc độ, giá).

- Chọn bộ phân loại an toàn ảnh cụ thể cho model mã nguồn mở.
- Server ComfyUI có GPU đặt ở đâu.
- Model ảnh mã nguồn mở chính cho chân dung và cho cảnh (không dùng Gemini cho ảnh; xem
  `docs/06-image-adapters.md`).
- **Spike TẠM DỪNG / MỚI XONG MỘT PHẦN theo quyết định của người dùng (2026-10-04).**
  `gemini-3.8-flash` quá tải lúc spike (2026-09-30 ~22:40-22:50), trả `503 UNAVAILABLE` "This model
  is currently experiencing high demand" (ra `PROVIDER_ERROR`, Node retry được). Tổng ~12 lời gọi
  generate, chỉ 1 thành công (sample chuẩn `story_request`):
  - Đợt đầu: 8 lời gọi trên `gemini-3.8-flash` -> 1 thành công, 7 lần 503.
  - Đợt tiếp (controller cho phép tối đa 6 lời gọi nữa, có backoff và fallback): 4 lời gọi trên
    `conflict_strong` (3 lần `gemini-3.8-flash` + 1 lần `gemini-3.7-flash`), cả 4 đều 503, nên
    `gemini-3.7-flash` cũng quá tải lúc đó.
  - Sau đó người dùng dừng spike và cấm gọi thật thêm cho đến khi có lệnh mới. 503 không bị tính phí.
  - (Số liệu đối chiếu từ `ai/out/try_story/*/summary.json`: 11 summary; thư mục `20260930-224139`
    rỗng, không có summary - coi là lời gọi thứ 8 của đợt đầu.)
  - **Đã chốt 2026-10-15: chuyển sang Claude** (mục "Chữ — Claude là provider chính"). Spike Gemini
    không làm tiếp; giữ lại làm lịch sử.
- **Chưa đo được** (spike tạm dừng): sample xung đột mạnh (`conflict_strong`, giật đồ chơi / ngã /
  khóc to / hét - chưa có kết luận an toàn) và truyện `custom` 20 trang (`custom_long`, chưa biết có
  bị cắt không). Cần thêm vài lời gọi thật trước M2 (spec §2.1).

## Đã bỏ — không đưa trở lại

| Đã bỏ | Lý do |
|---|---|
| Cây rẽ nhánh 3 chặng × 3 hệ quả | ~40% nội dung trẻ không bao giờ thấy |
| Khuôn sư phạm có chặng, loại lựa chọn, điểm riêng | Moderator quá tải; thay bằng danh sách bài học |
| Ô trống `{CON}`/`{EM}` gắn vai, `character_role` | Thay bằng danh sách tích + token `{NVx}` |
| Sprite nhân vật ghép lên nền | Thay bằng AI vẽ cả cảnh với ảnh tham chiếu |
| Nhiệm vụ đời thực | Nhóm quyết định bỏ |
| Audiobook tổng hợp | Không còn trong phạm vi |
| Kid Mode mặc định không chữ | Kid Mode hiện tranh + chữ + giọng đọc nếu bật |
| Mức đọc theo tuổi | Phụ huynh tự quyết qua cờ `use_tts` |
| Cá nhân hoá lại sau khi mua | Người mua dùng bản đăng bán nguyên trạng |
| Bước dàn ý trước khi viết | Không cần |
| AI sinh truyện theo từng lượt chơi | AI chỉ chạy lúc tạo truyện |
| Model ảnh chạy local trên máy dev | Máy không có GPU |
| AI viết lại một trang / điền một điểm dừng | Khó kiểm soát chi phí |
| Chế độ giờ ngủ (bedtime) | Nhóm quyết định bỏ |
| Thông báo trong app | Thay bằng trạng thái trên giao diện + email |
| Gói credit mua lẻ, chuyển doanh thu sang credit | Credit chỉ đến từ gói |
