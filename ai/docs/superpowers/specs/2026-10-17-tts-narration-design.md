# Giọng đọc kể truyện (TTS) — thiết kế

*2026-10-17. Trải qua hai service: `ai/` (sinh audio) và `api/` (khi nào sinh, lưu ở đâu, khi nào cho
trẻ đọc). Mốc M5 trong `docs/09-roadmap.md`.*

## 1. Mục đích

Trẻ 5–8 tuổi nghe truyện thay vì phải tự đọc: lời kể từng trang, câu hỏi ở điểm dừng, các phương án,
gợi ý khi chọn sai, phản hồi sau khi chọn. Phụ huynh soạn truyện (AI viết hoặc tự viết), sửa đến khi
ưng, bấm **hoàn tất** — lúc đó hệ thống đọc toàn bộ truyện thành audio. Truyện chỉ được đưa lên giá
sách cho trẻ khi đã có **đủ** audio: phụ huynh là người duyệt nội dung trước khi trẻ thấy, và audio là
một phần của nội dung đó.

Bối cảnh ưu tiên: phần ảnh đang tạm dừng (spike SD 1.5 trên CPU không vẽ đúng nhân vật / hành động,
xem `docs/01`), nên TTS là luồng AI tiếp theo được làm.

## 2. Mục tiêu, không làm, không được làm

**Mục tiêu**
- Service `ai/` đọc một đoạn chữ tiếng Việt thành file audio bằng VieNeu-TTS chạy CPU, upload Storage,
  trả `audio_key` + độ dài.
- Node sinh audio cho **mọi đoạn đọc được** của một truyện khi phụ huynh hoàn tất, lưu key vào đúng
  cột DB đã có, và chặn đưa truyện lên giá sách cho tới khi đủ audio.
- Sửa truyện sau khi hoàn tất chỉ sinh lại audio của **những đoạn có chữ thay đổi**.

**Không làm (lần này)**
- Audio cho bản đăng bán / truyện mua (`kind = published`) — xem 7.
- Phát audio ở frontend / Kid Mode (đã có cột lưu key; phát là việc của FE).
- Nhân bản giọng (voice cloning), chọn giọng theo từng truyện trên giao diện.
- Sinh audio song song nhiều đoạn trên cùng một máy (CPU chỉ chịu một luồng, xem 4.5).

**Không được làm (sai dù chạy được)**
- Trẻ mở được truyện khi audio còn thiếu hoặc lệch chữ (audio đọc bản cũ sau khi phụ huynh sửa).
- Audio có tên thật xuất hiện trong bản đăng bán, hoặc chữ gửi TTS bị ghi vào log.
- Sửa một chữ nhỏ mà phải chờ đọc lại cả truyện.

## 3. Ràng buộc và số đo

- Máy dev / demo: Ryzen 5 5500U (6 nhân, không VNNI), 15 GB RAM, **không GPU**.
- **Spike 2026-10-17** (VieNeu-TTS v3 Turbo, ONNX fp32, `vieneu==3.8.3`, script trong scratchpad, không
  commit): nạp model 14,8 s (đã cache); trang 51 tiếng: **8,9–17,4 s** sinh tuỳ giọng, RTF 0,66–0,90;
  câu hỏi 6 tiếng ~1,1–1,4 s. Giọng **Kim Thanh** (người dùng chọn): trang 51 tiếng sinh 17,4 s, audio
  19,5 s.
- Ước tính (chưa đo cả truyện): 8 trang + ~25 đoạn ngắn ≈ **3 phút**; 20 trang + ~45 đoạn ngắn ≈
  **7 phút**. Người dùng chấp nhận chờ, vì truyện chỉ lên giá sau khi đủ audio.
- Tài liệu chính thức khác `docs/09`: bản **0.3B GGUF đã deprecated**; bản hiện hành là **v3 Turbo**
  (ONNX trên CPU, không cần torch, 48 kHz, 25 giọng preset, Apache 2.0). Theo `CLAUDE.md` tin tài liệu
  chính thức; ghi khác biệt vào README khi làm.
- int8 nhanh hơn nhưng tài liệu cảnh báo méo tiếng trên CPU không có VNNI → **fp32**.
- Thư viện **không có** tham số tốc độ / sắc thái; phong cách đọc lấy từ giọng mẫu.
- `vieneu` công bố Python 3.10–3.13; venv dev của `ai/` là 3.14 — dry-run cài **resolve được**, chưa
  chạy thật trên 3.14. Docker dùng 3.12.
- Máy dev **không có ffmpeg**; `soundfile` (libsndfile 1.2.2, có sẵn theo `vieneu`) ghi được **MP3**:
  trang mẫu 1.830 KB WAV → 170 KB MP3.

## 4. Service `ai/` — `POST /v1/tts/synthesize`

### 4.1 Hợp đồng (giữ nguyên dạng, đổi chi tiết)

Request `{request_id, storage_prefix, text, voice_id}` như `docs/05`. Thay đổi:
- `voice_id` **rỗng** → dùng `TTS_DEFAULT_VOICE` (mặc định cấu hình: `Kim Thanh`). Không rỗng mà không
  có trong danh sách preset → `INVALID_INPUT` (không đoán giọng gần đúng).
- `text` rỗng sau chuẩn hoá → `INVALID_INPUT`.
- Key trả về: `<storage_prefix>/<request_id>-1.mp3` (thay `.wav` của mock). Node đọc định dạng từ đuôi
  key như `docs/05` đã dặn.
- `usage.units` = số giây audio (đã có trong hợp đồng); `estimated_cost_micros = 0` (tự host).

Cập nhật `docs/05-api-contract.md` và `docs/samples/tts_*` trong cùng lần sửa.

### 4.2 Provider

`app/providers/tts/vieneu.py` — `VieNeuTTSProvider`, cắm vào port `TTSProvider` có sẵn
(`synthesize(req) -> (bytes, duration_seconds)`). `TTS_PROVIDER=vieneu` chọn nó; **mock vẫn là mặc
định**, test không bao giờ nạp model thật.

- Nạp model **một lần lúc khởi động** trong `lifespan` (giống cách `llm_provider` được dựng và kiểm),
  giữ trên `app.state`. Lỗi nạp → service không khởi động, thông báo rõ.
- `infer(text, voice=...)` là hàm đồng bộ, nặng CPU → chạy trong thread (`asyncio.to_thread`), có
  timeout `TTS_TIMEOUT_SECONDS`.
- Gọi với `precision` fp32 (cấu hình được), giữ mặc định thư viện cho các tham số còn lại (kể cả
  watermark không nghe thấy).
- Mã hoá MP3 mono bằng `soundfile` (không ffmpeg). Độ dài = số mẫu / sample rate.

### 4.3 Chuẩn hoá chữ trước khi đọc

Theo `docs/05`: số → chữ tiếng Việt, bỏ ký tự lạ (emoji, ký tự điều khiển), gộp khoảng trắng, giữ dấu
câu ảnh hưởng ngữ điệu (`. , ! ? : …` và ngoặc kép lời thoại). Không đổi chính tả, không thêm bớt
chữ. Hàm thuần, có test riêng.

### 4.4 Cấu hình (env, không viết cứng)

`TTS_PROVIDER` (`mock | vieneu`), `TTS_DEFAULT_VOICE` (mặc định `Kim Thanh`), `TTS_VIENEU_PRECISION`
(mặc định `fp32`), `TTS_TIMEOUT_SECONDS`, `TTS_AUDIO_FORMAT` (mặc định `mp3`). `/health` báo
`tts_provider` + giọng mặc định.

### 4.5 Một luồng sinh tại một thời điểm

Tài liệu VieNeu: fp32 trên CPU chỉ chịu **một** luồng; hai luồng cùng lúc thì cả hai chậm hẳn. Service
giữ một khoá (`asyncio.Semaphore(1)`) quanh lời gọi model. Hệ quả cho Node ở 5.3.

### 4.6 Lỗi

Map vào bảng lỗi có sẵn: chữ / giọng sai → `INVALID_INPUT`; model lỗi khi sinh → `PROVIDER_ERROR`
(retryable); quá `TTS_TIMEOUT_SECONDS` → `TIMEOUT`. Không log `text`, chỉ log `request_id`, số ký tự,
giọng, thời gian sinh, độ dài audio.

### 4.7 Phụ thuộc

`vieneu==3.8.3` (bản đã có ≥2 tuần) trong một **extra** `.[tts]`; image Docker cài extra này khi
`TTS_PROVIDER=vieneu` được dùng ở đó. `uv lock` sau khi sửa `pyproject.toml`.

## 5. Node `api/` — khi nào đọc, lưu ở đâu, khi nào cho trẻ đọc

### 5.1 Các đoạn đọc của một truyện

Lấy từ chữ **đã thay tên thật** (`{NVx}` → tên nhân vật, như `docs/01`: tên thật chỉ thay ở backend
khi hiển thị và khi gửi TTS):

| Nguồn | Cột lưu key (đã có trong DBML rev8) |
|---|---|
| `story_pages.content_text` | `story_pages.audio_key` (+ `audio_status`) |
| `story_checkpoints.question` | `story_checkpoints.question_audio_key` |
| `story_checkpoints.hint` (nếu có) | `story_checkpoints.hint_audio_key` |
| `checkpoint_options.text` | `checkpoint_options.text_audio_key` |
| `checkpoint_options.feedback` (nếu có) | `checkpoint_options.feedback_audio_key` |

Các câu cố định dùng chung mọi truyện (đáp án cảm xúc "vui / buồn / giận / sợ / bình thường", câu nhắc
chọn lại...) sinh **một lần** vào `ui_audio_assets` bằng một script seed; nội dung chính xác của các câu
này do FE / Kid Mode quyết, script nhận danh sách.

### 5.2 Kích hoạt

Tại `reviewStory` (nút hoàn tất, đặt `reviewed_at`), nếu `use_tts = true`: tính danh sách đoạn đọc;
đoạn nào **chưa có audio cho đúng chữ hiện tại** thì tạo job đọc. Đoạn có audio khớp thì giữ nguyên.

**Giọng do Node quyết** *(quyết định của người viết spec)*: một khoá `platform_settings` (vd.
`tts.voice`, seed `Kim Thanh`), Node **luôn gửi `voice_id` tường minh**, không dựa vào giọng mặc
định của `ai/`. Lý do: vân tay phải biết giọng; nếu Node gửi rỗng thì đổi mặc định bên `ai/` sẽ tạo
truyện lẫn hai giọng mà cổng chặn không phát hiện. `TTS_DEFAULT_VOICE` của `ai/` chỉ phục vụ gọi tay
và script.

"Khớp" cần nhận ra được chữ đã đổi kể từ lần đọc trước: lưu kèm mỗi key một dấu vân tay của chữ
đã gửi đi đọc (chữ sau khi thay tên + giọng). Cách lưu (cột mới cạnh mỗi key, hay một bảng
`narration_clips` riêng) để builder chọn, ghi vào DBML (DBML là nguồn sự thật, `schema.prisma` là bản
dẫn xuất).

Sửa chữ sau khi hoàn tất: audio cũ của đoạn đó coi như **không còn hợp lệ** (vân tay lệch) → truyện
không còn đủ audio → bị chặn đọc cho tới khi phụ huynh hoàn tất lại và audio mới xong. Đổi tên nhân
vật cũng làm lệch vân tay của mọi đoạn có nhân vật đó.

### 5.3 Hàng đợi

Job `narration` (tên đã có trong `ai.jobs.js`; endpoint + timeout đã có trong `aiClient.js`). Vì
service chỉ sinh một đoạn một lúc (4.5), job đọc **không được** chạy song song nhiều cái — nếu không,
job thứ hai, thứ ba chờ khoá trong service và vượt timeout HTTP của Node. Builder chọn: queue riêng
cho narration với concurrency 1, hoặc cách khác đạt cùng kết quả. Timeout mỗi job phải lớn hơn thời gian
sinh đoạn dài nhất (trang 70 tiếng với giọng chậm nhất, ước ~25 s) cộng biên — chỉnh
`AI_TIMEOUT_MS_NARRATION` theo số đo, không để 30 s nếu không đủ.

Mỗi job có `jobId` tất định theo (đoạn, vân tay) để hoàn tất hai lần liên tiếp không sinh trùng.

**Không tính credit** *(người dùng chốt 2026-10-17)*: đọc giọng không giữ, không trừ credit — kể cả
thử lại. Hợp với quy tắc "tính theo truyện, không theo thao tác" và TTS tự host không có chi phí nhà
cung cấp. Vẫn phải có **bản ghi từng đoạn** (trạng thái, số lần thử, lỗi, thời lượng audio) để theo
dõi, hiện tiến độ và thử lại; dùng `ai_requests` (`request_type = narration`, giá 0) hay bảng riêng là
việc của builder — lưu ý `ai_requests` có `idempotency_key` unique và `attempts <= 3`, và
`createAiProcessor` hiện chỉ nhận `story_text` + luôn đi qua giữ / hoàn credit, nên processor
narration không được kéo theo phần credit.

### 5.4 Trạng thái cho phụ huynh

Chi tiết truyện trả tiến độ giọng đọc: tổng số đoạn, số đã xong, số lỗi, và truyện đã **đủ audio**
chưa. Đoạn lỗi sau khi BullMQ hết lượt thử lại: phụ huynh có thao tác **thử lại giọng đọc** (chỉ tạo job
cho các đoạn lỗi / thiếu).

### 5.5 "Sẵn sàng cho trẻ" — chỉ đến hàm kiểm, chưa gắn cổng *(người dùng chốt 2026-10-17)*

"Sẵn sàng cho trẻ" = `reviewed_at` có giá trị **và** (`use_tts = false` **hoặc** mọi đoạn đọc có audio
khớp chữ hiện tại). Dự án này cung cấp **một hàm kiểm dùng chung** trong module `stories` (trả về
sẵn sàng hay chưa + tiến độ + lý do) và đưa kết quả vào chi tiết truyện (5.4). Có test đầy đủ.

**Không thuộc dự án này:** gắn hàm đó làm cổng chặn ở `bookshelf.service.addToBookshelf`,
`reading-sessions` (lúc bắt đầu lượt đọc) và các đường sao chép ở `orders`. Ba module này đang viết
theo schema cũ (dùng `isReplay`, `pageKind`, `stageId`, `storyChoice`, `templateId` — không còn trong
`schema.prisma`, kiểm 2026-10-17), nên phải sửa theo rev8 trước; việc đó là một việc riêng. Khi gắn:
chưa sẵn sàng → 422 tiếng Việt kèm tiến độ; `addToBookshelf` hiện cũng chưa kiểm `reviewed_at`.

## 6. Kiểm thử

- `ai/`: chuẩn hoá chữ (bảng ví dụ số, ký tự lạ); provider với một model giả tiêm vào (không nạp
  model thật, không mạng); hợp đồng endpoint (giọng rỗng → mặc định, giọng lạ → `INVALID_INPUT`, key
  `.mp3`); không log chữ. Script thử thật `scripts/try_tts.py` (ngoài pytest) đo thời gian cả một truyện
  mẫu, giống `try_story.py`.
- `api/`: tính danh sách đoạn đọc + vân tay theo từng kiểu điểm dừng; hoàn tất chỉ tạo job cho đoạn
  thiếu / lệch; sửa chữ làm truyện mất trạng thái sẵn sàng; hàm kiểm "sẵn sàng cho trẻ" (5.5);
  processor narration ghi đúng cột và không đụng credit.

## 7. Bản đăng bán và truyện mua

Audio của truyện `private` **chứa tên thật** → bản `published` (đã gỡ cá nhân hoá) và bản người mua
nhận **không bao giờ** dùng lại key audio của bản gốc. Sinh audio cho bản đăng bán (đọc bằng tên gì
khi đã gỡ tên thật) là việc của lần sau. *(Quyết định của người viết spec)* Trong lúc chưa có: bản
`published` và bản người mua **đọc không có audio** — cổng chặn ở 5.5 chỉ áp cho `private`; mọi
đường sao chép truyện (đăng bán, mua) phải **để trống** mọi cột `*_audio_key` của bản sao, và trả
`use_tts = false` cho bản sao để FE không tìm audio.

## 8. Việc kế tiếp, ngoài dự án này

- Sửa `bookshelf`, `reading-sessions`, `orders` theo rev8, rồi gắn hàm kiểm 5.5 làm cổng chặn (422).
- Audio cho bản đăng bán / truyện mua (đọc bằng tên gì khi đã gỡ tên thật) — 7.
- Nội dung các câu cố định trong `ui_audio_assets` do FE / Kid Mode chốt; script seed chỉ nhận danh
  sách.

## 9. Quyết định của người viết spec (người dùng chưa duyệt riêng)

- **MP3** mono qua `soundfile`, không AAC / ffmpeg (máy không có ffmpeg; MP3 nhỏ ~10 lần WAV).
- **v3 Turbo fp32**, không GGUF 0.3B (deprecated) và không int8 (CPU không VNNI).
- **Một đoạn sinh tại một thời điểm**: khoá trong `ai/` + narration không chạy song song ở Node.
- **Giọng do Node quyết** qua `platform_settings`, luôn gửi tường minh (5.2).
- `voice_id` rỗng → giọng mặc định của `ai/`; giọng lạ → `INVALID_INPUT` (4.1).
- Bản `published` / bản mua đọc không audio cho tới khi có thiết kế riêng; sao chép để trống cột audio
  và `use_tts = false` (7).
- `vieneu` trong extra `.[tts]`, mock vẫn là mặc định (4.2, 4.7).
