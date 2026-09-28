# Hướng dẫn đọc schema — rev 8

49 bảng, chia 8 khối. Khoảng 15 bảng là xương sống; phần còn lại là danh mục cấu hình, bảng nối
và nhật ký. File DBML: `schema_rev8.dbml` — dán vào dbdiagram.io để xem ERD.

## 1. Tám khối

| Khối | Trả lời câu hỏi | Bảng chính | Bảng phụ |
|---|---|---|---|
| **Tài khoản** (5) | Ai dùng app, con là ai, nhà có nhân vật nào? | `users`, `child_profiles`, `characters` | `auth_tokens`, `child_usage_sessions` |
| **Thư viện nội dung** (6) | Moderator/Admin chuẩn bị sẵn gì? | `topics` | `eq_skills`, `backgrounds`, `ui_audio_assets`, `blocked_keywords`, `checklist_items` |
| **Truyện** (7) | Một truyện gồm những gì? | `stories`, `story_pages`, `story_checkpoints` | `story_characters`, `story_scenes`, `checkpoint_options`, `bookshelf_items` |
| **Học** (3) | Trẻ đã trả lời gì, điểm EQ ra sao? | `play_sessions`, `checkpoint_answers` | `eq_competency_stats` |
| **AI** (2) | Đã gọi AI bao nhiêu, tốn bao nhiêu? | `ai_requests` | `prompt_templates` |
| **Chợ truyện** (7) | Truyện nào đang bán, ai đã mua, đánh giá ra sao? | `listings`, `entitlements`, `product_reviews` | `seller_profiles`, `price_tiers`, `cart_items`, `product_review_tags` |
| **Tiền** (12) | Ai trả bao nhiêu, ví còn bao nhiêu? | `orders`, `order_items`, `subscriptions`, `wallets`, `wallet_ledger` | `plans`, `vouchers`, `voucher_usages`, `refund_requests`, `webhook_logs`, `withdrawal_requests`, `platform_settings` |
| **Kiểm duyệt** (7) | Ai duyệt, ai bị báo cáo, ai làm gì? | `moderation_reviews`, `content_reports` | `review_checklist_results`, `review_page_views`, `creator_strikes`, `strike_appeals`, `admin_audit_logs` |

## 2. Đi theo một hành trình

**Mẹ An bắt đầu**
1. Đăng ký → `users`; đăng nhập → `auth_tokens`; ví rỗng → `wallets`; gói Miễn phí → `subscriptions`,
   cấp credit tháng đầu → `wallet_ledger` (`credit_grant`).
2. Tạo hồ sơ bé An → `child_profiles`.
3. Tạo nhân vật An, Bin, Mẹ → `characters`; AI vẽ chân dung → `ai_requests` (`character_portrait`),
   trừ credit → `wallet_ledger`.

**Tạo truyện**
4. Chọn bài học "Con hay nổi giận" → đọc `topics`.
5. Hệ thống tạo `stories` (`private`, `length = medium`), gắn nhân vật + token `{NV1}`… →
   `story_characters`, dựng 8 trang → `story_pages`, 4 điểm dừng → `story_checkpoints`.
6. "Viết giúp tôi" → một `ai_requests` (`story_text`) → điền chữ trang, cảnh (`story_scenes`),
   câu hỏi và phương án (`checkpoint_options`).
7. Xem lại xong → `stories.reviewed_at`; hệ thống vẽ tranh (`scene_image`) và đọc giọng
   (`narration`) nếu bật cờ.
8. Đưa cho con → `bookshelf_items`.

**Bé An chơi**
9. Mở truyện → `play_sessions` (`is_first_play = true` nếu là lần đầu).
10. Trả lời điểm dừng → `checkpoint_answers` (lần chọn đầu, lần chọn cuối, điểm, năng lực).
11. Cập nhật cache điểm → `eq_competency_stats`; thời gian chơi → `child_usage_sessions`.

**Đăng bán**
12. Nộp đơn người bán → `seller_profiles`.
13. Đăng bán → bản sao `stories` (`published`) + `story_characters` dùng `alias_name` → `listings`.
14. Moderator duyệt → `moderation_reviews`, checklist → `review_checklist_results`, đã xem từng
    trang → `review_page_views`.

**Mẹ Hoa mua**
15. Thanh toán → `orders` + `order_items`; payOS gọi về → `webhook_logs`.
16. Nhận quyền → `entitlements`; doanh thu chờ 7 ngày của mẹ An → `wallet_ledger` (`earning_pending`).
17. Con nghe xong, mẹ Hoa đánh giá → `product_reviews`.

**Khi có vấn đề, và khi rút tiền**
18. Báo cáo → `content_reports`; vi phạm → `creator_strikes`; khiếu nại → `strike_appeals`.
19. Rút tiền → `withdrawal_requests`; Admin chuyển xong → `wallet_ledger` (`withdrawal_paid`).

## 3. Quy ước chung

- Khoá chính `uuid`; sổ cái và nhật ký dùng `bigserial`. Mọi thời gian là `timestamptz`.
- **Xoá mềm** bằng `deleted_at`; **thu hồi / ẩn** bằng `revoked_at`, `hidden_at` — NULL nghĩa là còn hiệu lực.
- **Snapshot:** giá, tỉ lệ chia, điểm EQ được chép vào dòng tại thời điểm phát sinh và không đổi nữa
  (`order_items.unit_price_vnd`, `seller_share_rate`, `checkpoint_answers.score`, `skill_id`).
- **File** lưu ở object storage; database chỉ giữ khoá (`*_key`), không giữ URL.
- **Chữ truyện lưu kèm token** `{NVx}`; tên thật thay vào lúc hiển thị và lúc gửi giọng đọc.
- **Sổ cái chỉ ghi thêm** (`wallet_ledger`): không UPDATE, không DELETE. Mỗi thay đổi số dư ghi
  đúng một dòng, có `idempotency_key` duy nhất.
- **Cache + đối soát:** bộ đếm trên `listings` và `eq_competency_stats` là cache; cron hằng đêm tính
  lại từ dữ liệu gốc.

## 4. Máy trạng thái

| Bảng | Trạng thái |
|---|---|
| `stories.status` | `draft` → `generating` → `ready` |
| `listings.status` | `submitted` → `in_review` → `published` · `changes_requested` · `rejected`; `published` → `suspended` → `published` / `archived` |
| `orders.status` | `pending` → `paid` · `failed` · `cancelled` · `expired` (đơn 0đ: tạo xong → `paid`) |
| `subscriptions.status` | `active` → `expired` · `cancelled` |
| `withdrawal_requests.status` | `requested` → `paid` · `rejected` · `cancelled` |
| `ai_requests.status` | `queued` → `processing` → `succeeded` · `failed` · `blocked` |

## 5. Ràng buộc phải viết trong migration

DBML không diễn tả được; đã ghi trong `Note` của từng bảng, tổng hợp lại:

**Partial unique**
- `auth_tokens (child_id)` WHERE `type = kid_session AND consumed_at IS NULL`
- `story_characters (story_id)` WHERE `is_main`
- `play_sessions (child_id, story_id)` WHERE `is_first_play`
- `entitlements (parent_id, listing_id)` WHERE `revoked_at IS NULL`
- `subscriptions (parent_id)` WHERE `status = active`
- `withdrawal_requests (seller_id)` WHERE `status = requested`
- `prompt_templates (request_type)` WHERE `is_active`
- `content_reports (reporter_id, listing_id)` WHERE `listing_id IS NOT NULL`

**CHECK**
- `stories`: `kind <> published OR source_story_id IS NOT NULL`
- `story_characters`: đúng một trong `character_id`, `alias_name`
- `story_checkpoints`: có `answer_emotion` ⇔ kiểu cảm xúc; có `target_token` ⇔ `emotion_other` hoặc `perspective`
- `order_items`: exclusive arc theo `item_type`
- `orders`: `total_vnd = 0 OR payos_order_code IS NOT NULL`
- `wallets`: mọi cột ≥ 0
- `product_reviews`: `rating BETWEEN 1 AND 5`
- `checkpoint_answers`: `attempts BETWEEN 1 AND 2`
- `topics`: `age_min <= age_max`

**Validator ở tầng service** (khác bảng, CHECK không làm được)
- `checkpoint_options`: `perspective` đúng 3 phương án, đúng 1 `is_correct`; `problem_solving` đủ 3 vai.
- Truyện `custom`: 4–20 trang, 0–6 điểm dừng có chấm, không đặt sau trang 1, `reflection` ở cuối.
- Chỉ đưa vào giá sách khi `reviewed_at IS NOT NULL`, và phụ huynh sở hữu truyện (riêng tư hoặc có `entitlements`).

## 6. Cron

| Việc | Tần suất |
|---|---|
| Cấp credit tháng mới, hết hạn credit tháng cũ (`next_credit_grant_at`) | Hằng ngày |
| Hết hạn gói (`period_end`) | Hằng ngày |
| Chuyển doanh thu treo quá 7 ngày sang khả dụng | Hằng ngày |
| Hết hạn đơn chưa thanh toán | Mỗi vài phút |
| Tính lại bộ đếm `listings` và `eq_competency_stats` | Hằng đêm |
| Chọn truyện kiểm tra ngẫu nhiên cho Moderator | Hằng tuần |
