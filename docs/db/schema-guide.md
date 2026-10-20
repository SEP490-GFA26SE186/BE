# Hướng dẫn đọc schema — rev 8

50 bảng, chia 8 khối (dọn 2026-10-18: bỏ voucher, giỏ hàng, `prompt_templates`, `child_usage_sessions`; thêm `narration_clips`. 2026-10-20: thêm 5 bảng sư phạm CASEL — `casel_references`, `eq_sub_skills`, `question_templates`, `question_template_versions`, `topic_sub_skills`). Khoảng 15 bảng là xương sống; phần còn lại là danh mục cấu hình, bảng nối
và nhật ký. File DBML: `schema_rev8.dbml` — dán vào dbdiagram.io để xem ERD.

## 1. Tám khối

| Khối | Trả lời câu hỏi | Bảng chính | Bảng phụ |
|---|---|---|---|
| **Tài khoản** (4) | Ai dùng app, con là ai, nhà có nhân vật nào? | `users`, `child_profiles`, `characters` | `auth_tokens` |
| **Thư viện nội dung** (11) | Specialist/Admin chuẩn bị sẵn gì? | `topics`, `eq_sub_skills`, `question_templates` | `eq_skills`, `casel_references`, `question_template_versions`, `topic_sub_skills`, `backgrounds`, `ui_audio_assets`, `blocked_keywords`, `checklist_items` |
| **Truyện** (8) | Một truyện gồm những gì? | `stories`, `story_pages`, `story_checkpoints` | `story_characters`, `story_scenes`, `checkpoint_options`, `narration_clips`, `bookshelf_items` |
| **Học** (2) | Trẻ đã trả lời gì, mức EQ ra sao? | `play_sessions`, `checkpoint_answers` | (mức độ tính trực tiếp từ `checkpoint_answers`) |
| **AI** (1) | Đã gọi AI bao nhiêu, tốn bao nhiêu? | `ai_requests` | (prompt nằm trong dịch vụ ai/) |
| **Chợ truyện** (6) | Truyện nào đang bán, ai đã mua, đánh giá ra sao? | `listings`, `entitlements`, `product_reviews` | `seller_profiles`, `price_tiers`, `product_review_tags` |
| **Tiền** (10) | Ai trả bao nhiêu, ví còn bao nhiêu? | `orders`, `order_items`, `subscriptions`, `wallets`, `wallet_ledger` | `plans`, `refund_requests`, `webhook_logs`, `withdrawal_requests`, `platform_settings` |
| **Kiểm duyệt** (7) | Ai duyệt, ai bị báo cáo, ai làm gì? | `moderation_reviews`, `content_reports` | `review_checklist_results`, `review_page_views`, `creator_strikes`, `strike_appeals`, `admin_audit_logs` |

## 2. Đi theo một hành trình

**Mẹ An bắt đầu**
1. Đăng ký → `users`; đăng nhập → `auth_tokens`; ví rỗng → `wallets`; gói Miễn phí → `subscriptions`,
   cấp credit tháng đầu → `wallet_ledger` (`credit_grant`).
2. Tạo hồ sơ bé An → `child_profiles`.
3. Tạo nhân vật An, Bin, Mẹ → `characters` (mô tả bằng chữ). *Chân dung AI (`character_portrait`) đang
   nghiên cứu, chưa bật — schema giữ sẵn.*

**Tạo truyện**
4. Chọn bài học "Con hay nổi giận" → đọc `topics`; kỹ năng con của bài → `topic_sub_skills` → `eq_sub_skills`
   (mỗi kỹ năng con trỏ về đúng 1 mục `casel_references`).
5. Hệ thống tạo `stories` (`private`, `length = medium`), gắn nhân vật + token `{NV1}`… →
   `story_characters`, dựng 8 trang → `story_pages`, 4 điểm dừng → `story_checkpoints`.
6. "Viết giúp tôi" → một `ai_requests` (`story_text`) → điền chữ trang, cảnh (`story_scenes`),
   câu hỏi và phương án (`checkpoint_options`).
7. Xem lại xong → `stories.reviewed_at`; đọc giọng từng đoạn → `narration_clips` (nếu `use_tts`).
   *Tranh cảnh (`scene_image`) đang nghiên cứu, chưa bật.*
8. Đưa cho con → `bookshelf_items`.

**Bé An chơi**
9. Mở truyện → `play_sessions` (`is_first_play = true` nếu là lần đầu).
10. Trả lời điểm dừng → `checkpoint_answers` (lần chọn đầu, lần chọn cuối, điểm, năng lực).
11. Báo cáo EQ tính mức theo kỹ năng con trực tiếp từ `checkpoint_answers` (lượt đọc đầu, điểm dừng không bị cờ); thời gian đọc tính từ `play_sessions` (không giới hạn phút).

**Đăng bán**
12. Nộp đơn người bán → `seller_profiles`.
13. Đăng bán → bản sao `stories` (`published`) + `story_characters` dùng `alias_name` → `listings`.
14. Specialist duyệt → `moderation_reviews`, checklist → `review_checklist_results`, đã xem từng
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
- **Cache + đối soát:** bộ đếm trên `listings` là cache; cron hằng đêm tính
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
- `withdrawal_requests (seller_id)` WHERE `status IN (requested, processing)`
- `moderation_reviews (listing_id)` WHERE `decided_at IS NULL`
- `question_template_versions (template_id)` WHERE `status = draft` (mỗi mẫu tối đa 1 bản nháp)
- `content_reports (reporter_id, listing_id)` WHERE `listing_id IS NOT NULL`

**CHECK**
- `stories`: `kind <> published OR source_story_id IS NOT NULL`; `length = custom OR topic_id IS NOT NULL`
- `story_characters`: đúng một trong `character_id`, `alias_name`
- `story_checkpoints`: có `answer_emotion` ⇔ kiểu cảm xúc; `emotion_other` bắt buộc có `target_token`, `perspective` có hoặc không,
  `emotion_self` / `problem_solving` / `reflection` không có
- `order_items`: exclusive arc theo `item_type`
- `orders`: `total_vnd = 0 OR payos_order_code IS NOT NULL`
- `wallets`: mọi cột ≥ 0
- `product_reviews`: `rating BETWEEN 1 AND 5`
- `checkpoint_answers`: `attempts BETWEEN 1 AND 2`
- `topics`, `eq_sub_skills`: `age_min <= age_max`

**Validator ở tầng service** (khác bảng, CHECK không làm được)
- `eq_sub_skills`: mục `casel_references` phải cùng `skill_id`; `topic_sub_skills`: 1–3 kỹ năng con cùng năng lực với topic.
- `checkpoint_options`: `perspective` đúng 3 phương án, đúng 1 `is_correct`; `problem_solving` đủ 3 vai.
- Truyện `custom`: 4–20 trang, 0–6 điểm dừng có chấm, không đặt sau trang 1, `reflection` ở cuối.
- Chỉ đưa vào giá sách khi `reviewed_at IS NOT NULL`, và phụ huynh sở hữu truyện (riêng tư hoặc có `entitlements`).

## 6. Cron

| Việc | Tần suất |
|---|---|
| Cấp credit tháng mới, hết hạn credit tháng cũ (`next_credit_grant_at`) | Hằng ngày |
| Hết hạn gói (`period_end`) | Hằng ngày |
| Chuyển doanh thu treo quá 3 ngày (`market.earning_hold_days`) sang khả dụng, trừ khoản đang chờ hoàn tiền | Mỗi 15 phút |
| Hết hạn đơn chưa thanh toán | Mỗi vài phút |
| Tính lại bộ đếm `listings` | Admin bấm ở trang Đối soát (chưa có cron) |
| Chọn truyện kiểm tra ngẫu nhiên cho Specialist | Hằng tuần |
