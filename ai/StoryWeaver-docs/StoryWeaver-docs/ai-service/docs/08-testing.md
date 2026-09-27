# 08 — Test

## Nguyên tắc

- `pytest` không bao giờ gọi mạng: dùng provider `mock` hoặc respx.
- Script thử thật nằm trong `scripts/`, bắt buộc cờ `--confirm`, in chi phí ước tính trước khi chạy.

## Chữ

- Unit test: `text_utils` (đếm tiếng, bỏ dấu), `guards` (tên trùng từ thường: "An" / "an toàn",
  hoa thường, có dấu / không dấu), `validator` (mỗi dòng trong bảng docs 04 có ít nhất một test
  đạt và một test trượt; biên độ dài 9% / 11%).
- Test vòng thử lại: LLM giả trả output sai lần đầu, đúng lần hai; và sai cả hai lần.
- Test cho từng kiểu điểm dừng: thiếu vai, thừa phương án, `answer` ngoài bộ 5 cảm xúc, `answer`
  trỏ vào phương án không tồn tại.
- `scripts/try_story.py`: chạy `docs/samples/story_request.json` với Gemini thật, in kết quả,
  số token thực tế, và `TOKENS_PER_WORD` đo được.

## Checklist nhóm đọc truyện thật

- Có câu nào giảng đạo lý không?
- Trang trước câu hỏi cảm xúc có dấu hiệu cụ thể mà không nói thẳng đáp án không?
- Ba phương án giải quyết tình huống có khớp vai và đều là hành động trẻ có thể làm không?
- Phương án nhiễu ở câu `perspective` có quá dễ hoặc quá đánh đố không?
- Câu có ngắn, dễ nghe với trẻ 5–8 tuổi không?

## Test ảnh — ba tầng

Ba tầng, từ rẻ tới đắt:

**Tầng 1 — Mock (hằng ngày, 0 đồng).** `MockImageProvider` trả PNG đơn sắc đúng kích thước,
có vẽ chữ mô tả cảnh lên ảnh để nhìn là biết request nào sinh ra ảnh nào. Mọi test pytest và
mọi lúc backend phát triển dùng tầng này.

**Tầng 2 — Ghi rồi phát lại (test tích hợp, gần như 0 đồng).** Thêm provider `replay`:
- Chế độ ghi: gọi Gemini thật, lưu request đã chuẩn hoá + ảnh trả về vào
  `tests/cassettes/images/<hash>.json` + `.webp`.
- Chế độ phát: tra theo hash request, trả lại ảnh đã lưu, **không gọi mạng**; không có bản ghi
  thì lỗi rõ ràng.
- Dùng để test đầu–cuối luồng portrait → scene có ảnh tham chiếu mà không tốn tiền mỗi lần chạy.
- Hash tính từ model + prompt + hash các ảnh tham chiếu, **không** gồm `request_id`.

**Tầng 3 — Thử thật để đánh giá chất lượng (thủ công, tốn tiền).** Script
`scripts/try_images.py`:
- Chạy fixture `skeleton_3_stages.json` với 2–3 nhân vật mẫu: sinh chân dung → chọn phương án
  đầu → sinh 4 cảnh dùng chân dung làm tham chiếu.
- Lưu mọi ảnh vào `out/images/<timestamp>/` kèm file `run.json` ghi model, prompt, thời gian,
  chi phí ước tính.
- Sinh thêm `out/images/<timestamp>/index.html` xếp chân dung và 4 cảnh cạnh nhau để nhìn một
  lượt.
- **Bắt buộc cờ `--confirm`**, in ra số lời gọi và chi phí ước tính trước khi chạy, dừng nếu
  vượt `IMAGE_DEV_MAX_CALLS`.
- Có cờ `--model` để so sánh nhanh Lite với bản thường trên cùng một fixture.

Checklist nhóm dùng khi xem kết quả tầng 3 (ghi vào README):
- Nhân vật trong 4 cảnh có nhận ra là cùng một người như chân dung không?
- Phong cách vẽ có đồng nhất giữa chân dung và các cảnh không?
- Có chữ lạ, ký tự lỗi xuất hiện trong ảnh không? (prompt phải yêu cầu không có chữ)
- Có chi tiết đáng sợ hoặc không hợp trẻ 5–8 tuổi không?
- Tranh có khớp nội dung các trang thuộc cảnh đó không?
