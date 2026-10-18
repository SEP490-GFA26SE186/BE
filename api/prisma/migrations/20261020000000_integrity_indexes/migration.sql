-- Dot 3 (2026-10-18): index cho cron / bao cao, rang buoc toan ven, khoa quyen dung AI.
-- Chi them / siet rang buoc, khong xoa du lieu. Truoc khi ap len DB that, chay cac cau kiem tra o cuoi file (phai ra 0).

-- AlterTable: Moderator tam khoa quyen dung AI (luong 7.6). NULL = khong khoa.
ALTER TABLE "users" ADD COLUMN "ai_blocked_until" TIMESTAMPTZ;

-- Index ------------------------------------------------------------------------------------------
-- Cron chu ky goi (billing.store.js runBillingCycle): status = active AND next_credit_grant_at <= now
CREATE INDEX "subscriptions_active_next_grant_idx" ON "subscriptions" ("next_credit_grant_at") WHERE "status" = 'active';
-- Bao cao tai chinh Admin (finance.service.js): don da tra theo paid_at
CREATE INDEX "orders_paid_at_idx" ON "orders" ("paid_at") WHERE "status" = 'paid';
-- Chi phi AI theo khoang thoi gian (finance.service.js)
CREATE INDEX "ai_requests_created_at_idx" ON "ai_requests" ("created_at");
-- Moi truyen toi da mot luot duyet dang mo (code da gia dinh; truoc chan bang tim-roi-tao, co the dua)
CREATE UNIQUE INDEX "moderation_reviews_listing_id_open_key" ON "moderation_reviews" ("listing_id") WHERE "decided_at" IS NULL;

-- Rut tien: moi nguoi ban mot yeu cau chua xong — tinh ca 'processing' (enum them 2026-10-18)
DROP INDEX "withdrawal_requests_seller_id_requested_key";
CREATE UNIQUE INDEX "withdrawal_requests_seller_id_unfinished_key" ON "withdrawal_requests" ("seller_id") WHERE "status" IN ('requested', 'processing');

-- CHECK ------------------------------------------------------------------------------------------
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_check" CHECK (num_nonnulls("listing_id", "product_review_id") = 1);
ALTER TABLE "moderation_reviews" ADD CONSTRAINT "moderation_reviews_decision_check" CHECK (("decision" IS NULL) = ("decided_at" IS NULL));
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_approved_ref_check" CHECK ("status" <> 'approved' OR "bank_transaction_ref" IS NOT NULL);
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_price_check" CHECK ("price_vnd" >= 0);
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_check" CHECK ("price_vnd" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_check" CHECK ("unit_price_vnd" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_share_rate_check" CHECK ("seller_share_rate" IS NULL OR ("seller_share_rate" > 0 AND "seller_share_rate" <= 1));
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("total_vnd" = "subtotal_vnd" - "discount_vnd");

-- Khoa ngoai: SET NULL / CASCADE -> RESTRICT ----------------------------------------------------
-- SET NULL trai voi CHECK cua chinh bang (ban dang ban phai co nguon; story_characters can character_id hoac alias).
-- CASCADE lam mat lich su tien / bang chung vi pham khi xoa tay. Code chi xoa mem nen khong anh huong luong dang chay.
ALTER TABLE "stories" DROP CONSTRAINT "stories_source_story_id_fkey",
  ADD CONSTRAINT "stories_source_story_id_fkey" FOREIGN KEY ("source_story_id") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_characters" DROP CONSTRAINT "story_characters_character_id_fkey",
  ADD CONSTRAINT "story_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey",
  ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moderation_reviews" DROP CONSTRAINT "moderation_reviews_listing_id_fkey",
  ADD CONSTRAINT "moderation_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_listing_id_fkey",
  ADD CONSTRAINT "content_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kiem tra truoc khi ap (moi cau phai ra 0):
-- SELECT count(*) FROM (SELECT listing_id FROM moderation_reviews WHERE decided_at IS NULL GROUP BY listing_id HAVING count(*) > 1) x;
-- SELECT count(*) FROM content_reports WHERE num_nonnulls(listing_id, product_review_id) <> 1;
-- SELECT count(*) FROM moderation_reviews WHERE (decision IS NULL) <> (decided_at IS NULL);
-- SELECT count(*) FROM (SELECT seller_id FROM withdrawal_requests WHERE status IN ('requested','processing') GROUP BY seller_id HAVING count(*) > 1) x;
-- SELECT count(*) FROM refund_requests WHERE status = 'approved' AND bank_transaction_ref IS NULL;
-- SELECT count(*) FROM orders WHERE total_vnd <> subtotal_vnd - discount_vnd;
