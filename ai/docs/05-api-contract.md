# 05 — Hợp đồng API

Mọi endpoint (trừ `/health`) yêu cầu header `X-Internal-Token` khớp `INTERNAL_TOKEN`.
Mọi request có `request_id` — backend dùng làm khoá idempotency; service chỉ ghi log.
Mọi response thành công có `usage` và `prompt_version` (nếu có prompt).

## `POST /v1/story/generate`

Sinh toàn bộ chữ và điểm dừng cho một truyện. Ví dụ đầy đủ: `docs/samples/story_request.json`,
`docs/samples/story_response.json`.

Request:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `topic` | `{title, competency, guidance}` | Bài học do Moderator quản lý |
| `characters` | `[{token, description, is_main}]` | Đúng một `is_main = true` |
| `situation` | string \| null | Chuyện thật, đã che tên |
| `tone` | `gentle` \| `playful` | |
| `pages` | `[page_id]` | Theo thứ tự |
| `checkpoints` | `[{id, type, after, target?}]` | `target` là token, bắt buộc với `emotion_other`, `perspective` |
| `limits` | object | Xem docs 03; gồm `max_scenes` |
| `forbidden_terms` | `[string]` | Tên thật |
| `blocked_keywords` | `[{keyword, severity}]` | |

Response:

| Trường | Ghi chú |
|---|---|
| `pages` | `{page_id: {text, scene}}` |
| `scenes` | `{scene_id: mô tả tiếng Anh}` |
| `checkpoints` | `{checkpoint_id: ...}` theo kiểu — xem docs 03 |
| `warnings` | `[{code, target_id, detail}]` |

## `POST /v1/images/portrait`

Sinh **2 phương án** chân dung nhân vật: toàn thân, mặt nhìn thẳng, nền trơn, phong cách cố
định. Request: mô tả ngoại hình (không tên), `forbidden_terms`. Response: 2 ảnh WebP base64
+ `usage`.

## `POST /v1/images/scene`

Sinh 1 ảnh cho 1 cảnh. Request: `scene_description` (từ `scenes`), `characters` có mặt (mô tả +
chân dung base64 làm tham chiếu), `forbidden_terms`. Response: 1 ảnh WebP base64 +
`reference_used` + `usage`. Backend gọi một lần cho mỗi cảnh (tối đa 4).

## `POST /v1/tts/synthesize`

Request: `text` (đã có tên thật), `voice_id`. Response: audio AAC base64, `duration_seconds`,
`usage`. Chuẩn hoá chữ trước khi đọc: số → chữ, bỏ ký tự lạ, rút khoảng trắng. **Không log
`text`.**

## `GET /health`

Trạng thái và profile/provider đang dùng cho chữ, ảnh (chân dung, cảnh), giọng đọc. Không cần token.

## Lỗi

Mọi lỗi trả cùng một dạng:

```json
{ "error": { "code": "OUTPUT_INVALID", "message": "…", "retryable": false } }
```

| Code | HTTP | Ý nghĩa với backend |
|---|---|---|
| `INVALID_INPUT` | 422 | Lỗi của backend, không tính tiền |
| `FORBIDDEN_TERM_DETECTED` | 422 | Backend chưa che tên, không tính tiền |
| `SAFETY_BLOCKED` | 422 | Bộ lọc an toàn của nhà cung cấp chặn, hoàn credit |
| `OUTPUT_INVALID` | 502 | AI trả sai sau khi đã thử lại, hoàn credit |
| `PROVIDER_ERROR` | 502 | Lỗi phía nhà cung cấp, `retryable: true` |
| `TIMEOUT` | 504 | Quá thời gian, `retryable: true` |
