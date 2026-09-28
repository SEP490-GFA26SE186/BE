# 01 — Nhật ký quyết định

Đọc file này trước khi đề xuất bất kỳ thay đổi thiết kế nào. Thứ nằm ở mục **Đã bỏ** không được
đưa trở lại nếu chưa được hỏi.

## Đã chốt

**Cấu trúc truyện**
- Truyện **tuyến tính**, không rẽ nhánh. Độ dài Ngắn / Vừa / Dài = 6 / 8 / 10 trang.
- Tương tác qua **điểm dừng** chèn giữa các trang. Với truyện AI viết, kiểu và vị trí điểm dừng do
  **backend** quyết theo độ dài (bảng trong `docs/03-story-structure.md`).
- Truyện **tự viết** có cấu trúc tự do (`length = custom`): 4–20 trang, 0–6 điểm dừng có chấm,
  tối đa 1 điểm dừng mỗi trang, không đặt sau trang 1, `reflection` chỉ ở cuối.
- Bốn kiểu điểm dừng: nhận diện cảm xúc, đặt mình vào vị trí người khác, giải quyết tình huống,
  liên hệ bản thân (không chấm).
- Nhận diện cảm xúc dùng **bộ 5 cảm xúc cố định**: vui, buồn, giận, sợ, bình thường.
- Giải quyết tình huống có **3 phương án theo 3 vai cố định**: xây dựng, né tránh, bốc đồng.

**Tạo truyện**
- Hai chế độ dùng chung một editor: **Viết giúp tôi** (AI viết cả truyện **một lần**, phụ huynh
  sửa tay nếu cần) và **Tự viết** (hoàn toàn thủ công, không dùng AI cho chữ).
- Không có AI viết lại từng trang hay điền từng điểm dừng — để chi phí mỗi truyện cố định.
  Sinh lại cả truyện tính như một lần tạo mới.
- Không có bước dàn ý trước.
- Phụ huynh chọn nhân vật bằng danh sách tích — **không có ô gán vai**.
- Đầu vào: con, nhân vật, **bài học** (gắn 1 năng lực CASEL), chuyện thật (tuỳ chọn), độ dài,
  cờ `use_ai_image`, `use_tts`.

**Độ dài**
- Đếm theo **tiếng** (tách khoảng trắng). Mỗi trang mục tiêu 40–60, tối đa 70, tối thiểu 20.
- Mỗi câu tối đa 15 tiếng. Giới hạn cho câu hỏi, phương án, gợi ý, phản hồi: xem docs 03.
- Con số do backend gửi trong request; service không viết cứng.

**Nhân vật và tên thật**
- Backend thay tên bằng `{NV1}`, `{NV2}`… kèm mô tả không có tên. Gemini không thấy tên thật.
- Chữ lưu kèm token; tên thật chỉ thay vào ở backend khi hiển thị và khi gửi TTS.

**Tranh**
- Tối đa 4 cảnh mỗi truyện; AI gom trang thành cảnh; mỗi cảnh 1 ảnh.
- Chân dung nhân vật (sinh 2 phương án, phụ huynh chọn 1) làm ảnh tham chiếu.
- Lớp adapter theo runtime, model là dữ liệu cấu hình (docs 06).
- Không nhận ảnh upload từ người dùng.

**Giọng đọc**
- VieNeu-TTS tự host, nhận chữ đã thay tên thật. Không log chữ.

**Chi phí** *(backend làm)*
- Chỉ bán gói; mỗi gói cấp credit theo tháng. Mỗi loại `ai_request_type` có đơn giá credit.
- Service chỉ trả `usage`; không biết credit, không trừ tiền.

**EQ** *(backend làm, service chỉ cần biết để không lấn sân)*
- Chấm theo 5 năng lực CASEL; chỉ lần chọn đầu của lần chơi đầu; tính trên toàn bộ lịch sử.
- Service **không** nhận, không tính, không trả điểm.

## Đang mở — dừng lại hỏi nếu đụng tới

- Chọn bộ phân loại an toàn ảnh cụ thể cho model mã nguồn mở.
- Server ComfyUI có GPU đặt ở đâu.
- Tài khoản Gemini có dùng được model ảnh qua API không (có thể cần bật thanh toán).
- Hệ số `TOKENS_PER_WORD` — cần đo thực tế.

## Đã bỏ — không đưa trở lại

| Đã bỏ | Lý do |
|---|---|
| Cây rẽ nhánh 3 chặng × 3 hệ quả | ~40% nội dung trẻ không bao giờ thấy |
| Khuôn sư phạm có chặng, loại lựa chọn, điểm riêng | Moderator quá tải; thay bằng danh sách bài học |
| Ô trống `{CON}`/`{EM}` gắn vai, `character_role` | Thay bằng danh sách tích + token `{NVx}` |
| Sprite nhân vật ghép lên nền | Thay bằng AI vẽ cả cảnh với ảnh tham chiếu |
| Nhiệm vụ đời thực | Nhóm quyết định bỏ |
| Audiobook tổng hợp | Không còn trong phạm vi |
| BullMQ / Redis | Backend dùng bảng `ai_requests` làm hàng đợi |
| Kid Mode mặc định không chữ | Kid Mode hiện tranh + chữ + giọng đọc nếu bật |
| Mức đọc theo tuổi | Phụ huynh tự quyết qua cờ `use_tts` |
| Cá nhân hoá lại sau khi mua | Người mua dùng bản đăng bán nguyên trạng |
| Bước dàn ý trước khi viết | Không cần |
| AI sinh truyện theo từng lượt chơi | AI chỉ chạy lúc tạo truyện |
| Model ảnh chạy local trên máy dev | Máy không có GPU |
| AI viết lại một trang / điền một điểm dừng | Khó kiểm soát chi phí |
| Chế độ giờ ngủ (bedtime) | Nhóm quyết định bỏ |
| Thông báo trong app | Thay bằng trạng thái trên giao diện + email |
| Gói credit mua lẻ, chuyển doanh thu sang credit | Credit chỉ đến từ gói |
