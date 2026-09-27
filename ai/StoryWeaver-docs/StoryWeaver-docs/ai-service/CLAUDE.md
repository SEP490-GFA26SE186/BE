# CLAUDE.md — StoryWeaver AI · AI Core Service

Service Python **stateless** sinh nội dung truyện tương tác cho trẻ 5–8 tuổi: chữ (Gemini),
tranh (adapter nhiều model), giọng đọc tiếng Việt (VieNeu-TTS). Backend Node.js gọi service
này qua HTTP nội bộ.

Nguyên tắc xuyên suốt: **AI đề xuất — con người quyết định — hệ thống cưỡng chế.**

Nội dung truyện viết **tiếng Việt**. Code, tên biến, comment, log viết **tiếng Anh**.

## Ngữ cảnh luôn nạp

@docs/00-product-overview.md
@docs/01-decisions.md
@docs/02-glossary.md

## Tài liệu theo mảng — đọc khi làm tới phần đó

| Khi làm | Đọc |
|---|---|
| Cấu trúc truyện, điểm dừng, giới hạn độ dài | `docs/03-story-structure.md` |
| Luồng sinh chữ, che tên, validator, thử lại | `docs/04-ai-pipeline.md` |
| Endpoint, schema request/response, mã lỗi | `docs/05-api-contract.md` |
| Sinh ảnh, adapter, model profile, an toàn ảnh | `docs/06-image-adapters.md` |
| Viết prompt, viết test nội dung | `docs/07-content-principles.md` |
| Viết test, script thử thật, checklist chấm | `docs/08-testing.md` |
| Kế hoạch từng mốc | `docs/09-roadmap.md` |
| Ví dụ request/response thật | `docs/samples/` |

## Phạm vi

**Làm:** sinh cả truyện (chữ + điểm dừng) từ khung backend gửi — một lời gọi cho cả truyện;
validator tất định; sinh chân dung nhân vật và tranh cảnh; sinh giọng đọc; trả về
usage (token, số ảnh, số giây audio, chi phí ước tính).

**Không làm:** database; hạn mức, credit, thanh toán; hàng đợi tác vụ; upload lên storage (ảnh
và audio trả về base64); che tên thật (backend che, service chỉ kiểm tra lại); chấm điểm EQ.

## Stack

- Python 3.11+, FastAPI, Pydantic v2, pydantic-settings, httpx
- Gemini qua SDK `google-genai` — **đọc tài liệu SDK hiện hành** trước khi viết, không dựa vào
  trí nhớ về tên hàm
- VieNeu-TTS 0.3B GGUF (Apache-2.0), chạy CPU — **đọc README repo VieNeu-TTS** để lấy API thật
- ffmpeg (WAV → AAC mono), Pillow (chuẩn hoá WebP)
- pytest, pytest-asyncio, respx

Máy dev: laptop CPU 16GB RAM, **không GPU**. Không cài model ảnh chạy local trên máy này.

## Cấu trúc thư mục

```
app/
  main.py  config.py  errors.py
  schemas/                  # request/response theo endpoint
  prompts/                  # story.v1.md, image_style.v1.md
  providers/
    llm/     base.py  mock.py  gemini.py
    image/   port.py  registry.py  adapters/  decorators/  safety/
    tts/     base.py  mock.py  vieneu.py
  core/
    story.py
    validator.py  guards.py  text_utils.py
    image_prompts.py  audio.py  usage.py
  image_models.yaml
  workflows/                # workflow JSON cho ComfyUI
scripts/
  try_story.py  try_images.py  compare_images.py
tests/
  fixtures/  cassettes/images/
docs/
```

## Lệnh

```bash
uv sync                          # hoặc: pip install -e ".[dev]"
uvicorn app.main:app --reload    # chạy dev, mặc định mọi provider là mock
pytest                           # phải xanh trước khi chuyển mốc
python scripts/try_story.py --confirm      # gọi Gemini thật, KHÔNG chạy trong pytest
```

## Quy tắc bắt buộc

- **Mock là mặc định** cho chữ, ảnh, giọng đọc. Test **không bao giờ** gọi mạng.
- **Không tự thay đổi cấu trúc truyện.** `page_id`, `checkpoint_id` vào thế nào ra thế ấy.
  Không thêm/bớt trang, không đổi vị trí hay kiểu điểm dừng.
- **Gemini không bao giờ thấy tên thật.** Chạy `assert_no_forbidden_terms` trước mọi lời gọi ra
  ngoài và trên mọi output (xem `docs/04-ai-pipeline.md`).
- **AI chỉ đề xuất đáp án đúng**; vai của từng phương án giải quyết tình huống do **khung** quy
  định, AI không được đổi.
- **Không viết cứng** tên model, giá, phong cách vẽ, giới hạn độ dài — lấy từ cấu hình hoặc từ
  request.
- **Không log** tên thật, chữ gửi vào TTS, dữ liệu ảnh, API key.
- **Không để ảnh từ model không có bộ lọc an toàn sẵn đi ra ngoài** mà chưa qua `SafetyCheck`.
- **Không thêm database, hàng đợi hay logic tiền** vào service này.
- Tài liệu chính thức (Gemini SDK, VieNeu-TTS, ComfyUI) khác với docs → **tin tài liệu chính
  thức**, ghi chú khác biệt vào README.
- Gặp quyết định chưa có trong `docs/01-decisions.md` → **dừng lại hỏi**, không tự chọn.

## Cách làm việc

- Làm theo mốc trong `docs/09-roadmap.md`, từng mốc một.
- Xong mốc: chạy `pytest`, tóm tắt đã làm gì, còn gì mở, rồi **dừng chờ duyệt**.
- Khi thay đổi hợp đồng API, cập nhật `docs/05-api-contract.md` và `docs/samples/` trong cùng
  lần sửa.
