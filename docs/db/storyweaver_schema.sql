-- =================================================================================================
-- StoryWeaver AI - PostgreSQL 16 database schema (DDL only, no data)
--
-- (20260927000000_init_rev8 .. 20261102000000_trim_schema) to an empty PostgreSQL 16 database,
-- then dumping it with: pg_dump --schema-only --no-owner --no-privileges
--
-- Includes everything Prisma cannot express in schema.prisma: CHECK constraints, partial unique
-- indexes, and the append-only trigger on wallet_ledger.
--
-- Usage (empty database):
--   createdb storyweaver
--   psql -d storyweaver -v ON_ERROR_STOP=1 -f storyweaver_schema.sql
--
-- The source of truth is still api/prisma/migrations. The app uses `npx prisma migrate deploy`
-- + `npm run db:setup` (seed). A database created from this file has no _prisma_migrations table,
-- so do not run `prisma migrate deploy` on it afterwards. Reference data (plans, settings, CASEL
-- sub-skills, templates) comes from the seed scripts in api/prisma/seed*.js.
-- =================================================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: ai_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_request_status AS ENUM (
    'queued',
    'processing',
    'succeeded',
    'failed',
    'blocked'
);


--
-- Name: ai_request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_request_type AS ENUM (
    'story_text',
    'character_portrait',
    'scene_image',
    'narration',
    'story_analysis'
);


--
-- Name: answer_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.answer_format AS ENUM (
    'emotion_pick',
    'single_correct',
    'role_choice'
);


--
-- Name: auth_token_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auth_token_type AS ENUM (
    'refresh',
    'email_verify',
    'password_reset',
    'kid_session'
);


--
-- Name: casel_competency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.casel_competency AS ENUM (
    'self_awareness',
    'self_management',
    'social_awareness',
    'relationship_skills',
    'responsible_decision_making'
);


--
-- Name: checkpoint_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checkpoint_type AS ENUM (
    'emotion_self',
    'emotion_other',
    'perspective',
    'problem_solving',
    'reflection'
);


--
-- Name: content_origin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.content_origin AS ENUM (
    'human',
    'ai',
    'ai_edited'
);


--
-- Name: emotion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.emotion AS ENUM (
    'happy',
    'sad',
    'angry',
    'scared',
    'neutral'
);


--
-- Name: generation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.generation_status AS ENUM (
    'none',
    'queued',
    'generating',
    'ready',
    'failed'
);


--
-- Name: keyword_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.keyword_severity AS ENUM (
    'block',
    'warn'
);


--
-- Name: ledger_entry_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_entry_type AS ENUM (
    'credit_grant',
    'credit_expire',
    'credit_hold',
    'credit_release',
    'credit_consume',
    'earning_pending',
    'earning_release',
    'earning_reversal',
    'withdrawal_hold',
    'withdrawal_paid',
    'withdrawal_release'
);


--
-- Name: listing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.listing_status AS ENUM (
    'submitted',
    'in_review',
    'changes_requested',
    'rejected',
    'published',
    'suspended',
    'archived'
);


--
-- Name: moderation_decision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.moderation_decision AS ENUM (
    'approved',
    'changes_requested',
    'rejected',
    'taken_down'
);


--
-- Name: moderation_review_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.moderation_review_type AS ENUM (
    'submission',
    'random_audit',
    'report_followup'
);


--
-- Name: option_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.option_role AS ENUM (
    'constructive',
    'avoidant',
    'impulsive'
);


--
-- Name: order_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_item_status AS ENUM (
    'active',
    'refunded'
);


--
-- Name: order_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_item_type AS ENUM (
    'plan',
    'listing'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'paid',
    'failed',
    'cancelled',
    'expired'
);


--
-- Name: play_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.play_status AS ENUM (
    'in_progress',
    'completed',
    'abandoned'
);


--
-- Name: report_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_category AS ENUM (
    'scary',
    'violent',
    'inappropriate_lesson',
    'personal_info',
    'technical_error',
    'other'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_status AS ENUM (
    'open',
    'resolved',
    'dismissed'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: review_tag; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_tag AS ENUM (
    'child_liked',
    'age_appropriate',
    'clear_lesson',
    'beautiful_art',
    'good_narration'
);


--
-- Name: seller_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.seller_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


--
-- Name: story_entry; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.story_entry AS ENUM (
    'topic',
    'family',
    'handwritten'
);


--
-- Name: story_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.story_kind AS ENUM (
    'private',
    'published'
);


--
-- Name: story_length; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.story_length AS ENUM (
    'short',
    'medium',
    'long',
    'custom'
);


--
-- Name: story_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.story_status AS ENUM (
    'draft',
    'generating',
    'ready'
);


--
-- Name: story_sub_skill_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.story_sub_skill_source AS ENUM (
    'moment',
    'need',
    'parent'
);


--
-- Name: strike_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.strike_source AS ENUM (
    'report',
    'rejection',
    'takedown'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'expired',
    'cancelled'
);


--
-- Name: template_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.template_status AS ENUM (
    'draft',
    'published'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'specialist',
    'parent'
);


--
-- Name: wallet_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_type AS ENUM (
    'credit',
    'earning'
);


--
-- Name: withdrawal_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.withdrawal_status AS ENUM (
    'requested',
    'paid',
    'rejected',
    'cancelled',
    'processing'
);


--
-- Name: wallet_ledger_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wallet_ledger_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    'wallet_ledger la append-only: khong duoc %  (so cai chi ghi them, moi thay doi so du la mot dong moi)',
    lower(TG_OP);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id bigint NOT NULL,
    actor_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    target_type character varying(50),
    target_id uuid,
    before_state jsonb,
    after_state jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_audit_logs_id_seq OWNED BY public.admin_audit_logs.id;


--
-- Name: ai_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_requests (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_type public.ai_request_type NOT NULL,
    story_id uuid,
    page_id uuid,
    checkpoint_id uuid,
    scene_id uuid,
    character_id uuid,
    provider character varying(40) DEFAULT 'mock'::character varying NOT NULL,
    model_name character varying(100),
    status public.ai_request_status DEFAULT 'queued'::public.ai_request_status NOT NULL,
    credits_charged integer DEFAULT 0 NOT NULL,
    input_tokens integer,
    output_tokens integer,
    output_units integer,
    provider_cost_micros bigint DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    error_message text,
    idempotency_key character varying(120) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT ai_requests_attempts_check CHECK ((attempts <= 3))
);


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type public.auth_token_type NOT NULL,
    token_hash character varying(255) NOT NULL,
    replaced_by_id uuid,
    child_id uuid,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT auth_tokens_child_id_check CHECK (((type = 'kid_session'::public.auth_token_type) = (child_id IS NOT NULL))),
    CONSTRAINT auth_tokens_replaced_by_check CHECK (((replaced_by_id IS NULL) OR (type = 'refresh'::public.auth_token_type)))
);


--
-- Name: blocked_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_keywords (
    id uuid NOT NULL,
    keyword character varying(100) NOT NULL,
    severity public.keyword_severity DEFAULT 'block'::public.keyword_severity NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bookshelf_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookshelf_items (
    child_id uuid NOT NULL,
    story_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id uuid NOT NULL,
    parent_id uuid NOT NULL,
    child_id uuid,
    name character varying(100) NOT NULL,
    appearance text NOT NULL,
    portrait_image_key character varying(300),
    gen_prompt text,
    gen_seed bigint,
    portrait_status public.generation_status DEFAULT 'none'::public.generation_status NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: checkpoint_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_answers (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    checkpoint_id uuid NOT NULL,
    first_emotion public.emotion,
    first_option_id uuid,
    final_emotion public.emotion,
    final_option_id uuid,
    attempts integer DEFAULT 1 NOT NULL,
    skipped boolean DEFAULT false NOT NULL,
    time_to_first_ms integer,
    question_replays integer DEFAULT 0 NOT NULL,
    skill_id uuid,
    score numeric(3,2),
    answered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sub_skill_id uuid,
    template_version_id uuid,
    CONSTRAINT checkpoint_answers_attempts_check CHECK (((attempts >= 1) AND (attempts <= 2)))
);


--
-- Name: checkpoint_answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checkpoint_answers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checkpoint_answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checkpoint_answers_id_seq OWNED BY public.checkpoint_answers.id;


--
-- Name: checkpoint_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_options (
    id uuid NOT NULL,
    checkpoint_id uuid NOT NULL,
    option_order integer NOT NULL,
    text text,
    role public.option_role,
    is_correct boolean,
    feedback text,
    text_audio_key character varying(300),
    feedback_audio_key character varying(300)
);


--
-- Name: child_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.child_profiles (
    id uuid NOT NULL,
    parent_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    birth_date date,
    preferred_voice character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: content_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_reports (
    id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    listing_id uuid,
    page_id uuid,
    product_review_id uuid,
    category public.report_category NOT NULL,
    description text,
    status public.report_status DEFAULT 'open'::public.report_status NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT content_reports_target_check CHECK ((num_nonnulls(listing_id, product_review_id) = 1))
);


--
-- Name: creator_strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creator_strikes (
    id uuid NOT NULL,
    seller_id uuid NOT NULL,
    source public.strike_source NOT NULL,
    source_id uuid,
    reason text NOT NULL,
    issued_by uuid NOT NULL,
    issued_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entitlements (
    id uuid NOT NULL,
    parent_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: eq_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eq_skills (
    id uuid NOT NULL,
    casel_code public.casel_competency NOT NULL,
    name_vi character varying(100) NOT NULL,
    name_en character varying(100) NOT NULL,
    description text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: eq_sub_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eq_sub_skills (
    id uuid NOT NULL,
    skill_id uuid NOT NULL,
    code character varying(60) NOT NULL,
    name_vi character varying(200) NOT NULL,
    description_vi text NOT NULL,
    age_min integer DEFAULT 5 NOT NULL,
    age_max integer DEFAULT 8 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    casel_text_en text NOT NULL,
    CONSTRAINT eq_sub_skills_age_range_check CHECK ((age_min <= age_max))
);


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid NOT NULL,
    seller_id uuid NOT NULL,
    published_story_id uuid NOT NULL,
    previous_listing_id uuid,
    title character varying(200) NOT NULL,
    description text,
    cover_image_key character varying(300),
    status public.listing_status DEFAULT 'submitted'::public.listing_status NOT NULL,
    has_ai_content boolean DEFAULT false NOT NULL,
    purchase_count integer DEFAULT 0 NOT NULL,
    free_claim_count integer DEFAULT 0 NOT NULL,
    rating_avg numeric(3,2),
    rating_count integer DEFAULT 0 NOT NULL,
    submitted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    price_vnd bigint NOT NULL,
    CONSTRAINT listings_price_check CHECK ((price_vnd >= 0))
);


--
-- Name: moderation_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_reviews (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    review_type public.moderation_review_type NOT NULL,
    moderator_id uuid,
    claimed_at timestamp with time zone,
    claim_expires_at timestamp with time zone,
    decision public.moderation_decision,
    comment text,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT moderation_reviews_decision_check CHECK (((decision IS NULL) = (decided_at IS NULL)))
);


--
-- Name: narration_clips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narration_clips (
    id uuid NOT NULL,
    story_id uuid NOT NULL,
    segment character varying(120) NOT NULL,
    fingerprint character(64) NOT NULL,
    status public.generation_status DEFAULT 'queued'::public.generation_status NOT NULL,
    round integer DEFAULT 1 NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    audio_key character varying(300),
    duration_seconds numeric(7,2),
    error_code character varying(40),
    error_message character varying(500),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    item_type public.order_item_type NOT NULL,
    plan_id uuid,
    listing_id uuid,
    unit_price_vnd bigint NOT NULL,
    seller_share_rate numeric(4,3),
    seller_amount_vnd bigint,
    status public.order_item_status DEFAULT 'active'::public.order_item_status NOT NULL,
    CONSTRAINT order_items_exclusive_arc_check CHECK ((((item_type = 'plan'::public.order_item_type) AND (plan_id IS NOT NULL) AND (listing_id IS NULL) AND (seller_share_rate IS NULL) AND (seller_amount_vnd IS NULL)) OR ((item_type = 'listing'::public.order_item_type) AND (listing_id IS NOT NULL) AND (plan_id IS NULL) AND (seller_share_rate IS NOT NULL) AND (seller_amount_vnd IS NOT NULL)))),
    CONSTRAINT order_items_price_check CHECK ((unit_price_vnd >= 0)),
    CONSTRAINT order_items_share_rate_check CHECK (((seller_share_rate IS NULL) OR ((seller_share_rate > (0)::numeric) AND (seller_share_rate <= (1)::numeric))))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    subtotal_vnd bigint NOT NULL,
    total_vnd bigint NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    payos_order_code bigint,
    payos_payment_link_id character varying(100),
    payos_transaction_id character varying(100),
    paid_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT orders_payos_order_code_check CHECK (((total_vnd = 0) OR (payos_order_code IS NOT NULL))),
    CONSTRAINT orders_total_check CHECK ((total_vnd = subtotal_vnd))
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(100) NOT NULL,
    duration_months integer NOT NULL,
    price_vnd bigint NOT NULL,
    credits_per_month integer NOT NULL,
    max_children integer NOT NULL,
    max_characters integer NOT NULL,
    can_sell boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT plans_price_check CHECK ((price_vnd >= 0))
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key character varying(60) NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: play_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.play_sessions (
    id uuid NOT NULL,
    child_id uuid NOT NULL,
    story_id uuid NOT NULL,
    is_first_play boolean NOT NULL,
    status public.play_status DEFAULT 'in_progress'::public.play_status NOT NULL,
    current_page_id uuid,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_activity_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    hidden_at timestamp with time zone,
    hidden_by uuid,
    seller_reply text,
    seller_replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tags public.review_tag[] DEFAULT '{}'::public.review_tag[] NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: question_template_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_template_versions (
    id uuid NOT NULL,
    template_id uuid NOT NULL,
    version integer NOT NULL,
    status public.template_status DEFAULT 'draft'::public.template_status NOT NULL,
    question_frame text NOT NULL,
    page_setup text,
    needs_target boolean DEFAULT false NOT NULL,
    allowed_emotions public.emotion[] DEFAULT ARRAY[]::public.emotion[],
    correct_desc text,
    distractor_desc text,
    constructive_desc text,
    avoidant_desc text,
    impulsive_desc text,
    constructive_score numeric(3,2),
    avoidant_score numeric(3,2),
    impulsive_score numeric(3,2),
    hint_guidance text,
    parent_prompts text[] DEFAULT ARRAY[]::text[],
    rationale text,
    reference_url character varying(500),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_by uuid,
    published_at timestamp with time zone
);


--
-- Name: question_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_templates (
    id uuid NOT NULL,
    sub_skill_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    answer_format public.answer_format NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: refund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_requests (
    id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    reason text NOT NULL,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone,
    bank_transaction_ref character varying(100),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decision_note text,
    CONSTRAINT refund_requests_approved_ref_check CHECK (((status <> 'approved'::public.request_status) OR (bank_transaction_ref IS NOT NULL)))
);


--
-- Name: review_page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_page_views (
    review_id uuid NOT NULL,
    page_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    comment text
);


--
-- Name: seller_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_profiles (
    user_id uuid NOT NULL,
    display_name character varying(100) NOT NULL,
    bio text,
    expertise text,
    status public.seller_status DEFAULT 'pending'::public.seller_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    bank_name character varying(100),
    bank_account_number character varying(255),
    bank_account_holder character varying(150),
    bank_updated_at timestamp with time zone,
    total_sales integer DEFAULT 0 NOT NULL,
    rating_avg numeric(3,2),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bank_bin character varying(20)
);


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stories (
    id uuid NOT NULL,
    owner_id uuid NOT NULL,
    kind public.story_kind DEFAULT 'private'::public.story_kind NOT NULL,
    source_story_id uuid,
    topic_id uuid,
    length public.story_length DEFAULT 'medium'::public.story_length NOT NULL,
    title character varying(200) NOT NULL,
    situation text,
    use_ai_image boolean DEFAULT false NOT NULL,
    use_tts boolean DEFAULT true NOT NULL,
    status public.story_status DEFAULT 'draft'::public.story_status NOT NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone,
    entry public.story_entry DEFAULT 'topic'::public.story_entry NOT NULL,
    moment_summary text,
    seed_event text,
    scored boolean DEFAULT true NOT NULL,
    cover_scene_id uuid,
    CONSTRAINT stories_family_moment_check CHECK (((kind <> 'private'::public.story_kind) OR ((entry = 'family'::public.story_entry) = ((moment_summary IS NOT NULL) OR (seed_event IS NOT NULL) OR (NOT scored))))),
    CONSTRAINT stories_published_source_check CHECK (((kind <> 'published'::public.story_kind) OR (source_story_id IS NOT NULL))),
    CONSTRAINT stories_topic_required_check CHECK (((entry <> 'topic'::public.story_entry) OR (topic_id IS NOT NULL)))
);


--
-- Name: story_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_characters (
    story_id uuid NOT NULL,
    token character varying(10) NOT NULL,
    character_id uuid,
    alias_name character varying(100),
    is_main boolean DEFAULT false NOT NULL,
    CONSTRAINT story_characters_identity_check CHECK (((character_id IS NOT NULL) <> (alias_name IS NOT NULL)))
);


--
-- Name: story_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_checkpoints (
    id uuid NOT NULL,
    story_id uuid NOT NULL,
    after_page_id uuid NOT NULL,
    type public.checkpoint_type NOT NULL,
    target_token character varying(10),
    question text,
    answer_emotion public.emotion,
    hint text,
    origin public.content_origin DEFAULT 'human'::public.content_origin NOT NULL,
    question_audio_key character varying(300),
    hint_audio_key character varying(300),
    excluded boolean DEFAULT false NOT NULL,
    excluded_at timestamp with time zone,
    excluded_by uuid,
    excluded_reason text,
    reviewed_ok_at timestamp with time zone,
    reviewed_ok_by uuid,
    scored boolean DEFAULT false NOT NULL,
    sub_skill_id uuid,
    template_version_id uuid,
    CONSTRAINT story_checkpoints_answer_emotion_check CHECK (((type = ANY (ARRAY['emotion_self'::public.checkpoint_type, 'emotion_other'::public.checkpoint_type])) = (answer_emotion IS NOT NULL))),
    CONSTRAINT story_checkpoints_target_token_forbidden_check CHECK (((type <> ALL (ARRAY['emotion_self'::public.checkpoint_type, 'problem_solving'::public.checkpoint_type, 'reflection'::public.checkpoint_type])) OR (target_token IS NULL))),
    CONSTRAINT story_checkpoints_target_token_required_check CHECK (((type = 'emotion_other'::public.checkpoint_type) <= (target_token IS NOT NULL)))
);


--
-- Name: story_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_pages (
    id uuid NOT NULL,
    story_id uuid NOT NULL,
    page_order integer NOT NULL,
    scene_id uuid NOT NULL,
    content_text text,
    ai_original_text text,
    origin public.content_origin DEFAULT 'human'::public.content_origin NOT NULL,
    audio_key character varying(300),
    audio_status public.generation_status DEFAULT 'none'::public.generation_status NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: story_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_scenes (
    id uuid NOT NULL,
    story_id uuid NOT NULL,
    scene_order integer NOT NULL,
    description text NOT NULL,
    image_key character varying(300),
    image_status public.generation_status DEFAULT 'none'::public.generation_status NOT NULL
);


--
-- Name: story_sub_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_sub_skills (
    story_id uuid NOT NULL,
    sub_skill_id uuid NOT NULL,
    source public.story_sub_skill_source NOT NULL,
    "position" smallint NOT NULL,
    CONSTRAINT story_sub_skills_position_check CHECK ((("position" >= 1) AND ("position" <= 2)))
);


--
-- Name: strike_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strike_appeals (
    id uuid NOT NULL,
    strike_id uuid NOT NULL,
    reason text NOT NULL,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid NOT NULL,
    parent_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    order_item_id uuid,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    next_credit_grant_at timestamp with time zone NOT NULL,
    status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: topic_sub_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_sub_skills (
    topic_id uuid NOT NULL,
    sub_skill_id uuid NOT NULL
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid NOT NULL,
    title character varying(200) NOT NULL,
    skill_id uuid NOT NULL,
    guidance text NOT NULL,
    age_min integer DEFAULT 5 NOT NULL,
    age_max integer DEFAULT 8 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT topics_age_range_check CHECK ((age_min <= age_max))
);


--
-- Name: ui_audio_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ui_audio_assets (
    id uuid NOT NULL,
    key character varying(80) NOT NULL,
    lang character varying(10) DEFAULT 'vi'::character varying NOT NULL,
    text_content text NOT NULL,
    audio_key character varying(300) NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    role public.user_role DEFAULT 'parent'::public.user_role NOT NULL,
    username character varying(50) NOT NULL,
    email public.citext NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(150),
    phone character varying(20),
    kid_exit_pin_hash character varying(255),
    email_verified_at timestamp with time zone,
    last_login_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone,
    ai_blocked_until timestamp with time zone
);


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    wallet_type public.wallet_type NOT NULL,
    entry_type public.ledger_entry_type NOT NULL,
    amount bigint NOT NULL,
    balance_after bigint NOT NULL,
    available_at timestamp with time zone,
    idempotency_key character varying(120) NOT NULL,
    ref_type character varying(50),
    ref_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_ledger_id_seq OWNED BY public.wallet_ledger.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    user_id uuid NOT NULL,
    credit_balance integer DEFAULT 0 NOT NULL,
    earning_pending_vnd bigint DEFAULT 0 NOT NULL,
    earning_available_vnd bigint DEFAULT 0 NOT NULL,
    earning_locked_vnd bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT wallets_non_negative_check CHECK (((credit_balance >= 0) AND (earning_pending_vnd >= 0) AND (earning_available_vnd >= 0) AND (earning_locked_vnd >= 0)))
);


--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id bigint NOT NULL,
    provider character varying(30) DEFAULT 'payos'::character varying NOT NULL,
    payos_order_code bigint,
    payload jsonb NOT NULL,
    signature_valid boolean NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    error_message text,
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: webhook_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_logs_id_seq OWNED BY public.webhook_logs.id;


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_requests (
    id uuid NOT NULL,
    seller_id uuid NOT NULL,
    amount_vnd bigint NOT NULL,
    bank_snapshot jsonb NOT NULL,
    status public.withdrawal_status DEFAULT 'requested'::public.withdrawal_status NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone,
    bank_transaction_ref character varying(100),
    reject_reason text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT withdrawal_requests_amount_check CHECK ((amount_vnd > 0))
);


--
-- Name: admin_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_logs_id_seq'::regclass);


--
-- Name: checkpoint_answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers ALTER COLUMN id SET DEFAULT nextval('public.checkpoint_answers_id_seq'::regclass);


--
-- Name: wallet_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger ALTER COLUMN id SET DEFAULT nextval('public.wallet_ledger_id_seq'::regclass);


--
-- Name: webhook_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs ALTER COLUMN id SET DEFAULT nextval('public.webhook_logs_id_seq'::regclass);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_requests ai_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: blocked_keywords blocked_keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_keywords
    ADD CONSTRAINT blocked_keywords_pkey PRIMARY KEY (id);


--
-- Name: bookshelf_items bookshelf_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookshelf_items
    ADD CONSTRAINT bookshelf_items_pkey PRIMARY KEY (child_id, story_id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_answers checkpoint_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_options checkpoint_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_options
    ADD CONSTRAINT checkpoint_options_pkey PRIMARY KEY (id);


--
-- Name: child_profiles child_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_profiles
    ADD CONSTRAINT child_profiles_pkey PRIMARY KEY (id);


--
-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);


--
-- Name: creator_strikes creator_strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_strikes
    ADD CONSTRAINT creator_strikes_pkey PRIMARY KEY (id);


--
-- Name: entitlements entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_pkey PRIMARY KEY (id);


--
-- Name: eq_skills eq_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eq_skills
    ADD CONSTRAINT eq_skills_pkey PRIMARY KEY (id);


--
-- Name: eq_sub_skills eq_sub_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eq_sub_skills
    ADD CONSTRAINT eq_sub_skills_pkey PRIMARY KEY (id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: moderation_reviews moderation_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reviews
    ADD CONSTRAINT moderation_reviews_pkey PRIMARY KEY (id);


--
-- Name: narration_clips narration_clips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narration_clips
    ADD CONSTRAINT narration_clips_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: play_sessions play_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_sessions
    ADD CONSTRAINT play_sessions_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: question_template_versions question_template_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_template_versions
    ADD CONSTRAINT question_template_versions_pkey PRIMARY KEY (id);


--
-- Name: question_templates question_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_templates
    ADD CONSTRAINT question_templates_pkey PRIMARY KEY (id);


--
-- Name: refund_requests refund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_pkey PRIMARY KEY (id);


--
-- Name: review_page_views review_page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_page_views
    ADD CONSTRAINT review_page_views_pkey PRIMARY KEY (review_id, page_id);


--
-- Name: seller_profiles seller_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profiles
    ADD CONSTRAINT seller_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: story_characters story_characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_characters
    ADD CONSTRAINT story_characters_pkey PRIMARY KEY (story_id, token);


--
-- Name: story_checkpoints story_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: story_pages story_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_pages
    ADD CONSTRAINT story_pages_pkey PRIMARY KEY (id);


--
-- Name: story_scenes story_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scenes
    ADD CONSTRAINT story_scenes_pkey PRIMARY KEY (id);


--
-- Name: story_sub_skills story_sub_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_sub_skills
    ADD CONSTRAINT story_sub_skills_pkey PRIMARY KEY (story_id, sub_skill_id);


--
-- Name: strike_appeals strike_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strike_appeals
    ADD CONSTRAINT strike_appeals_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: topic_sub_skills topic_sub_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_sub_skills
    ADD CONSTRAINT topic_sub_skills_pkey PRIMARY KEY (topic_id, sub_skill_id);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: ui_audio_assets ui_audio_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ui_audio_assets
    ADD CONSTRAINT ui_audio_assets_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (user_id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs_actor_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_actor_id_created_at_idx ON public.admin_audit_logs USING btree (actor_id, created_at);


--
-- Name: admin_audit_logs_target_type_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_target_type_target_id_idx ON public.admin_audit_logs USING btree (target_type, target_id);


--
-- Name: ai_requests_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_requests_created_at_idx ON public.ai_requests USING btree (created_at);


--
-- Name: ai_requests_idempotency_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_requests_idempotency_key_key ON public.ai_requests USING btree (idempotency_key);


--
-- Name: ai_requests_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_requests_story_id_idx ON public.ai_requests USING btree (story_id);


--
-- Name: ai_requests_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_requests_user_id_created_at_idx ON public.ai_requests USING btree (user_id, created_at);


--
-- Name: auth_tokens_child_id_active_kid_session_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_tokens_child_id_active_kid_session_key ON public.auth_tokens USING btree (child_id) WHERE ((type = 'kid_session'::public.auth_token_type) AND (consumed_at IS NULL));


--
-- Name: auth_tokens_child_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_tokens_child_id_idx ON public.auth_tokens USING btree (child_id);


--
-- Name: auth_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_tokens_expires_at_idx ON public.auth_tokens USING btree (expires_at);


--
-- Name: auth_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_tokens_token_hash_key ON public.auth_tokens USING btree (token_hash);


--
-- Name: auth_tokens_user_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_tokens_user_id_type_idx ON public.auth_tokens USING btree (user_id, type);


--
-- Name: blocked_keywords_keyword_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blocked_keywords_keyword_key ON public.blocked_keywords USING btree (keyword);


--
-- Name: characters_child_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX characters_child_id_key ON public.characters USING btree (child_id);


--
-- Name: characters_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_parent_id_idx ON public.characters USING btree (parent_id);


--
-- Name: checkpoint_answers_session_id_checkpoint_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX checkpoint_answers_session_id_checkpoint_id_key ON public.checkpoint_answers USING btree (session_id, checkpoint_id);


--
-- Name: checkpoint_answers_sub_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkpoint_answers_sub_skill_id_idx ON public.checkpoint_answers USING btree (sub_skill_id);


--
-- Name: checkpoint_options_checkpoint_id_option_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX checkpoint_options_checkpoint_id_option_order_key ON public.checkpoint_options USING btree (checkpoint_id, option_order);


--
-- Name: child_profiles_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX child_profiles_parent_id_idx ON public.child_profiles USING btree (parent_id);


--
-- Name: content_reports_listing_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_listing_id_created_at_idx ON public.content_reports USING btree (listing_id, created_at);


--
-- Name: content_reports_reporter_id_listing_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX content_reports_reporter_id_listing_id_key ON public.content_reports USING btree (reporter_id, listing_id) WHERE (listing_id IS NOT NULL);


--
-- Name: content_reports_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_status_created_at_idx ON public.content_reports USING btree (status, created_at);


--
-- Name: creator_strikes_seller_id_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX creator_strikes_seller_id_expires_at_idx ON public.creator_strikes USING btree (seller_id, expires_at);


--
-- Name: entitlements_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entitlements_parent_id_idx ON public.entitlements USING btree (parent_id);


--
-- Name: entitlements_parent_id_listing_id_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entitlements_parent_id_listing_id_active_key ON public.entitlements USING btree (parent_id, listing_id) WHERE (revoked_at IS NULL);


--
-- Name: eq_skills_casel_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eq_skills_casel_code_key ON public.eq_skills USING btree (casel_code);


--
-- Name: eq_sub_skills_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eq_sub_skills_code_key ON public.eq_sub_skills USING btree (code);


--
-- Name: eq_sub_skills_skill_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eq_sub_skills_skill_id_is_active_idx ON public.eq_sub_skills USING btree (skill_id, is_active);


--
-- Name: listings_published_story_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listings_published_story_id_key ON public.listings USING btree (published_story_id);


--
-- Name: listings_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_id_idx ON public.listings USING btree (seller_id);


--
-- Name: listings_status_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_status_published_at_idx ON public.listings USING btree (status, published_at);


--
-- Name: moderation_reviews_decided_at_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_reviews_decided_at_created_at_idx ON public.moderation_reviews USING btree (decided_at, created_at);


--
-- Name: moderation_reviews_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_reviews_listing_id_idx ON public.moderation_reviews USING btree (listing_id);


--
-- Name: moderation_reviews_listing_id_open_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX moderation_reviews_listing_id_open_key ON public.moderation_reviews USING btree (listing_id) WHERE (decided_at IS NULL);


--
-- Name: narration_clips_story_id_segment_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX narration_clips_story_id_segment_key ON public.narration_clips USING btree (story_id, segment);


--
-- Name: order_items_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_listing_id_idx ON public.order_items USING btree (listing_id);


--
-- Name: order_items_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);


--
-- Name: orders_buyer_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_buyer_id_created_at_idx ON public.orders USING btree (buyer_id, created_at);


--
-- Name: orders_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_paid_at_idx ON public.orders USING btree (paid_at) WHERE (status = 'paid'::public.order_status);


--
-- Name: orders_payos_order_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_payos_order_code_key ON public.orders USING btree (payos_order_code);


--
-- Name: orders_payos_transaction_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_payos_transaction_id_key ON public.orders USING btree (payos_transaction_id);


--
-- Name: orders_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_expires_at_idx ON public.orders USING btree (status, expires_at);


--
-- Name: plans_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);


--
-- Name: play_sessions_child_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX play_sessions_child_id_status_idx ON public.play_sessions USING btree (child_id, status);


--
-- Name: play_sessions_child_id_story_id_first_play_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX play_sessions_child_id_story_id_first_play_key ON public.play_sessions USING btree (child_id, story_id) WHERE is_first_play;


--
-- Name: play_sessions_story_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX play_sessions_story_id_status_idx ON public.play_sessions USING btree (story_id, status);


--
-- Name: product_reviews_listing_id_hidden_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_listing_id_hidden_at_idx ON public.product_reviews USING btree (listing_id, hidden_at);


--
-- Name: product_reviews_listing_id_parent_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_reviews_listing_id_parent_id_key ON public.product_reviews USING btree (listing_id, parent_id);


--
-- Name: question_template_versions_template_id_draft_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX question_template_versions_template_id_draft_key ON public.question_template_versions USING btree (template_id) WHERE (status = 'draft'::public.template_status);


--
-- Name: question_template_versions_template_id_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX question_template_versions_template_id_version_key ON public.question_template_versions USING btree (template_id, version);


--
-- Name: question_templates_sub_skill_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_templates_sub_skill_id_is_active_idx ON public.question_templates USING btree (sub_skill_id, is_active);


--
-- Name: refund_requests_order_item_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refund_requests_order_item_id_key ON public.refund_requests USING btree (order_item_id);


--
-- Name: stories_owner_id_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_owner_id_kind_idx ON public.stories USING btree (owner_id, kind);


--
-- Name: stories_topic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_topic_id_idx ON public.stories USING btree (topic_id);


--
-- Name: story_characters_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_characters_character_id_idx ON public.story_characters USING btree (character_id);


--
-- Name: story_characters_story_id_is_main_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_characters_story_id_is_main_key ON public.story_characters USING btree (story_id) WHERE is_main;


--
-- Name: story_checkpoints_after_page_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_checkpoints_after_page_id_key ON public.story_checkpoints USING btree (after_page_id);


--
-- Name: story_checkpoints_story_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_checkpoints_story_id_idx ON public.story_checkpoints USING btree (story_id);


--
-- Name: story_checkpoints_sub_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_checkpoints_sub_skill_id_idx ON public.story_checkpoints USING btree (sub_skill_id);


--
-- Name: story_checkpoints_template_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_checkpoints_template_version_id_idx ON public.story_checkpoints USING btree (template_version_id);


--
-- Name: story_pages_scene_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_pages_scene_id_idx ON public.story_pages USING btree (scene_id);


--
-- Name: story_pages_story_id_page_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_pages_story_id_page_order_key ON public.story_pages USING btree (story_id, page_order);


--
-- Name: story_scenes_story_id_scene_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_scenes_story_id_scene_order_key ON public.story_scenes USING btree (story_id, scene_order);


--
-- Name: story_sub_skills_story_id_position_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_sub_skills_story_id_position_key ON public.story_sub_skills USING btree (story_id, "position");


--
-- Name: story_sub_skills_sub_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_sub_skills_sub_skill_id_idx ON public.story_sub_skills USING btree (sub_skill_id);


--
-- Name: strike_appeals_strike_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX strike_appeals_strike_id_key ON public.strike_appeals USING btree (strike_id);


--
-- Name: subscriptions_active_next_grant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_active_next_grant_idx ON public.subscriptions USING btree (next_credit_grant_at) WHERE (status = 'active'::public.subscription_status);


--
-- Name: subscriptions_parent_id_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscriptions_parent_id_active_key ON public.subscriptions USING btree (parent_id) WHERE (status = 'active'::public.subscription_status);


--
-- Name: subscriptions_parent_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_parent_id_status_idx ON public.subscriptions USING btree (parent_id, status);


--
-- Name: topic_sub_skills_sub_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topic_sub_skills_sub_skill_id_idx ON public.topic_sub_skills USING btree (sub_skill_id);


--
-- Name: topics_is_active_skill_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_is_active_skill_id_idx ON public.topics USING btree (is_active, skill_id);


--
-- Name: ui_audio_assets_key_lang_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ui_audio_assets_key_lang_key ON public.ui_audio_assets USING btree (key, lang);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);


--
-- Name: wallet_ledger_entry_type_available_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_ledger_entry_type_available_at_idx ON public.wallet_ledger USING btree (entry_type, available_at);


--
-- Name: wallet_ledger_idempotency_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wallet_ledger_idempotency_key_key ON public.wallet_ledger USING btree (idempotency_key);


--
-- Name: wallet_ledger_user_id_wallet_type_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_ledger_user_id_wallet_type_created_at_idx ON public.wallet_ledger USING btree (user_id, wallet_type, created_at);


--
-- Name: webhook_logs_payos_order_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_logs_payos_order_code_idx ON public.webhook_logs USING btree (payos_order_code);


--
-- Name: withdrawal_requests_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawal_requests_seller_id_idx ON public.withdrawal_requests USING btree (seller_id);


--
-- Name: withdrawal_requests_seller_id_unfinished_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX withdrawal_requests_seller_id_unfinished_key ON public.withdrawal_requests USING btree (seller_id) WHERE (status = ANY (ARRAY['requested'::public.withdrawal_status, 'processing'::public.withdrawal_status]));


--
-- Name: withdrawal_requests_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawal_requests_status_created_at_idx ON public.withdrawal_requests USING btree (status, created_at);


--
-- Name: wallet_ledger wallet_ledger_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wallet_ledger_no_update_delete BEFORE DELETE OR UPDATE ON public.wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_append_only();


--
-- Name: admin_audit_logs admin_audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ai_requests ai_requests_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_requests ai_requests_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.story_checkpoints(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_requests ai_requests_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.story_pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_requests ai_requests_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.story_scenes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_requests ai_requests_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_requests ai_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_requests
    ADD CONSTRAINT ai_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: auth_tokens auth_tokens_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auth_tokens auth_tokens_replaced_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_replaced_by_id_fkey FOREIGN KEY (replaced_by_id) REFERENCES public.auth_tokens(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: blocked_keywords blocked_keywords_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_keywords
    ADD CONSTRAINT blocked_keywords_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bookshelf_items bookshelf_items_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookshelf_items
    ADD CONSTRAINT bookshelf_items_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookshelf_items bookshelf_items_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookshelf_items
    ADD CONSTRAINT bookshelf_items_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: characters characters_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: characters characters_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.story_checkpoints(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_final_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_final_option_id_fkey FOREIGN KEY (final_option_id) REFERENCES public.checkpoint_options(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_first_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_first_option_id_fkey FOREIGN KEY (first_option_id) REFERENCES public.checkpoint_options(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.play_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: checkpoint_answers checkpoint_answers_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.eq_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_sub_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_sub_skill_id_fkey FOREIGN KEY (sub_skill_id) REFERENCES public.eq_sub_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_answers checkpoint_answers_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_answers
    ADD CONSTRAINT checkpoint_answers_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES public.question_template_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: checkpoint_options checkpoint_options_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_options
    ADD CONSTRAINT checkpoint_options_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.story_checkpoints(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: child_profiles child_profiles_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.child_profiles
    ADD CONSTRAINT child_profiles_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: content_reports content_reports_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: content_reports content_reports_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: content_reports content_reports_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.story_pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: content_reports content_reports_product_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_product_review_id_fkey FOREIGN KEY (product_review_id) REFERENCES public.product_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: content_reports content_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: creator_strikes creator_strikes_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_strikes
    ADD CONSTRAINT creator_strikes_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: creator_strikes creator_strikes_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creator_strikes
    ADD CONSTRAINT creator_strikes_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.seller_profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: entitlements entitlements_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: entitlements entitlements_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: entitlements entitlements_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eq_sub_skills eq_sub_skills_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eq_sub_skills
    ADD CONSTRAINT eq_sub_skills_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eq_sub_skills eq_sub_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eq_sub_skills
    ADD CONSTRAINT eq_sub_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.eq_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: listings listings_previous_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_previous_listing_id_fkey FOREIGN KEY (previous_listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: listings listings_published_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_published_story_id_fkey FOREIGN KEY (published_story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: listings listings_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.seller_profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: moderation_reviews moderation_reviews_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reviews
    ADD CONSTRAINT moderation_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: moderation_reviews moderation_reviews_moderator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_reviews
    ADD CONSTRAINT moderation_reviews_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: narration_clips narration_clips_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narration_clips
    ADD CONSTRAINT narration_clips_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: order_items order_items_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: order_items order_items_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: orders orders_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: play_sessions play_sessions_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_sessions
    ADD CONSTRAINT play_sessions_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.child_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: play_sessions play_sessions_current_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_sessions
    ADD CONSTRAINT play_sessions_current_page_id_fkey FOREIGN KEY (current_page_id) REFERENCES public.story_pages(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: play_sessions play_sessions_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_sessions
    ADD CONSTRAINT play_sessions_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: product_reviews product_reviews_hidden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_hidden_by_fkey FOREIGN KEY (hidden_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: question_template_versions question_template_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_template_versions
    ADD CONSTRAINT question_template_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: question_template_versions question_template_versions_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_template_versions
    ADD CONSTRAINT question_template_versions_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: question_template_versions question_template_versions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_template_versions
    ADD CONSTRAINT question_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.question_templates(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: question_templates question_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_templates
    ADD CONSTRAINT question_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: question_templates question_templates_sub_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_templates
    ADD CONSTRAINT question_templates_sub_skill_id_fkey FOREIGN KEY (sub_skill_id) REFERENCES public.eq_sub_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refund_requests refund_requests_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: refund_requests refund_requests_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refund_requests refund_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_requests
    ADD CONSTRAINT refund_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: review_page_views review_page_views_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_page_views
    ADD CONSTRAINT review_page_views_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.story_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: review_page_views review_page_views_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_page_views
    ADD CONSTRAINT review_page_views_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.moderation_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: seller_profiles seller_profiles_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profiles
    ADD CONSTRAINT seller_profiles_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: seller_profiles seller_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_profiles
    ADD CONSTRAINT seller_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stories stories_cover_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_cover_scene_id_fkey FOREIGN KEY (cover_scene_id) REFERENCES public.story_scenes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: stories stories_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stories stories_source_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_source_story_id_fkey FOREIGN KEY (source_story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stories stories_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_characters story_characters_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_characters
    ADD CONSTRAINT story_characters_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_characters story_characters_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_characters
    ADD CONSTRAINT story_characters_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_checkpoints story_checkpoints_after_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_after_page_id_fkey FOREIGN KEY (after_page_id) REFERENCES public.story_pages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_checkpoints story_checkpoints_excluded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_excluded_by_fkey FOREIGN KEY (excluded_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_checkpoints story_checkpoints_reviewed_ok_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_reviewed_ok_by_fkey FOREIGN KEY (reviewed_ok_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_checkpoints story_checkpoints_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_checkpoints story_checkpoints_sub_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_sub_skill_id_fkey FOREIGN KEY (sub_skill_id) REFERENCES public.eq_sub_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_checkpoints story_checkpoints_template_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_checkpoints
    ADD CONSTRAINT story_checkpoints_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES public.question_template_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_pages story_pages_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_pages
    ADD CONSTRAINT story_pages_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.story_scenes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: story_pages story_pages_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_pages
    ADD CONSTRAINT story_pages_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_scenes story_scenes_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scenes
    ADD CONSTRAINT story_scenes_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_sub_skills story_sub_skills_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_sub_skills
    ADD CONSTRAINT story_sub_skills_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: story_sub_skills story_sub_skills_sub_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_sub_skills
    ADD CONSTRAINT story_sub_skills_sub_skill_id_fkey FOREIGN KEY (sub_skill_id) REFERENCES public.eq_sub_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: strike_appeals strike_appeals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strike_appeals
    ADD CONSTRAINT strike_appeals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: strike_appeals strike_appeals_strike_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strike_appeals
    ADD CONSTRAINT strike_appeals_strike_id_fkey FOREIGN KEY (strike_id) REFERENCES public.creator_strikes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: topic_sub_skills topic_sub_skills_sub_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_sub_skills
    ADD CONSTRAINT topic_sub_skills_sub_skill_id_fkey FOREIGN KEY (sub_skill_id) REFERENCES public.eq_sub_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: topic_sub_skills topic_sub_skills_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_sub_skills
    ADD CONSTRAINT topic_sub_skills_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: topics topics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: topics topics_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.eq_skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: wallet_ledger wallet_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: withdrawal_requests withdrawal_requests_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: withdrawal_requests withdrawal_requests_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.seller_profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


