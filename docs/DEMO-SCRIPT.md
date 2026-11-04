# Kịch bản demo / test toàn bộ luồng (production)

Chạy trên `https://storyweaver.id.vn` (Web) + `https://api.storyweaver.id.vn` (API). Đi theo thứ tự: mỗi phần dùng
dữ liệu tạo ở phần trước. Đánh dấu `[x]` khi xong; ghi lỗi vào cột cuối của bảng "Sự cố" ở cuối file.

> **Đây là môi trường thật:** thanh toán trừ tiền thật, email gửi thật, AI tốn quota thật. Đọc mục 0 trước khi bắt đầu.

---

## 0. Chuẩn bị

### 0.1 Tài khoản

| Ký hiệu | Vai trò | Tài khoản | Ghi chú |
|---|---|---|---|
| **P1** | Phụ huynh – **người bán** | Đăng ký mới ở mục 1 (email thật của bạn) | Cần **gói Gia đình** mới bán được → 1 lần trả tiền thật (49.000đ) |
| **P2** | Phụ huynh – **người mua** | `me_lanhuong` hoặc đăng ký mới (email thứ hai) | Gói Miễn phí là đủ |
| **S** | Chuyên gia sư phạm | `kdv_demo` | Duyệt người bán, duyệt truyện, giám sát |
| **A** | Admin | `admin_demo` | Cấu hình, tài chính, kháng nghị |

Mật khẩu demo mặc định `123456` — **nếu đã đổi sau deploy thì dùng mật khẩu mới**. Mở mỗi vai trò ở **một trình duyệt /
cửa sổ ẩn danh riêng** để khỏi đăng xuất qua lại.

### 0.2 Chỉnh tạm cấu hình để demo không phải chờ (Admin → Gói & cấu hình)

| Cấu hình | Mặc định | Đặt tạm khi demo | Vì sao |
|---|---|---|---|
| `market.refund_window_days` | 3 | **1** | Phải ≤ số ngày giữ doanh thu (đặt cái này trước) |
| `market.earning_hold_days` | 3 | **1** | Thấp nhất cho phép là 1 ngày. Ngày mở khoá chốt **lúc mua** — đặt xong rồi mới mua |
| `market.min_withdrawal_vnd` | 50.000 | **10.000** | Thấp nhất cho phép; truyện 15.000đ → người bán nhận 12.000đ là rút được |
| `moderation.report_threshold` | 3 | **1** | Một báo cáo đã đủ tự tạm gỡ truyện |

**Nhớ trả lại mặc định ở mục 16.**

### 0.3 Việc phải làm trước ít nhất 24 giờ

- Sau khi đặt cấu hình mục 0.2: P1 đăng bán truyện 15.000đ, P2 **mua trước 1 ngày** (để demo rút tiền); thêm 1 lượt
  mua nữa nếu muốn demo hoàn tiền (hoàn tiền phải trong 1 ngày từ lúc mua).
- P1 cần **khai tài khoản ngân hàng nhận tiền trước 24 giờ** (đổi tài khoản → chặn rút tiền 24 giờ). Nếu demo trong ngày,
  làm mục 7.1 + khai ngân hàng (mục 10.1) từ hôm trước.

### 0.4 Theo dõi log trong lúc test (cửa sổ SSH máy chủ)
```bash
cd ~/storyweaver && docker compose logs -f --tail 30 api worker ai
```

---

## 1. Tài khoản (P1)

- [ ] **Đăng ký** (Trang chủ → Đăng ký): họ tên, tên đăng nhập, email thật, mật khẩu → vào thẳng trang phụ huynh.
  Kiểm: gói **Miễn phí**, **3 credit**.
- [ ] **Xác thực email:** mở email "Mã xác thực" → dán mã vào hộp *Xác thực email* → trạng thái đã xác thực.
- [ ] **Đăng xuất → đăng nhập lại** bằng *tên đăng nhập*, rồi bằng *email*.
- [ ] **Quên mật khẩu:** đăng xuất → *Quên mật khẩu* → nhập email → dán mã trong email → đặt mật khẩu mới → đăng nhập.
- [ ] **Đổi mật khẩu** trong Cài đặt.
- [ ] (Lỗi) Đăng ký trùng email / tên đăng nhập → báo lỗi rõ ràng.

## 2. Hồ sơ gia đình (P1)

- [ ] **Thêm bé** (Các bé → Thêm): tên, **ngày sinh** (5–8 tuổi để lọc kỹ năng theo tuổi), mô tả ngoại hình.
- [ ] **Thêm nhân vật** (Nhân vật gia đình): ví dụ "Bà", mô tả ngoại hình.
- [ ] **Tạo chân dung AI** cho bé và một nhân vật → trừ **1 credit / chân dung** → vài chục giây sau có ảnh.
- [ ] Sửa / xoá một nhân vật thử.

## 3. Gói & credit (P1)

- [ ] Trang **Gói**: thấy giá credit theo độ dài truyện, giá tranh.
- [ ] **Mua gói Gia đình (tháng)** → nút **Thanh toán** → trang thanh toán VietQR → quét bằng app ngân hàng, trả **49.000đ**
  → tự quay về trang kết quả → **"Thanh toán thành công"**.
  Kiểm: gói **Gia đình**, credit = credit cũ + **20**.
- [ ] **Lịch sử thanh toán:** có dòng gói vừa mua, mã đơn, ngày.
- [ ] **Lịch sử credit:** có dòng "Cấp credit tháng — Gói Gia đình", các dòng trừ credit chân dung ở mục 2.
- [ ] Nút **"Gia hạn thêm 1 tháng"** hiện trên gói đang dùng + ngày hết hạn mới. *(Không bấm trả tiền lần nữa nếu không cần.)*
- [ ] (Tuỳ) Admin kiểm webhook: Admin → Doanh thu → đối soát → "Mọi đơn đã trả đều có webhook hợp lệ".

## 4. Tạo truyện (P1)

### 4.1 Chuyện mẫu (AI viết)
- [ ] Sáng tác → **Chuyện mẫu** → chọn một chuyện mẫu hợp tuổi → chọn nhân vật (bé là nhân vật chính) → độ dài **Ngắn**.
- [ ] Bật **Tranh minh họa bằng AI** → thấy khung báo **đủ / chỉ đủ N cảnh / không có tranh** theo credit còn lại.
- [ ] Đặt tên → **Tạo** → trừ credit chữ → AI viết **1–3 phút** → tranh vẽ dần từng cảnh, giọng đọc chạy nền.

### 4.2 Kể chuyện nhà mình
- [ ] **Kể chuyện nhà mình** → chọn nhân vật → kể một chuyện thật (vài câu) → **Xem bé sẽ tập gì** (10–30 giây, không trừ credit).
- [ ] Màn xác nhận: khoảnh khắc khó, tình tiết AI thêm, **1–2 kỹ năng** gợi ý → thử **Đổi kỹ năng** → **Tạo truyện**.
- [ ] Thử **"Chỉ kể truyện, không chấm điểm"** ở một truyện khác (chỉ có câu suy ngẫm cuối).

### 4.3 Tự viết
- [ ] **Tự viết** → không tốn credit → viết 4+ trang, thêm điểm dừng (không đặt sau trang 1; câu liên hệ bản thân chỉ ở cuối).

### 4.4 Sửa truyện (trang sửa truyện)
- [ ] Sửa chữ một trang, sửa câu hỏi / gợi ý / phương án một điểm dừng.
- [ ] Điểm dừng có chấm (từ mẫu): **không** đổi được dạng câu / vai / đáp án đúng – sai (khoá theo mẫu).
- [ ] Thêm / xoá trang (truyện tự viết).
- [ ] **Chọn ảnh bìa** từ một cảnh khác.
- [ ] **Vẽ lại một cảnh** (trừ 1 credit). Nếu hết credit: thấy khung **"N cảnh chưa có tranh — Vẽ tiếp"**.
- [ ] Giọng đọc: chờ "Giọng đọc đã sẵn sàng"; đoạn lỗi thì bấm **Thử lại**.
- [ ] **Hoàn tất** (bắt buộc lướt hết trang + điểm dừng) → **đưa lên giá sách** của bé.

## 5. Kid Mode (P1)

- [ ] Cài đặt → **đặt PIN thoát Kid Mode** (4–6 số).
- [ ] Các bé → **Vào Kid Mode** → chỉ thấy giá sách của bé.
- [ ] Mở truyện → nghe từng trang, **Nghe lại trang này**, bật / tắt tiếng.
- [ ] Ở điểm dừng chấm: **chọn sai lần đầu** → nghe gợi ý → chọn lại. Câu chọn cách xử lý: thấy câu hệ quả.
- [ ] Đọc hết → màn chúc mừng → truyện đánh dấu "Đã đọc xong — đọc lại nhé".
- [ ] Gõ đường dẫn trang phụ huynh (vd. `/parent/billing`) → bị đẩy về giá sách.
- [ ] **Thoát:** nhập PIN **sai** → "Còn 4 lần thử"… → nhập **đúng** → về trang phụ huynh.
  *(Không thử sai đủ 5 lần trừ khi muốn demo khoá — sẽ bị khoá 15 phút.)*

## 6. Báo cáo EQ (P1)

- [ ] Các bé → **Báo cáo EQ**: radar 5 năng lực, mức từng kỹ năng con + số câu ("Chưa đủ dữ liệu" nếu < 3 câu).
- [ ] Gợi ý trò chuyện với bé, **Chuyện mẫu nên đọc tiếp** → bấm một gợi ý → mở trang tạo truyện chọn sẵn chuyện mẫu.
- [ ] Hành trình theo tuần (xu hướng).

## 7. Đăng ký bán & đăng bán (P1 + S)

### 7.1 Hồ sơ người bán
- [ ] P1: **Bán truyện** → điền biệt danh, giới thiệu → **Gửi hồ sơ**.
- [ ] S: **Duyệt người bán** → duyệt P1.
- [ ] P1: thấy "Ba mẹ là người bán" → **Sửa hồ sơ** (đổi biệt danh) → **Xem trang công khai**.

### 7.2 Đăng bán truyện
- [ ] P1: mở truyện đã hoàn tất → **Đăng bán** → tên trên Chợ, mô tả, **giá** (thử 1 truyện **Miễn phí**, 1 truyện **15.000đ**),
  **tên chung** cho từng nhân vật (không dùng tên thật — thử nhập tên thật để thấy bị chặn).
- [ ] Truyện có giọng đọc: chờ hệ thống đọc lại bằng tên chung (vài phút) — trạng thái giọng đọc ở danh sách.

### 7.3 Kiểm duyệt (S)
- [ ] Hàng chờ → **Nhận bài** → xem từng trang (nhãn **AI viết, chưa chỉnh sửa / đã chỉnh sửa / Người viết**, dòng tổng hợp).
- [ ] Ghi nhận xét một trang → **Yêu cầu sửa** (bắt buộc nhận xét) → P1 thấy nhận xét → sửa truyện gốc → đăng lại.
- [ ] Lần duyệt sau: xem **100% trang**, tick đủ checklist → **Duyệt & xuất bản**.
- [ ] (Lỗi) Bấm duyệt khi chưa xem hết trang → bị chặn.

## 8. Chợ truyện & mua (P2)

- [ ] **Chợ truyện:** tìm theo tên, lọc năng lực / tuổi / giá / có giọng đọc, sắp xếp bán chạy / đánh giá / mới / giá.
- [ ] Mở truyện của P1 → **khung người bán** → **Xem hồ sơ** → trang hồ sơ: lượt bán, điểm, các truyện.
- [ ] **Nhận miễn phí** truyện 0đ → có ngay → đưa lên giá sách bé của P2.
- [ ] **Mua 15.000đ** truyện còn lại → trả tiền thật → trang kết quả thành công.
- [ ] P1: Bán truyện → Doanh thu: khoản 80% vào **chờ** (sang **rút được** sau 1 ngày, job chạy mỗi ~15 phút — vì vậy phải mua trước buổi demo ít nhất 1 ngày, xem 0.3).
- [ ] P2 cho bé đọc hết truyện (Kid Mode) → **Đánh giá** sao + nhận xét + thẻ.
- [ ] P1 **trả lời** đánh giá (một lần).
- [ ] (Lỗi) Đánh giá khi bé chưa đọc hết → bị chặn; P1 mua truyện của chính mình → bị chặn.

## 9. Phiên bản truyện (P1 + S + P2)

- [ ] P1: sửa truyện gốc của truyện đang bán → hoàn tất → Bán truyện → **Cập nhật phiên bản** (form điền sẵn) → gửi.
- [ ] Danh sách: bản cũ vẫn **Đang bán** + dòng "Đang có phiên bản mới chờ duyệt".
- [ ] S: duyệt bản mới (nhãn **Phiên bản mới**).
- [ ] P2: giá sách của bé tự sang bản mới; chợ hiện bản mới với **lượt mua / đánh giá giữ nguyên**; P1 thấy bản cũ
  "Đã thay bằng phiên bản mới".

## 10. Doanh thu & rút tiền (P1 + A)

- [ ] 10.1 P1: Doanh thu → **khai tài khoản ngân hàng** (số hiện dạng che `******1234`). *(Làm trước 24 giờ — mục 0.3.)*
- [ ] 10.2 P1: **Yêu cầu rút** số tiền ≥ mức tối thiểu → số dư chuyển sang "đang rút".
- [ ] 10.3 A: **Rút tiền người bán** → thấy số tài khoản đầy đủ, **mã VietQR** → chuyển khoản bằng app → **Đã chuyển khoản**
  (nhập mã giao dịch) → P1 thấy "Đã chuyển".
- [ ] (Tuỳ) Thử **Từ chối** một yêu cầu khác (bắt buộc lý do) → tiền trả lại số dư P1.

## 11. Hoàn tiền (P2 + A)

- [ ] P2: Gói → Lịch sử thanh toán → **Yêu cầu hoàn tiền** truyện 15.000đ (trong 1 ngày) → nhập lý do.
- [ ] A: **Hoàn tiền** → xem ảnh hưởng → chuyển trả tay → **Duyệt** (nhập mã giao dịch) → P2 mất quyền đọc truyện đó,
  doanh thu P1 bị trừ. *(Hoặc Từ chối kèm ghi chú.)*

## 12. Giám sát sau xuất bản (P2 + S + P1 + A)

- [ ] P2: **Báo cáo** truyện của P1 (chọn lý do, trang) → với ngưỡng 1 (mục 0.2) truyện **tự tạm gỡ** khỏi chợ.
- [ ] S: hàng chờ có lượt **hậu kiểm** → **Giữ truyện** (bán lại) *hoặc* **Gỡ hẳn & cảnh cáo**.
- [ ] P1: thấy **cảnh cáo** → **Kháng nghị** (≥ 20 ký tự).
- [ ] A: **Kháng nghị** → chấp nhận / bác.
- [ ] S: báo cáo một **đánh giá** → xử lý (ẩn đánh giá).
- [ ] S: **Kiểm tra ngẫu nhiên** — hệ thống tự chọn 3 truyện mỗi tuần (không bấm tạo được); nếu đã có lượt thì duyệt như hậu kiểm.
- [ ] S: **Cảnh báo dùng AI** → tạm khoá AI của một phụ huynh test → phụ huynh đó tạo truyện AI bị báo khoá; mở khoá lại.
- [ ] S: **Soát câu hỏi AI** → gắn cờ loại một điểm dừng khỏi thống kê (kèm lý do) → bỏ cờ.
- [ ] S: **Từ khoá cấm** → thêm một từ → P1 kể chuyện / viết trang có từ đó → bị chặn → xoá từ.

## 13. Thư viện sư phạm (S)

- [ ] **Kỹ năng con:** sửa tên / mô tả tiếng Việt / độ tuổi, tắt / bật một kỹ năng (không thêm / xoá được).
- [ ] **Mẫu câu hỏi:** lọc theo năng lực → **Thêm mẫu**: chọn năng lực → kỹ năng con → dạng trả lời (nhãn "gợi ý") →
  soạn → **Lưu nháp** → **Ban hành**. Sửa mẫu đã ban hành → tạo **phiên bản mới**. **Nhân bản** một mẫu.
- [ ] **Chuyện mẫu:** tạo chuyện mẫu mới (năng lực, 1–3 kỹ năng con, độ tuổi, hướng dẫn) → P1 thấy trong "Chuyện mẫu".
- [ ] **Tham số báo cáo:** xem (không đổi trên prod nếu không cần).

## 14. Admin (A)

- [ ] **Tài khoản:** tìm P1/P2; tạo một tài khoản Specialist mới; khoá rồi mở lại một tài khoản test.
- [ ] **Gói & cấu hình:** sửa thử giá hiển thị một gói (rồi trả lại); xem nhóm `market.*`, `moderation.*`.
- [ ] **Cấu hình AI:** giá credit theo loại.
- [ ] **Doanh thu:** số đơn, doanh thu gói + hoa hồng, xuất CSV; **đối soát** cuối trang.
- [ ] **Nhật ký thao tác:** có các thao tác vừa làm (duyệt hoàn tiền, rút tiền, kháng nghị…).

## 15. Kiểm tra phi chức năng nhanh

- [ ] Kid Mode lật trang < 1 giây (không gọi AI).
- [ ] Mở link ảnh / audio trực tiếp ngoài app → chỉ mở được bằng link có chữ ký.
- [ ] Đang ở Kid Mode, gọi API của phụ huynh bằng token Kid Mode → bị từ chối (403).
- [ ] Giao diện điện thoại (thu nhỏ trình duyệt): các trang phụ huynh dùng được.

## 16. Dọn dẹp sau test

- [ ] A: trả lại `market.earning_hold_days = 3`, `market.refund_window_days = 3`, `market.min_withdrawal_vnd = 50000`, `moderation.report_threshold = 3`.
- [ ] Truyện test trên chợ: S **gỡ** nếu không muốn để lại.
- [ ] Tiền thật: đã hoàn trả các khoản test (hoàn tiền mục 11 / chuyển khoản rút tiền mục 10 là tiền của nhóm).
- [ ] Backup DB sau demo (`DEPLOY-UPDATE.md` mục 6).

---

## Sự cố ghi nhận

| # | Mục | Mô tả lỗi | Ảnh / log | Mức |
|---|---|---|---|---|
| 1 | | | | |
