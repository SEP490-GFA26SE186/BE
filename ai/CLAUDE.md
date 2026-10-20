# CLAUDE.md — StoryWeaver AI · AI Core Service

Service Python **stateless** sinh nội dung truyện tương tác cho trẻ 5–8 tuổi: chữ (Claude; Gemini còn trong code),
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
validator tất định; sinh chân dung nhân vật và tranh cảnh; sinh giọng đọc; **upload ảnh và audio
lên Storage rồi trả key** (không trả bytes); trả về usage (token, số ảnh, số giây audio, chi phí
ước tính).

**Không làm:** database; hạn mức, credit, thanh toán; hàng đợi tác vụ; che tên thật (backend che,
service chỉ kiểm tra lại); chấm điểm EQ.

## Stack

- Python 3.12+, FastAPI, Pydantic v2, pydantic-settings, httpx
- Chữ: Claude qua `claude-agent-sdk` (`claude_code`, gói Pro/Max — dev và Docker, từ 2026-10-19) và
  `anthropic` (`claude`, API key) — README "Claude". Gemini (`google-genai`) giữ lại làm lựa chọn cấu hình.
  Với mọi SDK: **đọc tài liệu / source SDK hiện hành** trước khi viết, không dựa vào
  trí nhớ về tên hàm
- VieNeu-TTS 0.3B GGUF (Apache-2.0), chạy CPU — **đọc README repo VieNeu-TTS** để lấy API thật
- ffmpeg (WAV → AAC mono), Pillow (chuẩn hoá WebP)
- pytest, pytest-asyncio, respx

Máy dev: laptop CPU 16GB RAM, **không GPU**. Không cài model ảnh chạy local trên máy này.

## Cấu trúc thư mục

```
app/
  main.py  config.py  errors.py  deps.py
  api/        health.py  v1/{story,images,tts}.py
  schemas/    common.py  story.py  llm.py  images.py  tts.py   # request/response theo endpoint
  prompts/    story.v1.md              # image_style.v1.md: M4
  providers/
    llm/      base.py  mock.py  gemini.py  claude.py  claude_code.py   # claude*: README "Claude"
    image/    base.py  mock.py         # M4: port.py registry.py adapters/ decorators/ safety/
    tts/      base.py  mock.py         # M5: vieneu.py
  storage/    __init__.py  local.py  supabase.py  cloudinary.py
  core/
    story.py  prompt.py  mapping.py  usage.py
    text_utils.py  guards.py
    validator/  __init__.py  rules.py  context.py  issues.py  content_rules.py
    # M4/M5: image_prompts.py  audio.py
  content_rules.yaml
  # M4: image_models.yaml  workflows/ (workflow JSON cho ComfyUI)
scripts/
  try_story.py  try_story_samples/     # M4: try_images.py  compare_images.py
tests/
  conftest.py  fixtures/  unit/  api/  providers/
docs/
```

## Lệnh

Chạy từ `BE/ai`, bằng `.venv/Scripts/python -m …` (không dùng launcher `.exe` trong venv: venv đã
bị chuyển chỗ, launcher trỏ sai đường dẫn).

```bash
.venv/Scripts/python -m pip install -e ".[dev]"            # cài (tổng quát: `uv sync` nếu có uv)
.venv/Scripts/python -m uvicorn app.main:app --reload      # chạy dev, mặc định mọi provider là mock
.venv/Scripts/python -m pytest                             # phải xanh trước khi chuyển mốc
.venv/Scripts/python scripts/try_story.py --confirm        # gọi Gemini thật, KHÔNG chạy trong pytest
.venv/Scripts/python scripts/try_story.py --mode pipeline --provider claude_code --model sonnet \
    --thinking-budget 12000 --timeout 300 --confirm        # Claude qua CLI dev; cần LLM_CLAUDE_CLI_PATH, LLM_CLAUDE_EFFORT=low
```

## Quy tắc bắt buộc

- **Mock là mặc định** cho chữ, ảnh, giọng đọc. Test **không bao giờ** gọi mạng.
- **Không tự thay đổi cấu trúc truyện.** `page_id`, `checkpoint_id` vào thế nào ra thế ấy.
  Không thêm/bớt trang, không đổi vị trí hay kiểu điểm dừng.
- **Provider chữ (Claude, Gemini) không bao giờ thấy tên thật.** Chạy `assert_no_forbidden_terms` trước mọi lời gọi ra
  ngoài, chỉ trên các trường phụ huynh nhập (`situation`, `characters[].description`; ảnh: các
  mô tả). **Không** kiểm output (xem `docs/04-ai-pipeline.md`, spec §3.1).
- **AI chỉ đề xuất đáp án đúng**; vai của từng phương án giải quyết tình huống do **khung** quy
  định, AI không được đổi.
- **Không viết cứng** tên model, giá, phong cách vẽ, giới hạn độ dài — lấy từ cấu hình hoặc từ
  request.
- **Không log** tên thật, chữ gửi vào TTS, dữ liệu ảnh, API key.
- **Không để ảnh từ model không có bộ lọc an toàn sẵn đi ra ngoài** mà chưa qua `SafetyCheck` — ngoại lệ duy
  nhất: `IMAGE_SAFETY=human_review` do người dùng chốt 2026-10-19 (`docs/01`), phải đặt tường minh.
- **Không thêm database, hàng đợi hay logic tiền** vào service này.
- Tài liệu chính thức (Anthropic / Gemini SDK, VieNeu-TTS, ComfyUI) khác với docs → **tin tài liệu chính
  thức**, ghi chú khác biệt vào README.
- Gặp quyết định chưa có trong `docs/01-decisions.md` → **dừng lại hỏi**, không tự chọn.

## Cách làm việc

- Làm theo mốc trong `docs/09-roadmap.md`, từng mốc một.
- Xong mốc: chạy `pytest`, tóm tắt đã làm gì, còn gì mở, rồi **dừng chờ duyệt**.
- Khi thay đổi hợp đồng API, cập nhật `docs/05-api-contract.md` và `docs/samples/` trong cùng
  lần sửa.
