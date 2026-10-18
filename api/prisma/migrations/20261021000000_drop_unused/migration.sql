-- Don schema (2026-10-18, nguoi dung chot): bo voucher / gio hang (mua le tung truyen), prompt_templates (prompt nam o ai/),
-- child_usage_sessions + daily_screen_time_minutes (bo gioi han phut doc; thoi gian doc tinh tu play_sessions),
-- va 5 index khong truy van nao dung. GIU phan anh (backgrounds, cot anh) va product_reviews.
-- Truoc khi ap len DB that: cac bang bi xoa phai trong (SELECT count(*) ... = 0) — moi ban deu khong co code ghi.

-- DropForeignKey
ALTER TABLE "child_usage_sessions" DROP CONSTRAINT "child_usage_sessions_child_id_fkey";

-- DropForeignKey
ALTER TABLE "prompt_templates" DROP CONSTRAINT "prompt_templates_created_by_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_prompt_template_id_fkey";

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_listing_id_fkey";

-- DropForeignKey
ALTER TABLE "vouchers" DROP CONSTRAINT "vouchers_created_by_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_voucher_id_fkey";

-- DropForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT "voucher_usages_voucher_id_fkey";

-- DropForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT "voucher_usages_order_id_fkey";

-- DropForeignKey
ALTER TABLE "voucher_usages" DROP CONSTRAINT "voucher_usages_user_id_fkey";

-- DropIndex
DROP INDEX "users_deleted_at_idx";

-- DropIndex
DROP INDEX "checkpoint_answers_skill_id_answered_at_idx";

-- DropIndex
DROP INDEX "ai_requests_status_created_at_idx";

-- DropIndex
DROP INDEX "subscriptions_status_period_end_idx";

-- DropIndex
DROP INDEX "wallet_ledger_ref_type_ref_id_idx";

-- AlterTable
ALTER TABLE "child_profiles" DROP COLUMN "daily_screen_time_minutes";

-- AlterTable
ALTER TABLE "ai_requests" DROP COLUMN "prompt_template_id";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "discount_vnd",
DROP COLUMN "voucher_id";

-- DropTable
DROP TABLE "child_usage_sessions";

-- DropTable
DROP TABLE "prompt_templates";

-- DropTable
DROP TABLE "cart_items";

-- DropTable
DROP TABLE "vouchers";

-- DropTable
DROP TABLE "voucher_usages";

-- DropEnum
DROP TYPE "voucher_discount_type";


-- CHECK tong don (dot 3) phu thuoc discount_vnd da bi xoa theo cot -> them lai khong co giam gia
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("total_vnd" = "subtotal_vnd");
