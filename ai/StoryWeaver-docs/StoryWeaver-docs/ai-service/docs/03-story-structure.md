# 03 — Cấu trúc truyện

## Khung do backend dựng

Truyện là một mạch trang, **không rẽ nhánh**. Backend quyết định số trang và vị trí, kiểu của
từng điểm dừng theo độ dài, rồi gửi khung sang service. Service **chỉ điền nội dung**.

| Độ dài | Trang | Điểm dừng (kiểu — đặt sau trang) |
|---|---|---|
| Ngắn | 6 | `emotion_self` — p2 · `perspective` — p3 · `problem_solving` — p4 · `reflection` — p6 |
| Vừa | 8 | `emotion_self` — p2 · `perspective` — p4 · `problem_solving` — p5 · `reflection` — p8 |
| Dài | 10 | `emotion_self` — p2 · `perspective` — p4 · `problem_solving` — p6 · `emotion_other` — p8 · `reflection` — p10 |

Bảng này là để hiểu ngữ cảnh — **service không tự áp dụng**, mà dùng đúng khung được gửi.

## Truyện tự viết (`custom`)

Người viết tự quyết số trang và đặt điểm dừng. Backend kiểm tra khi lưu: 4–20 trang; 0–6 điểm
dừng có chấm; tối đa 1 điểm dừng mỗi trang; không đặt sau trang 1; `reflection` chỉ ở cuối.
Truyện tự viết không gọi AI viết chữ, nên service chỉ gặp nó ở bước vẽ tranh và giọng đọc.

## Nội dung mỗi trang phải phục vụ điểm dừng ngay sau nó

- Trang ngay trước `emotion_self` / `emotion_other`: lời kể phải có **dấu hiệu cảm xúc cụ thể**
  (mặt đỏ, tay nắm chặt, giọng run…) để câu gợi ý nhắc lại được. Không nói thẳng tên cảm xúc
  trong trang đó — nếu nói "An đang giận" thì câu hỏi thành vô nghĩa.
- Trang ngay trước `perspective`: có một sự việc gây ra phản ứng của nhân vật khác.
- Trang ngay trước `problem_solving`: cao trào, nhân vật chính đứng trước lựa chọn.
- Các trang sau `problem_solving`: mạch chính đi theo hướng **làm lành / sửa sai**, bất kể trẻ chọn
  gì.

## Các kiểu điểm dừng

| Kiểu | AI phải viết | Đáp án |
|---|---|---|
| `emotion_self` | `question`, `answer` (1 trong 5 cảm xúc), `hint` | AI đề xuất, người xác nhận |
| `emotion_other` | như trên, về nhân vật `target` | như trên |
| `perspective` | `question`, 3 `options`, `answer` (id phương án), `hint` | như trên |
| `problem_solving` | `question`, 3 phương án **theo đúng 3 vai**, mỗi phương án có `text` + `feedback` | Không có đáp án đúng; vai do khung quy định |
| `reflection` | `question` | Không có |

Bộ 5 cảm xúc (luôn hiện đủ, cùng thứ tự, frontend lo): `happy`, `sad`, `angry`, `scared`, `neutral`.

Thứ tự hiển thị phương án được **frontend xáo ngẫu nhiên** — AI không cần và không nên cố sắp xếp.

## Giới hạn độ dài (backend gửi, đây là giá trị mặc định)

| Thành phần | Mục tiêu | Tối đa |
|---|---|---|
| Trang | 40–60 tiếng, 2–4 câu | 70 (tối thiểu 20) |
| Câu | — | 15 |
| Câu hỏi | — | 15 |
| Phương án | — | 12 |
| Gợi ý | — | 20 |
| Phản hồi | — | 25 |

## Cảnh và tranh

AI gán mỗi trang vào một cảnh (`scene`), tối đa `max_scenes` cảnh (mặc định 4), và viết một mô tả
cảnh tiếng Anh cho mỗi cảnh. Các trang cùng cảnh dùng chung một tranh.

## Khi trẻ trả lời *(frontend/backend — để hiểu vì sao cần `hint` và `feedback`)*

- Câu có đáp án, chọn sai → đọc `hint`, cho chọn lại một lần; vẫn sai → giọng đọc nói đáp án.
- `problem_solving` → đọc `feedback` của phương án đã chọn, rồi quay lại mạch chính.
- Không có dấu X, không có lời trách. Chấm điểm chỉ dùng lần chọn đầu.
