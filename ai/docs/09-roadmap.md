# 09 — Lộ trình

Làm theo thứ tự. Xong mỗi mốc: `pytest` xanh, tóm tắt, dừng chờ duyệt.

**M1 — Khung service.** FastAPI, config, auth token, dạng lỗi thống nhất, `/health`, schema cho
mọi endpoint (theo docs 05), ba mock provider. Mọi endpoint chạy được với mock.

**M2 — Tiện ích tất định.** `text_utils`, `guards`, `validator` đủ bảng docs 04. Test biên theo
docs 08.

**M3 — Sinh truyện thật.** `prompts/story.v1.md` theo docs 07, `GeminiLLMProvider` với JSON có
schema, trần token đầu ra (cộng budget thinking), vòng thử lại. `scripts/try_story.py`.
*Spike Gemini (docs 01) tạm dừng, mới xong một phần; còn thiếu số đo cho sample xung đột mạnh và
truyện `custom` 20 trang.*

> **2026-10-17: M4a / M4b BỎ QUA** theo quyết định người dùng (spike SD 1.5 trên CPU thất bại, không có
> GPU). Endpoint ảnh mock giữ nguyên; không làm tiếp phần dưới.

**M4a — Lớp ảnh.** Port, registry, `MockAdapter`, bốn decorator, chuẩn hoá WebP, chân dung 2 phương án, ảnh cảnh có tham chiếu. Tầng mock + ghi/phát lại +
`try_images.py`.

**M4b — Model mã nguồn mở.** `ComfyUIAdapter`, `HFInferenceAdapter`, khung
`DiffusersLocalAdapter`, port `ImageSafetyChecker` (dừng hỏi trước khi chọn checker),
workflow cho 2–3 model, `compare_images.py`.

**M5 — Giọng đọc.** `VieNeuTTSProvider` theo README chính thức, chuẩn hoá chữ tiếng Việt, AAC
mono. Nạp model một lần lúc khởi động.

**M6 — Hoàn thiện.** Log có cấu trúc (không log chữ TTS, ảnh), timeout cho mọi lời gọi ngoài,
Dockerfile, README chạy local.

## Biến môi trường

Danh sách dưới đây là bản **M1–M3** (khớp `app/config.py` và `.env.example`). Biến của M4b / M5
(ghi ở phần cuối) chỉ khai khi có code đọc chúng.

```
INTERNAL_TOKEN=
LLM_PROVIDER=mock                  # mock | gemini | claude | claude_code (claude*: README "Claude")
TTS_PROVIDER=mock                  # mock (vieneu: M5)
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=                 # bắt buộc khi LLM_PROVIDER=gemini; kiểm lúc khởi động
ANTHROPIC_API_KEY=                 # claude: tuỳ chọn, trống = SDK tự tìm (env, profile `ant auth login`)
LLM_CLAUDE_MODEL=                  # bắt buộc khi LLM_PROVIDER=claude | claude_code
LLM_CLAUDE_THINKING=               # trống = không gửi; disabled | adaptive | between_tools (chỉ API)
LLM_CLAUDE_EFFORT=                 # trống = không gửi; low | medium | high | xhigh | max
LLM_CLAUDE_CLI_PATH=               # claude_code: trống = `claude` trong PATH
LLM_TIMEOUT_SECONDS=150            # 2 x 150 + overhead < AI_TIMEOUT_MS_STORY_TEXT của Node (docs 01, README)
LLM_TEMPERATURE=                   # trống = mặc định SDK / model
LLM_RETRY_TEMPERATURE=             # trống = không gửi (mặc định, xem docs 01)
LLM_THINKING_BUDGET=0              # 0 = tắt thinking; > 0 = budget cố định CỘNG THÊM vào trần token
LLM_TRUNCATION_RETRY_FACTOR=1.5    # lần thử lại sau OUTPUT_TRUNCATED nhân trần chữ với hệ số này
TOKENS_PER_WORD=2.8
SCENE_DESCRIPTION_MAX_WORDS=30     # hằng của service, không phải trường limits backend gửi
IMAGE_PROFILE_PORTRAIT=mock        # chỉ để /health báo; profile thật chọn ở M4b
IMAGE_PROFILE_SCENE=mock
CLOUDINARY_CLOUD_NAME=             # trống -> LocalStorage
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PRICE_TEXT_INPUT_PER_MTOK_MICROS=0
PRICE_TEXT_OUTPUT_PER_MTOK_MICROS=0
LOG_LEVEL=INFO
```

Không có `DATABASE_URL`, không có `REDIS_URL` (bất biến: service stateless). Đã xoá `AI_PROVIDER`
(tách thành `LLM_PROVIDER` / `TTS_PROVIDER`) và `PROVIDER_TIMEOUT_SECONDS`.

Biến sẽ thêm ở mốc sau (chưa khai):

```
# M4b — ảnh
COMFYUI_URL=                 # server ComfyUI có GPU, nằm ngoài repo
HF_API_TOKEN=
ALLOW_NONCOMMERCIAL_MODELS=false
IMAGE_DEV_MAX_CALLS=10       # trần số ảnh mỗi lần chạy script thử thật
IMAGE_TIMEOUT_SECONDS=90
IMAGE_OUTPUT_WIDTH=1024
PRICE_IMAGE_PER_UNIT_MICROS=0
# M5 — giọng đọc
VIENEU_MODEL_PATH=
TTS_BITRATE=48k
```

Bảng giá để ước tính `estimated_cost_micros` nằm trong env, không viết cứng — giá nhà cung
cấp thay đổi.
