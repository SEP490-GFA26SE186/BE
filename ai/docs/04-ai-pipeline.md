# 04 — Luồng AI

## Sinh cả truyện ("Viết giúp tôi")

```
1. Nhận khung + nhân vật (đã che tên) + bài học + chuyện thật + giới hạn
2. assert_no_forbidden_terms(request)           ← chặn nếu còn tên thật
3. Dựng prompt từ prompts/story.v1.md
4. Gọi LLM một lần, yêu cầu JSON theo schema, đặt trần token đầu ra
5. Parse + validator
6. Sai → thử lại 1 lần kèm danh sách lỗi → vẫn sai: OUTPUT_INVALID
7. assert_no_forbidden_terms(output)
8. Trả nội dung + warnings + usage
```

Tranh và giọng đọc là **request riêng** do backend gọi sau khi phụ huynh xem lại chữ.

Không có endpoint viết lại một trang hay điền một điểm dừng — AI chỉ viết cả truyện một lần.

## Validator (tất định — không dùng AI để kiểm tra AI)

| Kiểm tra | Sai thì |
|---|---|
| JSON đúng schema | thử lại |
| Đủ mọi `page_id` và `checkpoint_id` đã gửi, không id lạ | thử lại |
| Mọi trang có `scene`; số cảnh ≤ `max_scenes`; mỗi cảnh có mô tả | thử lại |
| `emotion_*`: `answer` thuộc bộ 5 cảm xúc | thử lại |
| `perspective`: đúng 3 phương án, `answer` trỏ vào một phương án | thử lại |
| `problem_solving`: đủ 3 vai `constructive` / `avoidant` / `impulsive`, mỗi vai có `text` + `feedback` | thử lại |
| Chỉ dùng token `{NVx}` đã khai báo | thử lại |
| Không chứa `forbidden_terms` | thử lại |
| Trúng `blocked_keywords` mức `block` | thử lại |
| Trúng mức `warn` | nhận, ghi `warnings` |
| Trang ngắn hơn tối thiểu hoặc vượt tối đa > 10% | thử lại |
| Vẫn vượt độ dài sau lần thử lại | **nhận**, ghi `warnings` |
| Câu hỏi / phương án / gợi ý / phản hồi vượt giới hạn | thử lại |
| Trang ngay trước `emotion_*` gọi thẳng tên cảm xúc là đáp án (theo từ điển cảm xúc trong cấu hình) | nhận, ghi `warnings` |

Đếm độ dài: tách khoảng trắng; `{NV1}` tính là 1 tiếng; bỏ dấu câu đứng riêng.

## Chính sách thử lại

Tối đa **1 lần thử lại** mỗi request. Lần thử lại gửi kèm danh sách lỗi cụ thể của lần trước.

## Trần chi phí

`max_output_tokens = tổng_số_tiếng_tối_đa_của_mọi_ô × TOKENS_PER_WORD × 1.3`

`TOKENS_PER_WORD` lấy từ env, mặc định 2.0, cần đo thực tế bằng `scripts/try_story.py`.

## Chốt chặn tên thật (defense in depth)

- Request mang `forbidden_terms` — tên thật của các nhân vật.
- So khớp không phân biệt hoa thường, **bỏ dấu** khi so, **theo ranh giới từ** — "An" không bị bắt
  nhầm trong "an toàn".
- Chạy trên toàn bộ chuỗi sắp gửi ra ngoài (chữ và ảnh) và trên output.
- Phát hiện trong request → không gọi AI, lỗi `FORBIDDEN_TERM_DETECTED`.
- Phát hiện trong output → coi như output sai, thử lại.
- TTS **không** chạy chốt chặn này (được phép nhận tên thật, chạy trên server của nhóm).
