# 09 — Lộ trình

Làm theo thứ tự. Xong mỗi mốc: `pytest` xanh, tóm tắt, dừng chờ duyệt.

**M1 — Khung service.** FastAPI, config, auth token, dạng lỗi thống nhất, `/health`, schema cho
mọi endpoint (theo docs 05), ba mock provider. Mọi endpoint chạy được với mock.

**M2 — Tiện ích tất định.** `text_utils`, `guards`, `validator` đủ bảng docs 04. Test biên theo
docs 08.

**M3 — Sinh truyện thật.** `prompts/story.v1.md` theo docs 07, `GeminiLLMProvider` với JSON có
schema, trần token đầu ra, vòng thử lại. `scripts/try_story.py`.

**M4a — Lớp ảnh và Gemini.** Port, registry, `MockAdapter`, `GeminiAdapter`, bốn decorator, chuẩn
hoá WebP, chân dung 2 phương án, ảnh cảnh có tham chiếu. Tầng mock + ghi/phát lại +
`try_images.py`.

**M4b — Model mã nguồn mở.** `ComfyUIAdapter`, `HFInferenceAdapter`, khung
`DiffusersLocalAdapter`, port `ImageSafetyChecker` (dừng hỏi trước khi chọn checker),
workflow cho 2–3 model, `compare_images.py`.

**M5 — Giọng đọc.** `VieNeuTTSProvider` theo README chính thức, chuẩn hoá chữ tiếng Việt, AAC
mono. Nạp model một lần lúc khởi động.

**M6 — Hoàn thiện.** Log có cấu trúc (không log chữ TTS, ảnh), timeout cho mọi lời gọi ngoài,
Dockerfile, README chạy local.

## Biến môi trường

```
INTERNAL_TOKEN=
LLM_PROVIDER=mock            # mock | gemini
TTS_PROVIDER=mock            # mock | vieneu
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=
IMAGE_PROFILE_PORTRAIT=gemini-flash-image   # tên profile trong image_models.yaml
IMAGE_PROFILE_SCENE=gemini-flash-image
# .env.dev: dùng gemini-flash-lite-image hoặc profile mã nguồn mở khi thử
IMAGE_DEV_MAX_CALLS=10       # trần số ảnh mỗi lần chạy script thử thật
COMFYUI_URL=                 # server ComfyUI có GPU, nằm ngoài repo
HF_API_TOKEN=
ALLOW_NONCOMMERCIAL_MODELS=false
LLM_TIMEOUT_SECONDS=60
IMAGE_TIMEOUT_SECONDS=90
TOKENS_PER_WORD=2.0
IMAGE_OUTPUT_WIDTH=1024
VIENEU_MODEL_PATH=
TTS_BITRATE=48k
PRICE_TEXT_INPUT_PER_MTOK_MICROS=0
PRICE_TEXT_OUTPUT_PER_MTOK_MICROS=0
PRICE_IMAGE_PER_UNIT_MICROS=0
LOG_LEVEL=INFO
```

Bảng giá để ước tính `estimated_cost_micros` nằm trong env, không viết cứng — giá nhà cung
cấp thay đổi.
