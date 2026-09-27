# 00 — Tổng quan sản phẩm

StoryWeaver AI là đồ án tốt nghiệp SEP490 / SE186: nền tảng **C2C** để phụ huynh tạo truyện
tranh tương tác cá nhân hoá cho con 5–8 tuổi, giáo dục trí tuệ cảm xúc (EQ) theo khung
**CASEL** (5 năng lực). Phụ huynh có thể đăng bán truyện; Moderator duyệt trước khi xuất bản.

## Vai trò

| Vai trò | Làm gì |
|---|---|
| Parent | Tạo nhân vật gia đình, tạo truyện cho con, mua truyện, xem báo cáo EQ |
| Người bán | Parent đã được duyệt đơn bán: đăng bán truyện, nhận doanh thu |
| Child | Không có tài khoản; chơi truyện trong Kid Mode do phụ huynh mở |
| Moderator | Quản lý danh sách bài học, duyệt truyện đăng bán, xử lý báo cáo |
| Admin | Tài khoản, cấu hình giá/gói/AI, duyệt rút tiền, đối soát |

## Bảy core flow

1. **Tạo truyện cho con** — chọn con, nhân vật, bài học; AI viết giúp hoặc tự viết; xem lại.
2. **AI viết và vẽ** *(flow AI — phạm vi chính của service này)*.
3. **Đăng bán và kiểm duyệt** — gỡ cá nhân hoá, Moderator duyệt.
4. **Mua truyện** — người mua dùng bản đăng bán nguyên trạng.
5. **Học qua truyện** — trẻ chơi, trả lời điểm dừng, hệ thống chấm EQ.
6. **Ví và rút tiền** — gói tháng, credit, doanh thu người bán.
7. **Giám sát nền tảng** — báo cáo, tạm gỡ, cảnh cáo, kiểm tra ngẫu nhiên.

## Service này nằm ở đâu

```
Frontend ─▶ Backend Node.js ─(HTTP nội bộ)─▶ AI Core Service (repo này) ─▶ Gemini / VieNeu / ComfyUI
               │
               ├─ PostgreSQL (truyện, hàng đợi ai_requests, ví…)
               └─ Object storage (ảnh, audio)
```

Backend dựng khung truyện, che tên, quản lý hạn mức và hàng đợi, lưu file. Service này chỉ
nhận một tác vụ, gọi AI, kiểm tra, trả kết quả.
