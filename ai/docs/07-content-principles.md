# 07 — Nguyên tắc nội dung

Mã hoá toàn bộ vào `prompts/story.v1.md`. Viết test cho những gì kiểm tra tất định được.

## Bảy nguyên tắc

| # | Nguyên tắc | Nên | Không nên |
|---|---|---|---|
| 1 | Không dán nhãn đáp án đúng trong lời kể | "{NV1} hít một hơi thật sâu." | "{NV1} đã chọn cách đúng đắn." |
| 2 | Hệ quả tự nhiên, không trừng phạt | "{NV2} khóc to hơn. {NV1} vẫn thấy khó chịu." | "Vì hư nên {NV1} bị phạt đứng góc." |
| 3 | Luôn có đường sửa sai | Kết truyện hai anh em cùng xếp lại tháp | Kết truyện với việc hỏng không sửa được |
| 4 | Gọi tên cảm xúc rõ ràng *(trừ trang ngay trước câu hỏi cảm xúc)* | "{NV2} thấy buồn vì mất xe." | Cảm xúc mơ hồ, trừu tượng |
| 5 | **Tuyệt đối không giảng đạo lý** | Để hành động nói lên bài học | "Bài học hôm nay là…", "Con phải nhớ rằng…" |
| 6 | Không so sánh, không thi đua | — | "{NV1} ngoan hơn {NV2}." |
| 7 | Hệ quả vừa tầm tuổi | Buồn, tiếc, ngượng — rồi qua | Chết, mất mát vĩnh viễn, bố mẹ thất vọng làm hình phạt |

Thêm:
- Lựa chọn **cụ thể, tức thì** — hành động bé làm được ngay.
- Bối cảnh Việt Nam: ông bà, anh chị em, cô giáo, bữa cơm gia đình.
- Câu ngắn, một ý mỗi câu, từ ngữ trẻ 5–8 tuổi hiểu.

## Viết điểm dừng

- **Câu hỏi cảm xúc**: hỏi về một nhân vật, một thời điểm. Gợi ý nhắc lại **dấu hiệu trong lời
  kể**, không nhắc tranh (có thể tắt tranh).
- **Câu `perspective`**: một phương án đúng rõ ràng; hai phương án nhiễu **hợp lý nhưng rõ là
  sai**, không đánh đố, không đùa cợt.
- **Câu `problem_solving`**: ba phương án là ba hành động **đều có thể xảy ra** với trẻ thật. Phương
  án `impulsive` không được là hành vi nguy hiểm. `feedback` là hệ quả tự nhiên, không phán xét.
- **Câu `reflection`**: mở, nhẹ nhàng, không bắt trẻ thú nhận điều xấu.

## Kiểm tra tất định được — viết test

- Không có cụm giảng đạo lý: danh sách cụm cấm như "bài học", "con phải nhớ", "phải biết" (cấu hình).
- Trang ngay trước `emotion_*` không chứa đúng từ cảm xúc là đáp án.
- Độ dài, token, tên thật — như docs 04.
