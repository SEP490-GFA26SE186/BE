# 06 — Sinh ảnh

## Model

**Sinh ảnh không dùng Gemini.** Gemini chỉ dùng cho chữ (`docs/01-decisions.md`). Hướng là **model
mã nguồn mở, miễn phí**, chạy qua ComfyUI hoặc HF Inference (adapter bên dưới).

**Model cụ thể để ngỏ tới spec M4** — chưa chọn model chính cho chân dung và cho cảnh. Ứng viên
(ví dụ `flux2-klein-4b`, `z-image-turbo`, `qwen-image-edit`, `sdxl-ipadapter` trong ví dụ profile
bên dưới) chỉ là để minh hoạ cấu trúc; chọn bằng `scripts/compare_images.py` + checklist chấm tay
(`docs/08-testing.md`), đọc giấy phép và model card chính thức của từng model.

- Chân dung và cảnh chọn profile riêng (`IMAGE_PROFILE_PORTRAIT`, `IMAGE_PROFILE_SCENE`, mục
  docs 06) để đổi độc lập — chân dung và cảnh có thể dùng hai model khác nhau.
- Ảnh sinh ra có thể cần ghi nguồn gốc / watermark tuỳ giấy phép từng model — kiểm khi chọn.

## Quy tắc chung

- Chỉ chạy khi backend gọi (theo cờ `use_ai_image`).
- Phong cách vẽ cố định từ `prompts/image_style.v1.md`; request không được đổi.
- Không nhận ảnh upload. Ảnh tham chiếu duy nhất là chân dung do chính hệ thống sinh.
- Prompt ảnh yêu cầu **không có chữ** trong ảnh.

## Kiến trúc adapter

Mục tiêu: **thử được nhiều model sinh ảnh** — các model mã nguồn mở — trên cùng một
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
   MockAdapter · ComfyUIAdapter · HFInferenceAdapter · DiffusersLocalAdapter
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

Mỗi profile có **prompt dialect** riêng (câu mô tả tự nhiên cho FLUX/Qwen, dạng từ
khoá cho SDXL). `image_prompts.py` dựng prompt theo dialect của profile đang dùng.

### Model profiles — `app/image_models.yaml`

```yaml
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
`IMAGE_PROFILE_PORTRAIT=flux2-klein-4b`, `IMAGE_PROFILE_SCENE=z-image-turbo` (ví dụ minh hoạ,
chưa phải lựa chọn). Hiện tại (M1–M3) cả hai là `mock`.

### Adapters

| Adapter | Chạy ở đâu | Ghi chú |
|---|---|---|
| `mock` | trong process | Mặc định; PNG đơn sắc đúng kích thước, đi qua đường upload Storage thật |
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

Nhiều API thương mại có bộ lọc an toàn sẵn; **model mã nguồn mở thì không.** Khi profile có
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
