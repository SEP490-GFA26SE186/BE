-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'moderator', 'parent');

-- CreateEnum
CREATE TYPE "auth_token_type" AS ENUM ('refresh', 'email_verify', 'password_reset', 'kid_session');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('none', 'queued', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "story_length" AS ENUM ('short', 'medium', 'long', 'custom');

-- CreateEnum
CREATE TYPE "checkpoint_type" AS ENUM ('emotion_self', 'emotion_other', 'perspective', 'problem_solving', 'reflection');

-- CreateEnum
CREATE TYPE "emotion" AS ENUM ('happy', 'sad', 'angry', 'scared', 'neutral');

-- CreateEnum
CREATE TYPE "option_role" AS ENUM ('constructive', 'avoidant', 'impulsive');

-- CreateEnum
CREATE TYPE "story_kind" AS ENUM ('private', 'published');

-- CreateEnum
CREATE TYPE "story_status" AS ENUM ('draft', 'generating', 'ready');

-- CreateEnum
CREATE TYPE "content_origin" AS ENUM ('human', 'ai', 'ai_edited');

-- CreateEnum
CREATE TYPE "play_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "ai_request_type" AS ENUM ('story_text', 'character_portrait', 'scene_image', 'narration');

-- CreateEnum
CREATE TYPE "ai_request_status" AS ENUM ('queued', 'processing', 'succeeded', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "seller_status" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('submitted', 'in_review', 'changes_requested', 'rejected', 'published', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "review_tag" AS ENUM ('child_liked', 'age_appropriate', 'clear_lesson', 'beautiful_art', 'good_narration');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "order_item_type" AS ENUM ('plan', 'listing');

-- CreateEnum
CREATE TYPE "order_item_status" AS ENUM ('active', 'refunded');

-- CreateEnum
CREATE TYPE "voucher_discount_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "withdrawal_status" AS ENUM ('requested', 'paid', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "wallet_type" AS ENUM ('credit', 'earning');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('credit_grant', 'credit_expire', 'credit_hold', 'credit_release', 'credit_consume', 'earning_pending', 'earning_release', 'earning_reversal', 'withdrawal_hold', 'withdrawal_paid', 'withdrawal_release');

-- CreateEnum
CREATE TYPE "moderation_review_type" AS ENUM ('submission', 'random_audit', 'report_followup');

-- CreateEnum
CREATE TYPE "moderation_decision" AS ENUM ('approved', 'changes_requested', 'rejected', 'taken_down');

-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('scary', 'violent', 'inappropriate_lesson', 'personal_info', 'technical_error', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "strike_source" AS ENUM ('report', 'rejection', 'takedown');

-- CreateEnum
CREATE TYPE "keyword_severity" AS ENUM ('block', 'warn');

-- CreateEnum
CREATE TYPE "casel_competency" AS ENUM ('self_awareness', 'self_management', 'social_awareness', 'relationship_skills', 'responsible_decision_making');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'parent',
    "username" VARCHAR(50) NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150),
    "phone" VARCHAR(20),
    "kid_exit_pin_hash" VARCHAR(255),
    "email_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "auth_token_type" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "replaced_by_id" UUID,
    "child_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_profiles" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "birth_date" DATE,
    "daily_screen_time_minutes" INTEGER NOT NULL DEFAULT 30,
    "preferred_voice" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "child_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "appearance" TEXT NOT NULL,
    "portrait_image_key" VARCHAR(300),
    "gen_prompt" TEXT,
    "gen_seed" BIGINT,
    "portrait_status" "generation_status" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_usage_sessions" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    -- schema-guide.md muc 5: hai cot duoi la GENERATED ALWAYS STORED.
    -- Prisma khong sinh duoc, phai viet tay ngay trong CREATE TABLE
    -- (Postgres khong cho ALTER COLUMN ... ADD GENERATED cho stored column).
    "duration_seconds" INTEGER GENERATED ALWAYS AS (extract(epoch from "ended_at" - "started_at")::int) STORED,
    "usage_date" DATE NOT NULL GENERATED ALWAYS AS (("started_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) STORED,

    CONSTRAINT "child_usage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eq_skills" (
    "id" UUID NOT NULL,
    "casel_code" "casel_competency" NOT NULL,
    "name_vi" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eq_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "skill_id" UUID NOT NULL,
    "guidance" TEXT NOT NULL,
    "age_min" INTEGER NOT NULL DEFAULT 5,
    "age_max" INTEGER NOT NULL DEFAULT 8,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backgrounds" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "image_key" VARCHAR(300) NOT NULL,
    "tags" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ui_audio_assets" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "lang" VARCHAR(10) NOT NULL DEFAULT 'vi',
    "text_content" TEXT NOT NULL,
    "audio_key" VARCHAR(300) NOT NULL,

    CONSTRAINT "ui_audio_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_keywords" (
    "id" UUID NOT NULL,
    "keyword" VARCHAR(100) NOT NULL,
    "severity" "keyword_severity" NOT NULL DEFAULT 'block',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "story_kind" NOT NULL DEFAULT 'private',
    "source_story_id" UUID,
    "topic_id" UUID NOT NULL,
    "length" "story_length" NOT NULL DEFAULT 'medium',
    "title" VARCHAR(200) NOT NULL,
    "situation" TEXT,
    "use_ai_image" BOOLEAN NOT NULL DEFAULT false,
    "use_tts" BOOLEAN NOT NULL DEFAULT true,
    "status" "story_status" NOT NULL DEFAULT 'draft',
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_characters" (
    "story_id" UUID NOT NULL,
    "token" VARCHAR(10) NOT NULL,
    "character_id" UUID,
    "alias_name" VARCHAR(100),
    "is_main" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "story_characters_pkey" PRIMARY KEY ("story_id","token")
);

-- CreateTable
CREATE TABLE "story_scenes" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "scene_order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "image_key" VARCHAR(300),
    "background_id" UUID,
    "image_status" "generation_status" NOT NULL DEFAULT 'none',

    CONSTRAINT "story_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_pages" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "page_order" INTEGER NOT NULL,
    "scene_id" UUID NOT NULL,
    "content_text" TEXT,
    "ai_original_text" TEXT,
    "origin" "content_origin" NOT NULL DEFAULT 'human',
    "audio_key" VARCHAR(300),
    "audio_status" "generation_status" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_checkpoints" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "after_page_id" UUID NOT NULL,
    "type" "checkpoint_type" NOT NULL,
    "target_token" VARCHAR(10),
    "question" TEXT,
    "answer_emotion" "emotion",
    "hint" TEXT,
    "origin" "content_origin" NOT NULL DEFAULT 'human',
    "question_audio_key" VARCHAR(300),
    "hint_audio_key" VARCHAR(300),

    CONSTRAINT "story_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_options" (
    "id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "option_order" INTEGER NOT NULL,
    "text" TEXT,
    "role" "option_role",
    "is_correct" BOOLEAN,
    "feedback" TEXT,
    "text_audio_key" VARCHAR(300),
    "feedback_audio_key" VARCHAR(300),

    CONSTRAINT "checkpoint_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookshelf_items" (
    "child_id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookshelf_items_pkey" PRIMARY KEY ("child_id","story_id")
);

-- CreateTable
CREATE TABLE "play_sessions" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "is_first_play" BOOLEAN NOT NULL,
    "status" "play_status" NOT NULL DEFAULT 'in_progress',
    "current_page_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_answers" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "first_emotion" "emotion",
    "first_option_id" UUID,
    "final_emotion" "emotion",
    "final_option_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "time_to_first_ms" INTEGER,
    "question_replays" INTEGER NOT NULL DEFAULT 0,
    "skill_id" UUID,
    "score" DECIMAL(3,2),
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoint_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eq_competency_stats" (
    "child_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "score_sum" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eq_competency_stats_pkey" PRIMARY KEY ("child_id","skill_id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "request_type" "ai_request_type" NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "template_text" TEXT NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_type" "ai_request_type" NOT NULL,
    "story_id" UUID,
    "page_id" UUID,
    "checkpoint_id" UUID,
    "scene_id" UUID,
    "character_id" UUID,
    "prompt_template_id" UUID,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'mock',
    "model_name" VARCHAR(100),
    "status" "ai_request_status" NOT NULL DEFAULT 'queued',
    "credits_charged" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "output_units" INTEGER,
    "provider_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "bio" TEXT,
    "expertise" TEXT,
    "status" "seller_status" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "bank_name" VARCHAR(100),
    "bank_account_number" VARCHAR(255),
    "bank_account_holder" VARCHAR(150),
    "bank_updated_at" TIMESTAMPTZ,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "price_tiers" (
    "id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "price_vnd" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "published_story_id" UUID NOT NULL,
    "previous_listing_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image_key" VARCHAR(300),
    "price_tier_id" UUID NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'submitted',
    "has_ai_content" BOOLEAN NOT NULL DEFAULT false,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "free_claim_count" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "parent_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("parent_id","listing_id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "hidden_at" TIMESTAMPTZ,
    "hidden_by" UUID,
    "seller_reply" TEXT,
    "seller_replied_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_review_tags" (
    "review_id" UUID NOT NULL,
    "tag" "review_tag" NOT NULL,

    CONSTRAINT "product_review_tags_pkey" PRIMARY KEY ("review_id","tag")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "price_vnd" BIGINT NOT NULL,
    "credits_per_month" INTEGER NOT NULL,
    "max_children" INTEGER NOT NULL,
    "max_characters" INTEGER NOT NULL,
    "can_sell" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "order_item_id" UUID,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "next_credit_grant_at" TIMESTAMPTZ NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "discount_type" "voucher_discount_type" NOT NULL,
    "value" BIGINT NOT NULL,
    "max_discount_vnd" BIGINT,
    "min_order_vnd" BIGINT NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "voucher_id" UUID,
    "subtotal_vnd" BIGINT NOT NULL,
    "discount_vnd" BIGINT NOT NULL DEFAULT 0,
    "total_vnd" BIGINT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending',
    "payos_order_code" BIGINT,
    "payos_payment_link_id" VARCHAR(100),
    "payos_transaction_id" VARCHAR(100),
    "paid_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_type" "order_item_type" NOT NULL,
    "plan_id" UUID,
    "listing_id" UUID,
    "unit_price_vnd" BIGINT NOT NULL,
    "seller_share_rate" DECIMAL(4,3),
    "seller_amount_vnd" BIGINT,
    "status" "order_item_status" NOT NULL DEFAULT 'active',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_usages" (
    "voucher_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_usages_pkey" PRIMARY KEY ("voucher_id","order_id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'pending',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ,
    "bank_transaction_ref" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" BIGSERIAL NOT NULL,
    "provider" VARCHAR(30) NOT NULL DEFAULT 'payos',
    "payos_order_code" BIGINT,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" UUID NOT NULL,
    "credit_balance" INTEGER NOT NULL DEFAULT 0,
    "earning_pending_vnd" BIGINT NOT NULL DEFAULT 0,
    "earning_available_vnd" BIGINT NOT NULL DEFAULT 0,
    "earning_locked_vnd" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wallet_ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_type" "wallet_type" NOT NULL,
    "entry_type" "ledger_entry_type" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "available_at" TIMESTAMPTZ,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "ref_type" VARCHAR(50),
    "ref_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "bank_snapshot" JSONB NOT NULL,
    "status" "withdrawal_status" NOT NULL DEFAULT 'requested',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ,
    "bank_transaction_ref" VARCHAR(100),
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "moderation_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "review_type" "moderation_review_type" NOT NULL,
    "moderator_id" UUID,
    "claimed_at" TIMESTAMPTZ,
    "claim_expires_at" TIMESTAMPTZ,
    "decision" "moderation_decision",
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_checklist_results" (
    "review_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "review_checklist_results_pkey" PRIMARY KEY ("review_id","checklist_item_id")
);

-- CreateTable
CREATE TABLE "review_page_views" (
    "review_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "review_page_views_pkey" PRIMARY KEY ("review_id","page_id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "listing_id" UUID,
    "page_id" UUID,
    "product_review_id" UUID,
    "category" "report_category" NOT NULL,
    "description" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_strikes" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "source" "strike_source" NOT NULL,
    "source_id" UUID,
    "reason" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "creator_strikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strike_appeals" (
    "id" UUID NOT NULL,
    "strike_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strike_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "auth_tokens_child_id_idx" ON "auth_tokens"("child_id");

-- CreateIndex
CREATE INDEX "child_profiles_parent_id_idx" ON "child_profiles"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_child_id_key" ON "characters"("child_id");

-- CreateIndex
CREATE INDEX "characters_parent_id_idx" ON "characters"("parent_id");

-- CreateIndex
CREATE INDEX "child_usage_sessions_child_id_usage_date_idx" ON "child_usage_sessions"("child_id", "usage_date");

-- CreateIndex
CREATE UNIQUE INDEX "eq_skills_casel_code_key" ON "eq_skills"("casel_code");

-- CreateIndex
CREATE INDEX "topics_is_active_skill_id_idx" ON "topics"("is_active", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "ui_audio_assets_key_lang_key" ON "ui_audio_assets"("key", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_keywords_keyword_key" ON "blocked_keywords"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_code_key" ON "checklist_items"("code");

-- CreateIndex
CREATE INDEX "stories_owner_id_kind_idx" ON "stories"("owner_id", "kind");

-- CreateIndex
CREATE INDEX "stories_topic_id_idx" ON "stories"("topic_id");

-- CreateIndex
CREATE INDEX "story_characters_character_id_idx" ON "story_characters"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_scenes_story_id_scene_order_key" ON "story_scenes"("story_id", "scene_order");

-- CreateIndex
CREATE INDEX "story_pages_scene_id_idx" ON "story_pages"("scene_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_pages_story_id_page_order_key" ON "story_pages"("story_id", "page_order");

-- CreateIndex
CREATE UNIQUE INDEX "story_checkpoints_after_page_id_key" ON "story_checkpoints"("after_page_id");

-- CreateIndex
CREATE INDEX "story_checkpoints_story_id_idx" ON "story_checkpoints"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_options_checkpoint_id_option_order_key" ON "checkpoint_options"("checkpoint_id", "option_order");

-- CreateIndex
CREATE INDEX "play_sessions_child_id_status_idx" ON "play_sessions"("child_id", "status");

-- CreateIndex
CREATE INDEX "play_sessions_story_id_status_idx" ON "play_sessions"("story_id", "status");

-- CreateIndex
CREATE INDEX "checkpoint_answers_skill_id_answered_at_idx" ON "checkpoint_answers"("skill_id", "answered_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_answers_session_id_checkpoint_id_key" ON "checkpoint_answers"("session_id", "checkpoint_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_request_type_version_key" ON "prompt_templates"("request_type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_requests_idempotency_key_key" ON "ai_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_requests_status_created_at_idx" ON "ai_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "ai_requests_user_id_created_at_idx" ON "ai_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_requests_story_id_idx" ON "ai_requests"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_tiers_price_vnd_key" ON "price_tiers"("price_vnd");

-- CreateIndex
CREATE UNIQUE INDEX "listings_published_story_id_key" ON "listings"("published_story_id");

-- CreateIndex
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status", "published_at");

-- CreateIndex
CREATE INDEX "listings_seller_id_idx" ON "listings"("seller_id");

-- CreateIndex
CREATE INDEX "entitlements_parent_id_idx" ON "entitlements"("parent_id");

-- CreateIndex
CREATE INDEX "product_reviews_listing_id_hidden_at_idx" ON "product_reviews"("listing_id", "hidden_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_listing_id_parent_id_key" ON "product_reviews"("listing_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_parent_id_status_idx" ON "subscriptions"("parent_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_period_end_idx" ON "subscriptions"("status", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payos_order_code_key" ON "orders"("payos_order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payos_transaction_id_key" ON "orders"("payos_transaction_id");

-- CreateIndex
CREATE INDEX "orders_buyer_id_created_at_idx" ON "orders"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_listing_id_idx" ON "order_items"("listing_id");

-- CreateIndex
CREATE INDEX "voucher_usages_voucher_id_user_id_idx" ON "voucher_usages"("voucher_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_order_item_id_key" ON "refund_requests"("order_item_id");

-- CreateIndex
CREATE INDEX "webhook_logs_payos_order_code_idx" ON "webhook_logs"("payos_order_code");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_idempotency_key_key" ON "wallet_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_ledger_user_id_wallet_type_created_at_idx" ON "wallet_ledger"("user_id", "wallet_type", "created_at");

-- CreateIndex
CREATE INDEX "wallet_ledger_ref_type_ref_id_idx" ON "wallet_ledger"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "wallet_ledger_entry_type_available_at_idx" ON "wallet_ledger"("entry_type", "available_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_seller_id_idx" ON "withdrawal_requests"("seller_id");

-- CreateIndex
CREATE INDEX "moderation_reviews_decided_at_created_at_idx" ON "moderation_reviews"("decided_at", "created_at");

-- CreateIndex
CREATE INDEX "moderation_reviews_listing_id_idx" ON "moderation_reviews"("listing_id");

-- CreateIndex
CREATE INDEX "content_reports_status_created_at_idx" ON "content_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "content_reports_listing_id_created_at_idx" ON "content_reports"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "creator_strikes_seller_id_expires_at_idx" ON "creator_strikes"("seller_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "strike_appeals_strike_id_key" ON "strike_appeals"("strike_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "auth_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_usage_sessions" ADD CONSTRAINT "child_usage_sessions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_keywords" ADD CONSTRAINT "blocked_keywords_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_source_story_id_fkey" FOREIGN KEY ("source_story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_background_id_fkey" FOREIGN KEY ("background_id") REFERENCES "backgrounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "story_scenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_after_page_id_fkey" FOREIGN KEY ("after_page_id") REFERENCES "story_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_options" ADD CONSTRAINT "checkpoint_options_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "story_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookshelf_items" ADD CONSTRAINT "bookshelf_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookshelf_items" ADD CONSTRAINT "bookshelf_items_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_current_page_id_fkey" FOREIGN KEY ("current_page_id") REFERENCES "story_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "story_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_first_option_id_fkey" FOREIGN KEY ("first_option_id") REFERENCES "checkpoint_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_final_option_id_fkey" FOREIGN KEY ("final_option_id") REFERENCES "checkpoint_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_competency_stats" ADD CONSTRAINT "eq_competency_stats_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_competency_stats" ADD CONSTRAINT "eq_competency_stats_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "story_checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "story_scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_prompt_template_id_fkey" FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_published_story_id_fkey" FOREIGN KEY ("published_story_id") REFERENCES "stories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_previous_listing_id_fkey" FOREIGN KEY ("previous_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "price_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_review_tags" ADD CONSTRAINT "product_review_tags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_reviews" ADD CONSTRAINT "moderation_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_reviews" ADD CONSTRAINT "moderation_reviews_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_checklist_results" ADD CONSTRAINT "review_checklist_results_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "moderation_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_checklist_results" ADD CONSTRAINT "review_checklist_results_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_page_views" ADD CONSTRAINT "review_page_views_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "moderation_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_page_views" ADD CONSTRAINT "review_page_views_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_product_review_id_fkey" FOREIGN KEY ("product_review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_strikes" ADD CONSTRAINT "creator_strikes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_strikes" ADD CONSTRAINT "creator_strikes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strike_appeals" ADD CONSTRAINT "strike_appeals_strike_id_fkey" FOREIGN KEY ("strike_id") REFERENCES "creator_strikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strike_appeals" ADD CONSTRAINT "strike_appeals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- PHAN VIET TAY — Prisma khong dien ta duoc nhung rang buoc duoi day.
-- Nguon: db/schema-guide.md muc 5 + Note cua tung bang trong schema_rev8.dbml.
-- Migration init cu (rev 6) KHONG co bat ky rang buoc nao trong phan nay.
-- Sua o day thi phai sua /// @note tuong ung trong schema.prisma.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PARTIAL UNIQUE INDEX (8)
-- ---------------------------------------------------------------------------

-- Moi con chi co dung 1 phien kid_session chua dung tai mot thoi diem
CREATE UNIQUE INDEX "auth_tokens_child_id_active_kid_session_key"
  ON "auth_tokens" ("child_id")
  WHERE "type" = 'kid_session' AND "consumed_at" IS NULL;

-- Moi truyen dung 1 nhan vat chinh
CREATE UNIQUE INDEX "story_characters_story_id_is_main_key"
  ON "story_characters" ("story_id")
  WHERE "is_main";

-- Moi (con, truyen) chi co 1 lan choi dau — lan duoc tinh diem EQ
CREATE UNIQUE INDEX "play_sessions_child_id_story_id_first_play_key"
  ON "play_sessions" ("child_id", "story_id")
  WHERE "is_first_play";

-- Khong cap trung quyen doc cho cung mot listing khi quyen cu chua bi thu hoi
CREATE UNIQUE INDEX "entitlements_parent_id_listing_id_active_key"
  ON "entitlements" ("parent_id", "listing_id")
  WHERE "revoked_at" IS NULL;

-- Moi phu huynh toi da 1 goi dang hoat dong
CREATE UNIQUE INDEX "subscriptions_parent_id_active_key"
  ON "subscriptions" ("parent_id")
  WHERE "status" = 'active';

-- Moi nguoi ban toi da 1 yeu cau rut tien dang cho
CREATE UNIQUE INDEX "withdrawal_requests_seller_id_requested_key"
  ON "withdrawal_requests" ("seller_id")
  WHERE "status" = 'requested';

-- Moi loai request AI toi da 1 prompt template dang bat
CREATE UNIQUE INDEX "prompt_templates_request_type_active_key"
  ON "prompt_templates" ("request_type")
  WHERE "is_active";

-- Mot nguoi khong bao cao cung mot listing hai lan
CREATE UNIQUE INDEX "content_reports_reporter_id_listing_id_key"
  ON "content_reports" ("reporter_id", "listing_id")
  WHERE "listing_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CHECK CONSTRAINT
-- ---------------------------------------------------------------------------

-- auth_tokens: child_id ton tai dung khi va chi khi la kid_session
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_child_id_check"
  CHECK (("type" = 'kid_session') = ("child_id" IS NOT NULL));

-- auth_tokens: chi refresh token moi co chuoi thay the
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_replaced_by_check"
  CHECK ("replaced_by_id" IS NULL OR "type" = 'refresh');

-- topics: khoang tuoi hop le
ALTER TABLE "topics" ADD CONSTRAINT "topics_age_range_check"
  CHECK ("age_min" <= "age_max");

-- stories: ban published luon phai tro ve truyen rieng goc
ALTER TABLE "stories" ADD CONSTRAINT "stories_published_source_check"
  CHECK ("kind" <> 'published' OR "source_story_id" IS NOT NULL);

-- story_characters: dung mot trong hai — nhan vat gia dinh HOAC ten chung
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_identity_check"
  CHECK (("character_id" IS NOT NULL) <> ("alias_name" IS NOT NULL));

-- story_checkpoints: answer_emotion chi va phai co voi cau hoi cam xuc
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_answer_emotion_check"
  CHECK (("type" IN ('emotion_self', 'emotion_other')) = ("answer_emotion" IS NOT NULL));

-- story_checkpoints: target_token chi va phai co khi hoi ve nguoi khac
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_target_token_check"
  CHECK (("type" IN ('emotion_other', 'perspective')) = ("target_token" IS NOT NULL));

-- checkpoint_answers: toi da 2 luot (lan dau + sau goi y)
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_attempts_check"
  CHECK ("attempts" BETWEEN 1 AND 2);

-- ai_requests: tran voi AI_JOB_ATTEMPTS = 3
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_attempts_check"
  CHECK ("attempts" <= 3);

-- product_reviews: 1..5 sao
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_check"
  CHECK ("rating" BETWEEN 1 AND 5);

-- orders: don co tien thi buoc phai co ma payOS; don 0d thi khong
ALTER TABLE "orders" ADD CONSTRAINT "orders_payos_order_code_check"
  CHECK ("total_vnd" = 0 OR "payos_order_code" IS NOT NULL);

-- order_items: exclusive arc theo item_type
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_exclusive_arc_check"
  CHECK (
    (
      "item_type" = 'plan'
      AND "plan_id" IS NOT NULL
      AND "listing_id" IS NULL
      AND "seller_share_rate" IS NULL
      AND "seller_amount_vnd" IS NULL
    )
    OR
    (
      "item_type" = 'listing'
      AND "listing_id" IS NOT NULL
      AND "plan_id" IS NULL
      AND "seller_share_rate" IS NOT NULL
      AND "seller_amount_vnd" IS NOT NULL
    )
  );

-- wallets: khong so du am
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_non_negative_check"
  CHECK (
    "credit_balance" >= 0
    AND "earning_pending_vnd" >= 0
    AND "earning_available_vnd" >= 0
    AND "earning_locked_vnd" >= 0
  );

-- withdrawal_requests: DBML ghi "amount_vnd >= muc toi thieu (platform_settings)".
-- CHECK khong doc duoc bang khac, nen o day chi chan so khong/am;
-- nguong min_withdrawal that phai kiem o tang service.
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_amount_check"
  CHECK ("amount_vnd" > 0);

-- ---------------------------------------------------------------------------
-- wallet_ledger: APPEND-ONLY
-- ---------------------------------------------------------------------------
-- DBML ghi "REVOKE UPDATE, DELETE". Chi REVOKE la KHONG du: API ket noi bang
-- role `postgres` — chu so huu bang — va chu so huu luon co quyen ngam, REVOKE
-- khong tac dung len no. Nen dung them trigger de rang buoc co hieu luc that
-- voi moi role. Bo trigger nay neu doi soat can sua tay.

REVOKE UPDATE, DELETE ON "wallet_ledger" FROM PUBLIC;

CREATE OR REPLACE FUNCTION "wallet_ledger_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'wallet_ledger la append-only: khong duoc %  (so cai chi ghi them, moi thay doi so du la mot dong moi)',
    lower(TG_OP);
END;
$$;

CREATE TRIGGER "wallet_ledger_no_update_delete"
  BEFORE UPDATE OR DELETE ON "wallet_ledger"
  FOR EACH ROW EXECUTE FUNCTION "wallet_ledger_append_only"();
