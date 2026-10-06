# 04 — Luồng AI

## Sinh cả truyện ("Viết giúp tôi")

```
1. Nhận khung + nhân vật (đã che tên) + bài học + chuyện thật + giới hạn
2. assert_no_forbidden_terms(request)           ← chặn nếu còn tên thật (chỉ trường phụ huynh nhập)
3. Dựng prompt từ prompts/story.v1.md
4. Gọi LLM một lần, yêu cầu JSON theo schema, đặt trần token đầu ra
5. Parse (bị cắt cụt hoặc JSON hỏng → issue, không ném lỗi) + validator
6. Sai → thử lại 1 lần kèm danh sách lỗi → vẫn sai: OUTPUT_INVALID
   (trừ fallback DOWNGRADE, xem "Chính sách thử lại")
7. Map sang dict theo id; trả nội dung + warnings + usage
```

**Không kiểm output bằng `forbidden_terms`** (đã bỏ bước này, xem "Chốt chặn tên thật").
LLM trả danh sách (`pages: [...]`); service parse -> validate trên danh sách -> mới map sang dict,
vì map trước thì `page_id` trùng bị dict nuốt im lặng. Mẫu: `docs/samples/story_llm_output.json`.

Tranh và giọng đọc là **request riêng** do backend gọi sau khi phụ huynh xem lại chữ.

Không có endpoint viết lại một trang hay điền một điểm dừng — AI chỉ viết cả truyện một lần.

## Validator (tất định — không dùng AI để kiểm tra AI)

| Dòng (`doc_row`) | Kiểm tra | Sai thì | Luật trong registry |
|---|---|---|---|
| `docs04:1` | JSON đúng schema (`OUTPUT_SCHEMA_INVALID`) và không bị cắt cụt ở trần token (`OUTPUT_TRUNCATED`) | thử lại (cắt cụt: nâng trần) | `OUTPUT_SCHEMA_INVALID`, `OUTPUT_TRUNCATED` |
| `docs04:2` | Đủ mọi `page_id` và `checkpoint_id` đã gửi, không id lạ | thử lại | `PAGE_IDS_MISMATCH`, `CHECKPOINT_IDS_MISMATCH` |
| `docs04:3` | Mọi trang có `scene`; số cảnh ≤ `max_scenes`; mỗi cảnh có mô tả | thử lại | `PAGE_SCENE_MISSING`, `SCENE_COUNT_EXCEEDED`, `SCENE_DESCRIPTION_MISSING` |
| `docs04:4` | `emotion_*`: `answer` thuộc bộ 5 cảm xúc | thử lại | `EMOTION_ANSWER_INVALID` |
| `docs03` | `emotion_*` và `perspective`: có `hint` (`EMOTION_HINT_MISSING`, theo docs 03) | thử lại | `EMOTION_HINT_MISSING` |
| `docs04:5` | `perspective`: đúng 3 phương án, `answer` trỏ vào một phương án | thử lại | `PERSPECTIVE_OPTIONS_INVALID`, `PERSPECTIVE_ANSWER_INVALID` |
| `docs04:6` | `problem_solving`: đủ 3 vai `constructive` / `avoidant` / `impulsive`, mỗi vai có `text` + `feedback` | thử lại | `PROBLEM_SOLVING_ROLES_INVALID`, `PROBLEM_SOLVING_FIELD_MISSING` |
| `docs03` | `reflection`: chỉ có `question`, không `answer` / `options` (`REFLECTION_SHAPE_INVALID`, theo docs 03) | thử lại | `REFLECTION_SHAPE_INVALID` |
| `docs04:7` | Chỉ dùng token `{NVx}` đã khai báo | thử lại | `UNKNOWN_CHARACTER_TOKEN` |
| `docs04:9` | Trúng `blocked_keywords` mức `block` | thử lại | `BLOCKED_KEYWORD_BLOCK` |
| `docs04:10` | Trúng mức `warn` | nhận, ghi `warnings` | `BLOCKED_KEYWORD_WARN` |
| `docs04:11` | Trang ngắn hơn tối thiểu hoặc vượt tối đa > 10% | thử lại | `PAGE_LENGTH_OUT_OF_RANGE` (`docs04:11+12`) |
| `docs04:12` | Vẫn vượt độ dài sau lần thử lại | **nhận**, ghi `warnings` | `PAGE_LENGTH_OUT_OF_RANGE` (`docs04:11+12`) |
| `docs04:13` | Câu hỏi / phương án / gợi ý / phản hồi vượt giới hạn | thử lại | `CHECKPOINT_TEXT_TOO_LONG` |
| `docs04:14` | Trang ngay trước `emotion_*` gọi thẳng tên cảm xúc là đáp án (theo từ điển cảm xúc trong cấu hình) | nhận, ghi `warnings` | `EMOTION_SPOILED_BY_PAGE` |
| `docs07` | Trang chứa cụm giảng đạo lý (`PREACHY_PHRASE`, danh sách ở `app/content_rules.yaml`, theo docs 07) | nhận, ghi `warnings` | `PREACHY_PHRASE` |
| `docs03` | Một câu dài hơn `sentence_max_words` (`PAGE_SENTENCE_TOO_LONG`, theo docs 03) | thử lại một lần; vẫn vượt thì **nhận**, ghi `warnings` | `PAGE_SENTENCE_TOO_LONG` |

`doc_row` trong `app/core/validator/rules.py` trỏ vào cột đầu: `docs04:N` là dòng N của bảng này
(số cố định, không đánh lại khi thêm/bỏ dòng); `docs03` / `docs07` là luật lấy từ tài liệu đó.
**`docs04:8` đã bỏ** (từng là "không chứa `forbidden_terms`" trên output — xem "Chốt chặn tên
thật") và không dùng lại số này; `tests/unit/test_validator_registry.py` khẳng định không luật nào
trỏ vào nó.

Đếm độ dài: tách khoảng trắng; `{NV1}` tính là 1 tiếng; bỏ dấu câu đứng riêng. Tách câu ở `.` `!`
`?` `…`, **không** cắt ở dấu hai chấm (lời thoại dùng `:`).

Mỗi luật là một `Rule` trong registry `app/core/validator/rules.py` với `code`, mức (`RETRY` /
`WARN` / `DOWNGRADE_AFTER_RETRY`), `doc_row` (dòng của bảng này) và `checkpoint_types` (các kiểu
điểm dừng luật đó kiểm — để test khẳng định mọi kiểu đều được phủ). `validate()` chạy hết mọi luật,
không dừng sớm: lần thử lại cần **toàn bộ** lỗi. `OUTPUT_SCHEMA_INVALID` và `OUTPUT_TRUNCATED` có
trong registry nhưng không tự sinh issue; orchestrator dựng chúng ở bước parse. `Issue.detail` viết
tiếng Việt (đi vào prompt thử lại và `warnings[].detail`).

## Chính sách thử lại

Tối đa **1 lần thử lại** mỗi request, dạng hội thoại nhiều lượt (prompt gốc, JSON lần 1 nguyên văn,
rồi danh sách lỗi cụ thể của lần trước; lần 1 rỗng thì gộp vào một lượt `user`). Lần thử lại dùng
`LLM_RETRY_TEMPERATURE` — **mặc định không đặt** (không gửi, dùng nhiệt độ mặc định của model).

- **Cắt cụt (`OUTPUT_TRUNCATED`):** `finish_reason = MAX_TOKENS` không phải lỗi provider, là issue
  `RETRY`. Lần thử lại nâng phần trần chữ lên `LLM_TRUNCATION_RETRY_FACTOR` (mặc định 1.5, làm tròn
  lên) lần; budget thinking giữ nguyên. JSON hỏng mà `STOP` thì giữ nguyên trần.
- **Lệch độ dài (`DOWNGRADE`):** lần 1 lệch độ dài thì thử lại; lần 2 còn lệch thì **nhận** và ghi
  `warnings`.
- **Fallback `DOWNGRADE`:** nếu lần 1 chỉ có `DOWNGRADE` / `WARN` mà lần 2 hỏng vì bất kỳ lý do gì
  (còn `RETRY`, bị cắt cụt / không parse được, hoặc provider ném `PROVIDER_ERROR` / `TIMEOUT` /
  `SAFETY_BLOCKED`), service **trả output lần 1** kèm `warnings` (không ném lỗi). Lần thử lại để sửa
  một trang hơi dài không được biến một truyện dùng được thành lỗi.
- Lần 1 có `RETRY` và lần 2 còn `RETRY` → `OUTPUT_INVALID` (kèm `usage`).
- `warnings` chỉ lấy từ output được nhận. `usage` cộng dồn mọi lời gọi (xem docs 05).

## Trần chi phí

`max_output_tokens = tổng_số_tiếng_tối_đa_của_mọi_ô × TOKENS_PER_WORD × 1.3`, rồi **cộng thêm**
`LLM_THINKING_BUDGET` khi bật thinking (token thinking tính vào `max_output_tokens`, nên budget
không được ăn vào phần của truyện). Tổng tiếng tối đa gồm cả mô tả cảnh:
`max_scenes × SCENE_DESCRIPTION_MAX_WORDS`.

`TOKENS_PER_WORD` lấy từ env, mặc định 2.8 (đo bằng `scripts/try_story.py` trên
`gemini-3.8-flash`: 2.557, cộng biên ~10% — xem `docs/01-decisions.md`; mới một mẫu đo vì spike
Gemini **đang tạm dừng, mới xong một phần**).

## Chốt chặn tên thật

Một tầng duy nhất, chỉ trên **request**, trước khi gọi AI:

- Request mang `forbidden_terms` — tên thật của các nhân vật.
- So khớp theo **ranh giới từ**, **phân biệt hoa thường**, **giữ nguyên dấu** (cả hai phía chuẩn
  hoá NFC trước khi so, vì "Đức" gõ trên macOS / iOS có thể ra NFD). `"An"` khớp `"An"`; không
  khớp `"an toàn"`, `"Ân"`, `"Anh"`.
- **Chỉ quét trường phụ huynh nhập:** `situation` và `characters[].description`; ảnh: `description`,
  `scene_description`, `characters[].description`. `topic.title` / `topic.guidance` do chuyên gia
  viết, không chứa tên trẻ — quét chúng chỉ sinh chặn nhầm ("Anh chị em…" dính tên `Anh`).
- Phát hiện → không gọi AI, lỗi `FORBIDDEN_TERM_DETECTED` (422).
- **Không kiểm output.** Request sạch thì Gemini không thể biết tên thật; chữ trùng trong output
  ("An toàn là trên hết.") là từ thông dụng, không phải rò rỉ. Kiểm output chỉ sinh báo nhầm, tốn
  thêm một lời gọi thử lại, và `detail` của issue có thể mang chính tên thật vào prompt thử lại.
- **Không có tầng cảnh báo lỏng** (bỏ dấu + bỏ hoa thường): với trẻ tên Anh gần như truyện nào cũng
  dính, warning thành nhiễu.
- TTS **không** chạy chốt chặn này (được phép nhận tên thật, chạy trên server của nhóm).

Vì sao không "không phân biệt hoa thường + bỏ dấu + theo ranh giới từ" như bản đầu của tài liệu này:
tiếng Việt tách tiếng bằng khoảng trắng nên `an` trong `an toàn` **là** một tiếng độc lập; ba điều
kiện không cùng đúng được. Nếu cài như vậy thì các tên phổ biến đều chặn nhầm câu bình thường:

| `forbidden_terms` | Câu bình thường | Sau khi bỏ dấu + lowercase | Bị chặn? |
|---|---|---|---|
| `Anh` | "{NV1} gọi **anh** ra chơi." | `anh` | có |
| `Chi` | "**Chị** dắt em vào lớp." | `chi` | có |
| `Nam` | "**Năm** nay {NV1} sáu tuổi." | `nam` | có |
| `Ly` | "Mẹ rót nước vào cái **ly**." | `ly` | có |
| `Đức` | "{NV1} có **đức** tính chăm chỉ." | `duc` | có |
| `An` | "{NV1} chơi **an** toàn ở nhà." | `an` | có |

Rò rỉ thật là backend quên thay token, khi đó tên xuất hiện nguyên dạng như lưu trong DB (đúng dấu,
đúng hoa thường) — luật một tầng bắt đúng trường hợp đó. Rủi ro còn lại: backend vừa quên thay token
vừa viết sai hoa thường / dấu tên (hai lỗi đồng thời) thì lọt — chấp nhận. Chữ hoa đầu câu trong
`situation` ("An toàn là…" với trẻ tên An) vẫn có thể chặn nhầm; phụ huynh sửa câu là qua và lỗi này
không tốn credit.
