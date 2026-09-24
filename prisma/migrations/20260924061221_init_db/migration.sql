-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'moderator', 'parent');

-- CreateEnum
CREATE TYPE "auth_token_type" AS ENUM ('refresh', 'email_verify', 'password_reset', 'kid_session');

-- CreateEnum
CREATE TYPE "character_role" AS ENUM ('self', 'sibling', 'parent', 'relative', 'pet', 'toy');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('none', 'queued', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "story_kind" AS ENUM ('private', 'published');

-- CreateEnum
CREATE TYPE "story_status" AS ENUM ('draft', 'generating', 'ready');

-- CreateEnum
CREATE TYPE "page_kind" AS ENUM ('lead_in', 'situation', 'consequence', 'ending');

-- CreateEnum
CREATE TYPE "content_origin" AS ENUM ('human', 'ai', 'ai_edited');

-- CreateEnum
CREATE TYPE "play_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "ai_request_type" AS ENUM ('story_text', 'page_rewrite', 'character_portrait', 'story_image', 'narration');

-- CreateEnum
CREATE TYPE "ai_request_status" AS ENUM ('queued', 'processing', 'succeeded', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "quota_source" AS ENUM ('plan', 'credit');

-- CreateEnum
CREATE TYPE "seller_status" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('submitted', 'in_review', 'changes_requested', 'rejected', 'published', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "entitlement_source" AS ENUM ('purchase', 'free_claim', 'admin_grant');

-- CreateEnum
CREATE TYPE "review_visibility" AS ENUM ('visible', 'hidden');

-- CreateEnum
CREATE TYPE "review_tag" AS ENUM ('child_liked', 'age_appropriate', 'clear_lesson', 'beautiful_art', 'good_narration');

-- CreateEnum
CREATE TYPE "plan_period" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "order_item_type" AS ENUM ('plan', 'credit_pack', 'listing');

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
CREATE TYPE "ledger_entry_type" AS ENUM ('credit_topup', 'credit_bonus', 'credit_admin_grant', 'credit_hold', 'credit_release', 'credit_consume', 'earning_pending', 'earning_release', 'earning_reversal', 'earning_to_credit', 'withdrawal_hold', 'withdrawal_paid', 'withdrawal_release');

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
    "email" CITEXT NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
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
    "bedtime_start" TIME,
    "bedtime_end" TIME,
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
    "role" "character_role" NOT NULL,
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
    "duration_seconds" INTEGER,
    "usage_date" DATE NOT NULL,

    CONSTRAINT "child_usage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "ref_type" VARCHAR(50),
    "ref_id" UUID,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "primary_skill_id" UUID NOT NULL,
    "age_min" INTEGER NOT NULL DEFAULT 5,
    "age_max" INTEGER NOT NULL DEFAULT 8,
    "status" "template_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_stages" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "stage_order" INTEGER NOT NULL,
    "learning_objective" TEXT NOT NULL,
    "emotion_to_name" VARCHAR(50),
    "lead_in_pages" INTEGER NOT NULL DEFAULT 1,
    "is_climax" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_choice_types" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "choice_order" INTEGER NOT NULL,
    "type_code" VARCHAR(40) NOT NULL,
    "description" TEXT NOT NULL,
    "is_prosocial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "template_choice_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_choice_signals" (
    "choice_type_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,

    CONSTRAINT "template_choice_signals_pkey" PRIMARY KEY ("choice_type_id","skill_id")
);

-- CreateTable
CREATE TABLE "template_slots" (
    "template_id" UUID NOT NULL,
    "slot_key" VARCHAR(30) NOT NULL,
    "character_role" "character_role" NOT NULL,
    "default_name" VARCHAR(100) NOT NULL,

    CONSTRAINT "template_slots_pkey" PRIMARY KEY ("template_id","slot_key")
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
    "template_id" UUID NOT NULL,
    "source_story_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "cover_image_key" VARCHAR(300),
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
    "slot_key" VARCHAR(30) NOT NULL,
    "character_id" UUID,

    CONSTRAINT "story_characters_pkey" PRIMARY KEY ("story_id","slot_key")
);

-- CreateTable
CREATE TABLE "story_pages" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "page_kind" "page_kind" NOT NULL,
    "page_order" INTEGER NOT NULL,
    "from_choice_id" UUID,
    "content_text" TEXT,
    "ai_original_text" TEXT,
    "origin" "content_origin" NOT NULL DEFAULT 'human',
    "background_id" UUID,
    "image_key" VARCHAR(300),
    "audio_key" VARCHAR(300),
    "image_status" "generation_status" NOT NULL DEFAULT 'none',
    "audio_status" "generation_status" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_choices" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "choice_order" INTEGER NOT NULL,
    "choice_text" TEXT NOT NULL,
    "choice_type_id" UUID NOT NULL,
    "audio_key" VARCHAR(300),

    CONSTRAINT "story_choices_pkey" PRIMARY KEY ("id")
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
    "status" "play_status" NOT NULL DEFAULT 'in_progress',
    "is_replay" BOOLEAN NOT NULL DEFAULT false,
    "current_page_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "play_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_decisions" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "choice_id" UUID NOT NULL,
    "time_to_decide_ms" INTEGER,
    "replay_count" INTEGER NOT NULL DEFAULT 0,
    "decided_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eq_assessments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "summary_vi" TEXT,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eq_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eq_scores" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 0,
    "prosocial_choices" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,

    CONSTRAINT "eq_scores_pkey" PRIMARY KEY ("id")
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
    "character_id" UUID,
    "prompt_template_id" UUID,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'mock',
    "model_name" VARCHAR(100),
    "status" "ai_request_status" NOT NULL DEFAULT 'queued',
    "quota_source" "quota_source" NOT NULL,
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
    "source" "entitlement_source" NOT NULL,
    "order_item_id" UUID,
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
    "visibility" "review_visibility" NOT NULL DEFAULT 'visible',
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
    "period" "plan_period" NOT NULL,
    "price_vnd" BIGINT NOT NULL,
    "ai_story_quota" INTEGER NOT NULL,
    "ai_image_quota" INTEGER NOT NULL,
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
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonus_credits" INTEGER NOT NULL DEFAULT 0,
    "price_vnd" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
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
    "payos_order_code" BIGINT NOT NULL,
    "payos_payment_link_id" VARCHAR(100),
    "payos_transaction_id" VARCHAR(100),
    "paid_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_type" "order_item_type" NOT NULL,
    "plan_id" UUID,
    "credit_pack_id" UUID,
    "listing_id" UUID,
    "unit_price_vnd" BIGINT NOT NULL,
    "credits_granted" INTEGER,
    "bonus_granted" INTEGER,
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
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "characters_parent_id_idx" ON "characters"("parent_id");

-- CreateIndex
CREATE INDEX "characters_child_id_idx" ON "characters"("child_id");

-- CreateIndex
CREATE INDEX "child_usage_sessions_child_id_usage_date_idx" ON "child_usage_sessions"("child_id", "usage_date");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "eq_skills_casel_code_key" ON "eq_skills"("casel_code");

-- CreateIndex
CREATE INDEX "templates_status_primary_skill_id_idx" ON "templates"("status", "primary_skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_stages_template_id_stage_order_key" ON "template_stages"("template_id", "stage_order");

-- CreateIndex
CREATE UNIQUE INDEX "template_choice_types_stage_id_choice_order_key" ON "template_choice_types"("stage_id", "choice_order");

-- CreateIndex
CREATE UNIQUE INDEX "ui_audio_assets_key_lang_key" ON "ui_audio_assets"("key", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_keywords_keyword_key" ON "blocked_keywords"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_code_key" ON "checklist_items"("code");

-- CreateIndex
CREATE INDEX "stories_owner_id_kind_idx" ON "stories"("owner_id", "kind");

-- CreateIndex
CREATE INDEX "story_characters_character_id_idx" ON "story_characters"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_pages_from_choice_id_key" ON "story_pages"("from_choice_id");

-- CreateIndex
CREATE INDEX "story_pages_stage_id_idx" ON "story_pages"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_pages_story_id_page_order_key" ON "story_pages"("story_id", "page_order");

-- CreateIndex
CREATE UNIQUE INDEX "story_choices_page_id_choice_order_key" ON "story_choices"("page_id", "choice_order");

-- CreateIndex
CREATE INDEX "play_sessions_child_id_status_idx" ON "play_sessions"("child_id", "status");

-- CreateIndex
CREATE INDEX "play_sessions_story_id_status_idx" ON "play_sessions"("story_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "play_decisions_session_id_page_id_key" ON "play_decisions"("session_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "eq_assessments_session_id_key" ON "eq_assessments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "eq_scores_assessment_id_skill_id_key" ON "eq_scores"("assessment_id", "skill_id");

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
CREATE INDEX "product_reviews_listing_id_visibility_idx" ON "product_reviews"("listing_id", "visibility");

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
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_primary_skill_id_fkey" FOREIGN KEY ("primary_skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_stages" ADD CONSTRAINT "template_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_choice_types" ADD CONSTRAINT "template_choice_types_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "template_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_choice_signals" ADD CONSTRAINT "template_choice_signals_choice_type_id_fkey" FOREIGN KEY ("choice_type_id") REFERENCES "template_choice_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_choice_signals" ADD CONSTRAINT "template_choice_signals_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_slots" ADD CONSTRAINT "template_slots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_keywords" ADD CONSTRAINT "blocked_keywords_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_source_story_id_fkey" FOREIGN KEY ("source_story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "template_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_from_choice_id_fkey" FOREIGN KEY ("from_choice_id") REFERENCES "story_choices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_background_id_fkey" FOREIGN KEY ("background_id") REFERENCES "backgrounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_choice_type_id_fkey" FOREIGN KEY ("choice_type_id") REFERENCES "template_choice_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "play_decisions" ADD CONSTRAINT "play_decisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_decisions" ADD CONSTRAINT "play_decisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_decisions" ADD CONSTRAINT "play_decisions_choice_id_fkey" FOREIGN KEY ("choice_id") REFERENCES "story_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_assessments" ADD CONSTRAINT "eq_assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_scores" ADD CONSTRAINT "eq_scores_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "eq_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_scores" ADD CONSTRAINT "eq_scores_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "story_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_credit_pack_id_fkey" FOREIGN KEY ("credit_pack_id") REFERENCES "credit_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
