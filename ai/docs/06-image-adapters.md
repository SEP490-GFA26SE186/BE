# 06 — Sinh ảnh

## Model

Họ Nano Banana của Gemini, gọi qua cùng SDK với phần chữ.

| Dùng cho | Model | Lý do |
|---|---|---|
| Chân dung nhân vật | `gemini-3.1-flash-image` (Nano Banana 2) | Sinh một lần, dùng lại mãi — chất lượng quan trọng hơn giá; mạnh về xử lý nhiều ảnh tham chiếu và giữ nhân vật nhất quán |
| Tranh cảnh truyện | `gemini-3.1-flash-image` | Cần giữ nhân vật khớp chân dung qua 4 ảnh |
| Dev / test tích hợp | `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) | Nhanh và rẻ nhất; chỉ ra ảnh 1K; vẫn giữ nhân vật khá tốt — đủ để kiểm tra luồng và prompt |

- **Không dùng `gemini-2.5-flash-image`** — là model đời cũ, Google khuyến nghị chuyển đi.
- Chân dung và cảnh chọn profile riêng (`IMAGE_PROFILE_PORTRAIT`, `IMAGE_PROFILE_SCENE`, mục
  docs 06) để đổi độc lập — kể cả dùng Gemini cho chân dung và model mã nguồn mở cho cảnh.
- Tên model có thể mang hậu tố `-preview` tuỳ thời điểm. Khi khởi động với provider `gemini`,
  gọi API liệt kê model và **báo lỗi rõ ràng** nếu model cấu hình không tồn tại, thay vì để
  request đầu tiên mới lỗi.
- Mọi ảnh do các model này sinh ra đều có watermark SynthID. Không cần xử lý gì, nhưng ghi vào
  README.

## Quy tắc chung

- Chỉ chạy khi backend gọi (theo cờ `use_ai_image`).
- Phong cách vẽ cố định từ `prompts/image_style.v1.md`; request không được đổi.
- Không nhận ảnh upload. Ảnh tham chiếu duy nhất là chân dung do chính hệ thống sinh.
- Prompt ảnh yêu cầu **không có chữ** trong ảnh.

## Kiến trúc adapter

Mục tiêu: **thử được nhiều model sinh ảnh** — Gemini và các model mã nguồn mở — trên cùng một
luồng, đổi model bằng cấu hình, không sửa code nghiệp vụ.

### Ba lớp tách biệt

```
core (image_prompts, endpoint)            ← chỉ biết ImageRequest / ImageResult chuẩn hoá
        │
        ▼
ImageGenerator  (port / interface)        ← generate(), capabilities()
        │
        ├─ decorators bọc ngoài bất kỳ adapter nào:
        │     ReplayDecorator · BudgetGuard · SafetyCheck · UsageTimer
        ▼
Adapters theo RUNTIME, không theo model:
   MockAdapter · GeminiAdapter · ComfyUIAdapter · HFInferenceAdapter · DiffusersLocalAdapter
        │
        ▼
Model profiles (image_models.yaml)        ← model nào chạy trên adapter nào, với tham số gì
```

Adapter đại diện cho **nơi chạy** (một API, một server ComfyUI, một thư viện). Model là **dữ
liệu cấu hình**. Nhờ vậy thêm một model mã nguồn mở mới thường chỉ là thêm một mục YAML (và
một workflow JSON nếu chạy qua ComfyUI), không phải viết adapter mới.

### Hợp đồng chuẩn hoá

```python
class ImageRequest(BaseModel):
    purpose: Literal["portrait", "scene"]
    scene: str                      # mô tả cảnh, tiếng Anh, không tên riêng
    characters: list[CharacterRef]  # mô tả ngoại hình + ảnh tham chiếu (bytes) nếu có
    style: str                      # lấy từ image_style.v1.md, request không được đổi
    negative: str | None
    aspect_ratio: str               # "1:1" | "4:3" | "3:4" ...
    num_images: int = 1
    seed: int | None = None

class ImageCapabilities(BaseModel):
    supports_reference_images: bool
    max_reference_images: int
    supports_negative_prompt: bool
    supports_seed: bool
    aspect_ratios: list[str]
    max_images_per_call: int
    has_builtin_safety_filter: bool
    commercial_use: bool            # giấy phép cho phép dùng thương mại

class ImageResult(BaseModel):
    images: list[bytes]             # đã chuẩn hoá WebP
    reference_used: bool            # model có thật sự dùng ảnh tham chiếu không
    usage: Usage
```

### Adapter tự thích ứng theo khả năng của model

Adapter đọc `capabilities` của profile rồi quyết định:

- Model **không hỗ trợ ảnh tham chiếu** → bỏ ảnh, dồn mô tả ngoại hình nhân vật vào prompt,
  trả `reference_used = false`. Không được im lặng — trường này phải phản ánh đúng.
- Model không hỗ trợ negative prompt → gộp vào prompt chính dạng "không có …".
- `num_images` vượt `max_images_per_call` → gọi nhiều lần.
- Aspect ratio không có trong danh sách → chọn tỉ lệ gần nhất, ghi vào log.

Mỗi profile có **prompt dialect** riêng (câu mô tả tự nhiên cho Gemini/FLUX/Qwen, dạng từ
khoá cho SDXL). `image_prompts.py` dựng prompt theo dialect của profile đang dùng.

### Model profiles — `app/image_models.yaml`

```yaml
gemini-flash-image:
  adapter: gemini
  remote_model: gemini-3.1-flash-image
  dialect: natural
  capabilities: { supports_reference_images: true, max_reference_images: 3,
                  has_builtin_safety_filter: true, commercial_use: true, ... }

gemini-flash-lite-image:
  adapter: gemini
  remote_model: gemini-3.1-flash-lite-image
  ...

flux2-klein-4b:
  adapter: comfyui                  # hoặc hf_inference, tuỳ runtime có sẵn
  workflow: workflows/flux2_klein_4b_ref.json
  dialect: natural
  license: apache-2.0
  capabilities: { supports_reference_images: true, has_builtin_safety_filter: false,
                  commercial_use: true, ... }

z-image-turbo:
  adapter: comfyui
  workflow: workflows/z_image_turbo.json
  license: apache-2.0
  capabilities: { supports_reference_images: false, ... }

qwen-image-edit:
  adapter: comfyui
  license: apache-2.0
  ...

sdxl-ipadapter:
  adapter: comfyui
  workflow: workflows/sdxl_ipadapter.json   # ảnh tham chiếu qua IP-Adapter
  dialect: tags
  license: openrail++
  ...
```

Khả năng và giấy phép trong ví dụ là **để minh hoạ cấu trúc** — khi thêm từng model, đọc model
card chính thức để điền cho đúng, không dựa vào file này.

Chọn model bằng biến môi trường trỏ tới **tên profile**:
`IMAGE_PROFILE_PORTRAIT=gemini-flash-image`, `IMAGE_PROFILE_SCENE=flux2-klein-4b`.

### Adapters

| Adapter | Chạy ở đâu | Ghi chú |
|---|---|---|
| `mock` | trong process | Mặc định; PNG có vẽ chữ mô tả cảnh |
| `gemini` | Gemini API | Model trong phần Model ở trên |
| `comfyui` | Server ComfyUI qua HTTP (`COMFYUI_URL`) | Cách chính để chạy model mã nguồn mở. Mỗi model một workflow JSON có placeholder cho prompt, seed, ảnh tham chiếu; adapter upload ảnh, gửi workflow, poll kết quả |
| `hf_inference` | Hugging Face Inference API | Cho model có sẵn endpoint; kiểm tra hạn mức tài khoản trước |
| `diffusers_local` | `diffusers` trong process | **Chỉ bật khi máy có GPU.** Máy dev hiện tại không có — viết adapter nhưng không bắt buộc chạy được |

Máy dev không có GPU, nên model mã nguồn mở phải chạy trên một **server ComfyUI ở nơi khác**
(máy có GPU của thành viên nhóm, hoặc GPU thuê theo giờ). Adapter chỉ cần `COMFYUI_URL`. Việc
dựng server đó **nằm ngoài repo này**; ghi hướng dẫn ngắn trong README.

### Decorators

- **`ReplayDecorator`** — ghi/phát lại như `docs/08-testing.md`, bọc được mọi adapter.
- **`BudgetGuard`** — trần số lời gọi mỗi tiến trình (`IMAGE_DEV_MAX_CALLS`) cho script thử.
- **`SafetyCheck`** — xem dưới.
- **`UsageTimer`** — đo latency, điền `usage`, ước tính chi phí từ `cost_per_image` trong profile.

### An toàn ảnh với model mã nguồn mở — bắt buộc

Gemini có bộ lọc an toàn sẵn; **model mã nguồn mở thì không.** Khi profile có
`has_builtin_safety_filter: false`, `SafetyCheck` phải chạy trên **mọi ảnh sinh ra** trước khi
trả về:

- Định nghĩa port `ImageSafetyChecker.check(image) -> SafetyVerdict`.
- Cài đặt đầu tiên dùng một bộ phân loại ảnh mã nguồn mở có giấy phép cho phép dùng thương mại
  — **dừng lại hỏi trước khi chọn model phân loại cụ thể**.
- Ảnh bị gắn cờ → không trả về, lỗi `SAFETY_BLOCKED`.
- Không có checker nào khả dụng → **từ chối chạy** profile đó, không âm thầm bỏ qua.

### Chặn giấy phép phi thương mại

Profile có `commercial_use: false` (ví dụ các bản FLUX dev hoặc FLUX.2 Klein 9B) chỉ được chạy
khi `ALLOW_NONCOMMERCIAL_MODELS=true`, và **chỉ trong script so sánh**, không bao giờ qua
endpoint. Lý do: sản phẩm có thu phí.

### Công cụ so sánh model — `scripts/compare_images.py`

Mục đích chính của lớp adapter. Chạy **cùng một fixture** (chân dung + 4 cảnh) qua nhiều
profile, xuất `out/compare/<timestamp>/index.html`: mỗi hàng một profile, các cột là chân dung
và 4 cảnh, kèm latency, chi phí ước tính, `reference_used`, giấy phép. Bắt buộc `--confirm`,
tôn trọng `IMAGE_DEV_MAX_CALLS`. Có ô để nhóm chấm tay theo checklist ở `docs/08-testing.md`, lưu kết quả
chấm vào `scores.json` để đưa vào báo cáo so sánh trong tài liệu đồ án.
