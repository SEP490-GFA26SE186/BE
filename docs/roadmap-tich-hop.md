# Lộ trình tích hợp Web – BE – AI theo phase

*Đề xuất 2026-10-17. Còn ~6 tuần tới hạn 01/12/2026. Phân công người làm là việc của nhóm / leader —
cột "Ai làm" để trống cho nhóm điền.*

## Hiện trạng (rà ngày 2026-10-17)

| Phần | Đã có | Chưa có / đang hỏng |
|---|---|---|
| **Web** (React + Vite, `Web/`) | Giao diện cơ bản mọi vai trò; gọi API đăng nhập; trang Children, Library, Marketplace, Kid reader, Moderator, Admin | Hầu hết service còn trả dữ liệu mock (`src/mocks`); **chưa có trang tạo truyện / editor / review** |
| **BE `api/`** | auth, children, characters, stories (tạo, sinh AI qua BullMQ, editor, review), topics, wallets, reports, platform | Module còn viết theo **schema cũ**: `content-library`, `templates`, `notifications` (đã bỏ ở rev8), `orders`, `plans` (dùng `creditPack` đã bỏ), `reading-sessions` (dùng `playDecision`, `eqScore`…), `bookshelf` / `marketplace` (dùng field cũ) |
| **AI `ai/`** | Sinh chữ: Claude (API cho production, CLI cho dev), Gemini còn trong code; prompt nhắm 40–60 tiếng/trang; timeout 150 s / 320 s | Ảnh: tạm dừng (SD 1.5 trên CPU không vẽ đúng nhân vật). TTS: đã có thiết kế (`ai/docs/superpowers/specs/2026-10-17-tts-narration-design.md`), chưa làm |
| **App** (`App/`) | — | Repo trống |

## Nguyên tắc chung

- Mỗi phase kết thúc bằng **một luồng chạy thật từ Web → BE → AI**, demo được, không dùng mock ở
  đoạn đó. Phase sau không bắt đầu khi phase trước chưa chạy trọn.
- Hợp đồng API giữa Web và BE lấy từ Swagger `/api/v1/docs`; đổi hợp đồng thì sửa Swagger trong cùng
  lần sửa (giống luật `docs/contracts/ai-service.md` giữa BE và AI).
- Web chuyển từng service từ mock sang API thật theo phase; mock chỉ còn cho phần chưa tới lượt.
- Môi trường dev chung: `docker compose` (api + worker + redis + ai) + Web `vite` trỏ `VITE_API_URL`
  vào api. AI chạy `claude_code` trên máy dev; có key thì `claude`.

---

## Phase 0 — Nền tích hợp *(tuần 1: 17–24/10)*

**Mục tiêu:** cả nhóm chạy được cùng một môi trường; không còn code chạy theo schema cũ mà không ai
biết.

| Repo | Việc | Ai làm |
|---|---|---|
| BE | Commit / merge các thay đổi AI đang treo (Claude provider, `limits.page_target_*`, timeout). Chạy lại seed `platform_settings` trên DB dev. | |
| BE | **Quyết định từng module schema cũ:** xoá `notifications`, `templates`, `content-library` (đã bỏ ở rev8); đánh dấu `orders`, `plans`, `reading-sessions`, `bookshelf`, `marketplace` là "sửa ở phase X" bên dưới, tạm tắt route nào đang lỗi để không ai gọi nhầm. | |
| BE | Seed dữ liệu demo đủ chạy luồng: tài khoản theo `Web/docs/DEMO_ACCOUNTS.md`, chủ đề, gói Miễn phí. | |
| Web | `api.js`: một base URL + token; cờ `VITE_USE_MOCK` theo từng service để chuyển dần. | |
| Chung | README "chạy cả hệ thống" một trang: lệnh compose, env tối thiểu, tài khoản demo. | |

**Xong khi:** một thành viên mới clone 3 repo, làm theo README, đăng nhập Web bằng tài khoản demo và
gọi được API thật.

---

## Phase 1 — Phụ huynh tạo truyện bằng AI *(tuần 1–2: 20/10–31/10)* — luồng 1 + 2

**Mục tiêu demo:** phụ huynh chọn con, nhân vật, bài học, độ dài, kể chuyện thật → AI viết → phụ
huynh xem, sửa, bấm hoàn tất.

| Repo | Việc | Ai làm |
|---|---|---|
| Web | Trang **tạo truyện** (form theo `POST /stories`), màn hình **đang sinh** (poll trạng thái job, hiện lỗi tiếng Việt + nút thử lại), **editor** trang + điểm dừng (theo `stories.editor`), nút **hoàn tất** (`review`). | |
| Web | Children / characters chuyển sang API thật (BE đã có). | |
| BE | Rà các endpoint stories mà Web cần, bổ sung chỗ thiếu; kiểm credit giữ / hoàn khi sinh lỗi. | |
| AI | Không đổi chức năng. Chốt nguồn chạy cho demo: `claude_code` trên laptop demo, hoặc có `ANTHROPIC_API_KEY` thì `claude` (đo 20 trang với `between_tools`, hạ timeout nếu nhanh hơn). | |

**Xong khi:** trên Web, tạo một truyện 8 trang và một truyện 20 trang thành công, sửa một trang, bấm
hoàn tất; credit trừ đúng.

---

## Phase 2 — Giọng đọc *(tuần 2–3: 27/10–07/11)*

**Mục tiêu demo:** bấm hoàn tất → hệ thống đọc cả truyện (giọng Kim Thanh) → phụ huynh thấy tiến độ →
đủ audio thì truyện mới lên giá sách.

| Repo | Việc | Ai làm |
|---|---|---|
| AI | TTS VieNeu v3 Turbo theo spec TTS (mục 4): chuẩn hoá chữ, provider, MP3, một luồng sinh, `try_tts.py`. | |
| BE | Narration theo spec TTS (mục 5): bảng đoạn đọc + vân tay, queue narration concurrency 1, kích hoạt ở review, hàm "sẵn sàng cho trẻ", tiến độ trong chi tiết truyện, thử lại. Không tính credit. | |
| BE | **Sửa `bookshelf` theo rev8** rồi gắn cổng "sẵn sàng cho trẻ" vào `addToBookshelf` (spec TTS mục 8). | |
| Web | Thanh tiến độ giọng đọc sau khi hoàn tất; nút thử lại; chặn "đưa lên giá sách" khi chưa sẵn sàng. | |

**Xong khi:** truyện 8 trang có đủ audio trong ~3 phút trên laptop demo; truyện chưa đủ audio không
lên giá sách được.

---

## Phase 3 — Trẻ học qua truyện *(tuần 3–4: 03/11–14/11)* — luồng 5

**Mục tiêu demo:** trẻ mở truyện ở Kid Mode, nghe đọc từng trang, trả lời điểm dừng (chọn sai → gợi ý
→ chọn lại → nói đáp án), phụ huynh xem báo cáo EQ.

| Repo | Việc | Ai làm |
|---|---|---|
| BE | **Viết lại `reading-sessions` theo rev8** (lượt đọc, câu trả lời điểm dừng, chỉ lần chọn đầu của lần chơi đầu được chấm, điểm theo 5 năng lực CASEL); gắn cổng "sẵn sàng cho trẻ" lúc bắt đầu lượt đọc. | |
| BE | Seed `ui_audio_assets` (đáp án cảm xúc, câu nhắc chọn lại) bằng narration. | |
| Web | Kid reader dùng API thật: tranh (hoặc ảnh giữ chỗ), chữ, phát audio, điểm dừng theo 4 kiểu; trang báo cáo EQ cho phụ huynh. | |

**Ảnh — đã chốt 2026-10-17: BỎ QUA luồng sinh ảnh** (người dùng: "bỏ qua luồng sinh ảnh đi"). Truyện
chạy với `use_ai_image = false` và ảnh giữ chỗ; không làm M4a/M4b. Code mock ảnh hiện có giữ nguyên,
không phát triển thêm.

**Xong khi:** một bé chơi hết truyện trên Web có giọng đọc, câu trả lời được lưu, báo cáo EQ hiện điểm.

---

## Phase 4 — Gói, đăng bán, kiểm duyệt, mua *(tuần 4–5: 10/11–21/11)* — luồng 3, 4, 6

**Mục tiêu demo:** phụ huynh mua gói → nhận credit; đăng bán một truyện → Moderator duyệt → phụ huynh
khác mua → truyện vào giá sách của con họ.

| Repo | Việc | Ai làm |
|---|---|---|
| BE | **Sửa `plans`** theo rev8 (gói cấp credit theo tháng, không `creditPack`); thanh toán payOS (hoặc giả lập cho demo — nhóm quyết). | |
| BE | **Sửa `marketplace`, `moderation`, `orders`** theo rev8: gỡ cá nhân hoá khi đăng bán, bản sao để trống audio và `use_tts = false` (spec TTS mục 7), người mua dùng nguyên trạng. | |
| Web | Trang gói / ví; luồng đăng bán; Moderator duyệt bằng API thật; Marketplace mua. | |

**Xong khi:** chạy trọn chuỗi mua gói → đăng bán → duyệt → mua → đọc, không mock.

---

## Phase 5 — Ảnh, giám sát, hoàn thiện *(tuần 5–6: 17/11–01/12)* — luồng 7

| Repo | Việc | Ai làm |
|---|---|---|
| AI + BE + Web | **Ảnh** nếu Phase 3 chốt có GPU: lớp adapter (M4a) + profile ComfyUI, chân dung nhân vật, tranh cảnh, safety checker. | |
| BE + Web | **Moderator — nội dung:** soạn bài học (CRUD; bài đã có truyện thì khoá năng lực CASEL, xoá thành ngưng dùng), quản lý từ khoá chặn (`block` chặn hẳn cả chữ AI lẫn chữ phụ huynh tự viết / sửa, `warn` chỉ cảnh báo). *Đã xong.* | |
| BE + Web | **Moderator — giám sát (luồng 7):** báo cáo vi phạm (đủ 3 người / 24 giờ → tự tạm gỡ), hậu kiểm giữ / gỡ hẳn, cảnh cáo tác giả (3 cảnh cáo → khoá bán) + kháng nghị (Admin xét), kiểm tra ngẫu nhiên hằng tuần. *Đã xong.* | |
| BE + Web | **Admin:** tài khoản (khoá, tạo KDV), gói + bậc giá, cấu hình (chi phí AI, chợ, giám sát), hoàn tiền (chuyển trả thủ công), báo cáo doanh thu / chi phí AI / lãi lỗ, đối soát sổ cái, nhật ký. *Đã xong.* | |
| Chung | Deploy bản demo, kiểm NFR, sửa lỗi, tài liệu báo cáo cuối, dự phòng ~1 tuần. | |

---

## Quyết định nhóm cần chốt

1. **Ảnh có GPU hay không** — trước Phase 3 (quyết định phạm vi lớn nhất còn lại).
2. **Nguồn chạy AI chữ khi demo / chấm**: CLI trên laptop (miễn phí, chỉ dev) hay API key (trả tiền,
   đúng production).
3. **Thanh toán**: payOS thật hay giả lập trong demo.
4. **App mobile** (`App/` đang trống): làm hay bỏ khỏi phạm vi 6 tuần còn lại.
5. Phân công người cho từng dòng "Ai làm".
