# ai/

Service sinh nội dung AI của StoryWeaver (chữ, chân dung, tranh cảnh, giọng đọc). **Stateless**: không
DB, không Redis, không biết gì về user hay credit.

Nó chỉ làm: nhận request -> gọi provider -> (nếu là ảnh / audio) upload lên Storage -> trả **key**
(không trả bytes) cùng số liệu `usage`. Chữ thì trả JSON thuần.

- Hợp đồng với Node: [`../docs/contracts/ai-service.md`](../docs/contracts/ai-service.md).
- Hợp đồng endpoint chi tiết: [`docs/05-api-contract.md`](docs/05-api-contract.md); ví dụ trong
  [`docs/samples/`](docs/samples/).
- Thiết kế: [`docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md`](docs/superpowers/specs/2026-09-28-ai-core-m1-m3-design.md)
  (các số `§` trong README này là số mục của spec đó).

## Chạy local

Từ thư mục `BE/ai`, bằng `.venv/Scripts/python -m …` (Windows; trên Linux/macOS dùng
`.venv/bin/python -m …`):

```bash
cp .env.example .env              # mặc định mọi provider là mock, không cần API key
.venv/Scripts/python -m uvicorn app.main:app --reload     # http://localhost:8000/docs
.venv/Scripts/python -m pytest                            # không chạm mạng, không đọc .env
```

Không dùng launcher `.venv/Scripts/pytest.exe` / `uvicorn.exe`: venv này được tạo ở một đường dẫn rồi
chuyển chỗ, các launcher `.exe` trỏ sai đường dẫn và im lặng không chạy. Cài mới:
`.venv/Scripts/python -m pip install -e ".[dev]"`, hoặc `uv sync` nếu máy có `uv` (Dockerfile cài từ
`uv.lock`; sau khi sửa `pyproject.toml` thì chạy `uv lock` để cập nhật). Cài `uv`:
https://docs.astral.sh/uv/getting-started/installation/

## Bốn endpoint + curl mẫu

Wire JSON **snake_case**; mọi request `extra="forbid"` (field lạ -> `INVALID_INPUT` 422). Header
`X-Internal-Token` bắt buộc (trừ `/health`). `__force` là field **cấp cao nhất** của body, chỉ có
tác dụng khi provider là mock.

```bash
TOKEN=dev-internal-token-doi-truoc-khi-deploy

curl -s localhost:8000/health

# 1. Truyện (khung đầy đủ trong docs/samples/story_request.json)
curl -s localhost:8000/v1/story/generate -H "X-Internal-Token: $TOKEN"   -H 'Content-Type: application/json' -d @docs/samples/story_request.json

# Kích lỗi "bị chặn" để bên Node test nhánh không-retry (cần jq; __force ở cấp cao nhất):
jq '. + {"__force": "SAFETY_BLOCKED"}' docs/samples/story_request.json |
  curl -s localhost:8000/v1/story/generate -H "X-Internal-Token: $TOKEN"     -H 'Content-Type: application/json' -d @-

# 2. Chân dung: trả portrait_keys (file PNG ở <storage_prefix>/<request_id>-1.png, -2.png).
#    Chạy trước lệnh 3: ảnh cảnh đọc lại portrait_key của sample này.
curl -s localhost:8000/v1/images/portrait -H "X-Internal-Token: $TOKEN"   -H 'Content-Type: application/json' -d @docs/samples/images_portrait_request.json

# 3. Tranh cảnh (portrait_key tuỳ chọn): trả image_key
curl -s localhost:8000/v1/images/scene -H "X-Internal-Token: $TOKEN"   -H 'Content-Type: application/json' -d @docs/samples/images_scene_request.json

# 4. Giọng đọc: trả audio_key + duration_seconds
curl -s localhost:8000/v1/tts/synthesize -H "X-Internal-Token: $TOKEN"   -H 'Content-Type: application/json'   -d '{"request_id":"r2","storage_prefix":"stories/demo/audio","text":"Chào bé.","voice_id":"default","__force":"TIMEOUT"}'
```

Khi chưa đặt `SUPABASE_*` thì dùng `LocalStorage`: file ghi vào `/tmp/storyweaver-storage` (mất khi container bị xoá); đặt
`SUPABASE_URL` + `SUPABASE_SERVICE_KEY` để dùng Supabase Storage. `/health` báo `storage_backend`.

## Bất biến ngân sách thời gian (§3.8)

```
AI_TIMEOUT_MS (Node, theo loại job)  >  2 x LLM_TIMEOUT_SECONDS  +  overhead
```

Một lần sinh truyện có thể gọi LLM hai lần (lần đầu + một lần thử lại nội bộ), mỗi lần tối đa
`LLM_TIMEOUT_SECONDS` = 45s, nên tệ nhất ~90s trong service. Node phải chờ lâu hơn thế, nếu không:
Node abort giữa chừng -> `TIMEOUT` retryable -> BullMQ chạy lại từ đầu -> ba lần sinh truyện đầy đủ
bị vứt đi, tiền Gemini mất thật, job vẫn failed. Timeout của Node theo loại job: `story_text` 120s,
`character_portrait` 90s, `scene_image` 90s, `narration` 30s. **Không cưỡng chế được bằng code** (hai
process); chỉ có tài liệu và review. Khi đổi `LLM_TIMEOUT_SECONDS` hay timeout Node, đối chiếu cả hai
phía (và `BE/docs/contracts/ai-service.md` §6).

## Sai lệch có chủ ý: mock trả PNG và WAV (§9.6)

`docs/05` ban đầu nói ảnh là **WebP** và audio là **AAC**. Mock hiện trả ảnh **PNG** đơn sắc và audio
**WAV** rỗng 44 byte (AAC cần ffmpeg ở M5, WebP cần Pillow ở M4a). Backend phải đọc định dạng từ
**đuôi key** chứ đừng giả định. Test contract khẳng định đúng sai lệch này để nó không trôi đi im
lặng. Cả hai mock vẫn đi qua đường upload Storage thật rồi trả key, nên luồng queue -> worker -> HTTP
-> có file trên Storage chạy được đầy đủ trước khi có model thật.

## Gemini: trạng thái spike và cấu hình

Gemini **chỉ dùng cho chữ**; sinh ảnh dùng model mã nguồn mở (`docs/06`). Spike gọi Gemini thật đang
**TẠM DỪNG, mới xong một phần** (xem `docs/01-decisions.md`, mục "Đang mở"): chỉ sample truyện chuẩn
đo được; sample xung đột mạnh và truyện `custom` dài chưa đo (model quá tải 503). `LLM_RETRY_TEMPERATURE`
mặc định **không đặt** (không gửi nhiệt độ cho lần thử lại).

## Vì sao test Gemini bằng client tiêm chứ không `respx` (§10.3)

`respx` chỉ chặn được nếu `google-genai` thật sự đi qua `httpx` — chưa xác minh, nên không thiết kế
dựa vào giả định đó. `GeminiLLMProvider(client=None)` tự dựng client thật; test tiêm một client giả
có cùng bề mặt `AsyncClient.models.generate_content`, trả `types.GenerateContentResponse` thật của SDK.
`respx` vẫn nằm trong dev-dependencies vì `SupabaseStorage` gọi HTTP thô bằng `httpx` (và M4b sẽ thêm
ComfyUI, HF Inference).

## Thêm một loại nội dung mới

1. Thêm port + mock trong `app/providers/<loại>/` (`base.py`, `mock.py`) và schema trong
   `app/schemas/`.
2. Thêm router trong `app/api/v1/`, đăng ký ở `app/main.py`; endpoint chỉ `raise AiError.<loại>()`.
3. Bên Node: thêm tên job vào `src/queues/ai.jobs.js` và endpoint + `timeoutMs` vào `JOB_CONFIG`
   trong `src/clients/aiClient.js`.
4. Cập nhật `docs/05-api-contract.md`, `docs/samples/` và `../docs/contracts/ai-service.md`.

## Các quy tắc không được phá

- **Không import thư viện DB, không đọc `DATABASE_URL` / `REDIS_URL`.** Service này không được cấp
  các biến đó trong docker-compose; có test khẳng định `Settings` không có field đó.
- **Không tự đặt HTTP status code trong endpoint.** Chỉ `raise AiError.<loại>()`; việc đổi thành
  status code do exception handler ở `main.py` làm, để bảng lỗi chỉ tồn tại ở một chỗ.
- **Không parse `storage_prefix` ngoài luật kiểm.** Đó là chuỗi opaque của Node; chỉ kiểm ký tự /
  `..` / `/` đầu / độ dài (§3.11.5) rồi nối tên file `<request_id>-<n>.<ext>`.
- **Không dedupe theo `request_id`.** Service stateless, không làm được; chống trùng là việc của
  BullMQ `jobId` + unique constraint ở DB.
- **Không log** tên thật, `forbidden_terms`, chữ gửi TTS, dữ liệu ảnh, API key, nội dung truyện ở INFO.

## Ghi chu google-genai (2.25.0, tra tu source da cai — Task 7)

Ten that trong SDK va cac cho khac spec/docs. Nguon: `google/genai/{types,client,_api_client,errors,_transformers}.py`
trong `.venv`, cong them tai lieu chinh thuc ai.google.dev (thinking, gemini-3).

- **Client async:** `genai.Client(api_key=..., http_options=...).aio` -> `AsyncClient`;
  goi `await client.models.generate_content(model=, contents=, config=GenerateContentConfig(...))`.
  `contents` = `list[types.Content(role="user"|"model", parts=[types.Part(text=...)])]`.
- **Config:** `response_mime_type`, `response_schema`, `max_output_tokens`, `temperature`,
  `thinking_config=types.ThinkingConfig(thinking_budget=...)` (con co `thinking_level`, khong dung
  chung duoc voi `thinking_budget`), `safety_settings` (khong dat = nguong mac dinh).
- **`response_schema` nhan thang class Pydantic** (`t_schema` -> `model_json_schema()` -> `types.Schema`).
  Field `str | None` ra `nullable: true` va khong nam trong `required` -> giu nguyen `LlmStoryOutput`,
  khong can doi sang `str = ""` (spec 9.3). Schema dan xuat con giu `default: []` cua `options`;
  Gemini API that co chap nhan hay khong thi spike (Task 8) xac nhan. SDK con co
  `response_json_schema` (JSON Schema thuan) lam duong du phong.
- **Token:** `response.usage_metadata` (`GenerateContentResponseUsageMetadata`):
  `prompt_token_count`, `candidates_token_count`, `thoughts_token_count`. `candidates_token_count`
  **khong** gom thinking (`total_token_count` = prompt + candidates + tool_use_prompt + thoughts),
  nen `output_tokens` = candidates + thoughts.
- **`max_output_tokens` CO tinh token thinking** (docs chinh thuc: "the maximum number of tokens a
  response can generate, including thought tokens") — dung gia dinh cua spec 3.11.4 (budget cong them).
- **`response.text`** noi cac part chu cua candidate dau tien, **bo qua part `thought=True`**;
  khong co part chu -> `None`.
- **`finish_reason`:** `Candidate.finish_reason: types.FinishReason` (enum `str`, khong phan biet hoa
  thuong; gia tri la chinh ten: `STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`, `LANGUAGE`, `OTHER`,
  `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `MALFORMED_FUNCTION_CALL`, `IMAGE_*`...). Gia tri la tu
  server duoc giu nguyen thanh pseudo-member. Provider coi `SAFETY`/`BLOCKLIST`/`PROHIBITED_CONTENT`/
  `SPII`/`IMAGE_SAFETY`/`IMAGE_PROHIBITED_CONTENT` la bi chan an toan.
- **Prompt bi chan:** `response.prompt_feedback.block_reason: types.BlockedReason` (`SAFETY`, `OTHER`,
  `BLOCKLIST`, `PROHIBITED_CONTENT`, ...), thuong kem `candidates` rong. Moi `block_reason` -> `SAFETY_BLOCKED`.
- **Loi:** `google.genai.errors.APIError` (`.code` = HTTP status, `.status`, `.message`), con
  `ClientError` (4xx) va `ServerError` (5xx). Loi mang di thang tu httpx (`httpx.ConnectError`,
  `httpx.TimeoutException`...) — provider bat `httpx.HTTPError` + `OSError`.
- **Retry cua SDK:** `HttpOptions.retry_options: HttpRetryOptions(attempts, initial_delay, ...,
  http_status_codes)`. Mac dinh (`retry_options=None`) SDK **khong** retry (`retry_args(None)` ->
  `stop_after_attempt(1)`), du comment trong `_api_client.py` noi "By default, the client will retry
  4 times" — comment do chi dung khi co `retry_options` ma bo trong `attempts` (mac dinh 5). Provider
  van dat `HttpRetryOptions(attempts=1)` tuong minh.
- **Timeout cua SDK:** `HttpOptions.timeout` tinh bang **mili-giay** (khong phai giay). Provider khong
  dung no; boc loi goi bang `asyncio.wait_for(LLM_TIMEOUT_SECONDS)`.
- **Khac voi spec/docs can quyet o spike (Task 8):** voi dong Gemini 3, docs chinh thuc khuyen
  `thinking_level` (`thinking_budget` chi con "backward compatibility"), va thinking **khong tat han
  duoc** tren moi model Gemini 3 (`minimal` "does not guarantee that thinking is off"). Docs cung
  "strongly recommend" giu `temperature` mac dinh 1.0 (ha thap co the gay lap/giam chat luong) — dung
  cham `LLM_RETRY_TEMPERATURE=0.4` ban dau cua spec -> da doi: mac dinh rong = khong gui (docs/01,
  Task 12). Provider hien dat `thinking_budget=LLM_THINKING_BUDGET` theo spec; neu Google bo tham
  so cu thi xem lai diem nay.
- **`respx` khong dung cho test Gemini** (spec 10.3): test tiem client gia co cung be mat
  `AsyncClient.models.generate_content`, tra `types.GenerateContentResponse` that cua SDK.
- **Ket qua spike (Task 8, `gemini-3.8-flash`):** `thinking_budget=0` duoc chap nhan va response
  khong co `thoughts_token_count` -> thinking tat that, du docs chi liet ke `thinking_level`
  low/medium/high cho model nay. Provider giu `thinking_budget`; chi tiet + ly do o `docs/01`.
  Khi khong bi chan, model **khong tra** `safety_ratings` (ca candidate lan `prompt_feedback`).
  `response_schema = LlmStoryOutput` (co `default: []`) duoc API that chap nhan.
- **Giu song `AsyncClient`:** `AsyncClient.__del__` len lich `aclose()` tren event loop dang chay,
  dong httpx client dung chung -> request sau ne `RuntimeError: Cannot send a request, as the client
  has been closed` (khong phai `httpx.HTTPError`). Ai boc `client.aio` (vd. `scripts/try_story.py`)
  phai giu tham chieu toi chinh `AsyncClient`, khong chi `.models`. Provider giu `self._client`
  nen khong dinh.

## Thu Gemini that (`scripts/try_story.py`)

```bash
.venv/Scripts/python scripts/try_story.py --model gemini-3.8-flash            # chi in ke hoach, khong goi mang
.venv/Scripts/python scripts/try_story.py --model gemini-3.8-flash --confirm  # goi that, 1 loi goi / sample
```

Mac dinh chay 3 sample (`docs/samples/story_request.json`, `scripts/try_story_samples/*.json`);
`--sample PATH` (lap lai duoc) de chon. Ket qua o `out/try_story/<timestamp>/` (git-ignore).
Khong thuoc pytest.
