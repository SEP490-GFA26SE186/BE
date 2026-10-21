-- Schema su pham CASEL (spec 2026-10-20 muc 5-6): muc CASEL, ky nang con, mau cau hoi co phien ban,
-- topic <-> ky nang con, cot truy vet tren checkpoint / cau tra loi.
-- Chi them bang / cot va noi long rang buoc, khong xoa du lieu. eq_competency_stats va story_layout.*
-- giu nguyen o dot nay (task sau moi doi).

-- CreateEnum
CREATE TYPE "answer_format" AS ENUM ('emotion_pick', 'single_correct', 'role_choice');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('draft', 'published');

-- AlterTable
ALTER TABLE "checkpoint_answers" ADD COLUMN     "sub_skill_id" UUID,
ADD COLUMN     "template_version_id" UUID;

-- AlterTable
ALTER TABLE "stories" ALTER COLUMN "topic_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "story_checkpoints" ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excluded_at" TIMESTAMPTZ,
ADD COLUMN     "excluded_by" UUID,
ADD COLUMN     "excluded_reason" TEXT,
ADD COLUMN     "reviewed_ok_at" TIMESTAMPTZ,
ADD COLUMN     "reviewed_ok_by" UUID,
ADD COLUMN     "scored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sub_skill_id" UUID,
ADD COLUMN     "template_version_id" UUID;

-- CreateTable
CREATE TABLE "casel_references" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "text_en" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "casel_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eq_sub_skills" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "casel_reference_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name_vi" VARCHAR(200) NOT NULL,
    "description_vi" TEXT NOT NULL,
    "age_min" INTEGER NOT NULL DEFAULT 5,
    "age_max" INTEGER NOT NULL DEFAULT 8,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eq_sub_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_templates" (
    "id" UUID NOT NULL,
    "sub_skill_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "answer_format" "answer_format" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "template_status" NOT NULL DEFAULT 'draft',
    "question_frame" TEXT NOT NULL,
    "page_setup" TEXT,
    "needs_target" BOOLEAN NOT NULL DEFAULT false,
    "allowed_emotions" "emotion"[] DEFAULT ARRAY[]::"emotion"[],
    "correct_desc" TEXT,
    "distractor_desc" TEXT,
    "constructive_desc" TEXT,
    "avoidant_desc" TEXT,
    "impulsive_desc" TEXT,
    "constructive_score" DECIMAL(3,2),
    "avoidant_score" DECIMAL(3,2),
    "impulsive_score" DECIMAL(3,2),
    "hint_guidance" TEXT,
    "parent_prompts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rationale" TEXT,
    "reference_url" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "question_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_sub_skills" (
    "topic_id" UUID NOT NULL,
    "sub_skill_id" UUID NOT NULL,

    CONSTRAINT "topic_sub_skills_pkey" PRIMARY KEY ("topic_id","sub_skill_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "casel_references_code_key" ON "casel_references"("code");

-- CreateIndex
CREATE INDEX "casel_references_skill_id_idx" ON "casel_references"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "eq_sub_skills_code_key" ON "eq_sub_skills"("code");

-- CreateIndex
CREATE INDEX "eq_sub_skills_skill_id_is_active_idx" ON "eq_sub_skills"("skill_id", "is_active");

-- CreateIndex
CREATE INDEX "eq_sub_skills_casel_reference_id_idx" ON "eq_sub_skills"("casel_reference_id");

-- CreateIndex
CREATE INDEX "question_templates_sub_skill_id_is_active_idx" ON "question_templates"("sub_skill_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "question_template_versions_template_id_version_key" ON "question_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "topic_sub_skills_sub_skill_id_idx" ON "topic_sub_skills"("sub_skill_id");

-- CreateIndex
CREATE INDEX "checkpoint_answers_sub_skill_id_idx" ON "checkpoint_answers"("sub_skill_id");

-- CreateIndex
CREATE INDEX "story_checkpoints_sub_skill_id_idx" ON "story_checkpoints"("sub_skill_id");

-- CreateIndex
CREATE INDEX "story_checkpoints_template_version_id_idx" ON "story_checkpoints"("template_version_id");

-- AddForeignKey
ALTER TABLE "casel_references" ADD CONSTRAINT "casel_references_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_sub_skills" ADD CONSTRAINT "eq_sub_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "eq_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_sub_skills" ADD CONSTRAINT "eq_sub_skills_casel_reference_id_fkey" FOREIGN KEY ("casel_reference_id") REFERENCES "casel_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eq_sub_skills" ADD CONSTRAINT "eq_sub_skills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_sub_skill_id_fkey" FOREIGN KEY ("sub_skill_id") REFERENCES "eq_sub_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_template_versions" ADD CONSTRAINT "question_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "question_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_template_versions" ADD CONSTRAINT "question_template_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_template_versions" ADD CONSTRAINT "question_template_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_sub_skills" ADD CONSTRAINT "topic_sub_skills_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_sub_skills" ADD CONSTRAINT "topic_sub_skills_sub_skill_id_fkey" FOREIGN KEY ("sub_skill_id") REFERENCES "eq_sub_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_sub_skill_id_fkey" FOREIGN KEY ("sub_skill_id") REFERENCES "eq_sub_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "question_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_excluded_by_fkey" FOREIGN KEY ("excluded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_reviewed_ok_by_fkey" FOREIGN KEY ("reviewed_ok_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_sub_skill_id_fkey" FOREIGN KEY ("sub_skill_id") REFERENCES "eq_sub_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answers" ADD CONSTRAINT "checkpoint_answers_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "question_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Partial unique (Prisma khong dien ta duoc) --------------------------------------------------------
-- Moi mau toi da 1 phien ban nhap
CREATE UNIQUE INDEX "question_template_versions_template_id_draft_key" ON "question_template_versions" ("template_id") WHERE "status" = 'draft';

-- CHECK ---------------------------------------------------------------------------------------------
-- eq_sub_skills: khoang tuoi hop le
ALTER TABLE "eq_sub_skills" ADD CONSTRAINT "eq_sub_skills_age_range_check"
  CHECK ("age_min" <= "age_max");

-- stories: topic bat buoc voi truyen AI (short/medium/long), tuy chon voi truyen tu viet (custom)
ALTER TABLE "stories" ADD CONSTRAINT "stories_topic_required_check"
  CHECK ("length" = 'custom' OR "topic_id" IS NOT NULL);

-- story_checkpoints: target_token noi long — emotion_other bat buoc co; perspective co hoac khong;
-- emotion_self / problem_solving / reflection khong co
ALTER TABLE "story_checkpoints" DROP CONSTRAINT "story_checkpoints_target_token_check";
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_target_token_required_check"
  CHECK (("type" = 'emotion_other') <= ("target_token" IS NOT NULL));
ALTER TABLE "story_checkpoints" ADD CONSTRAINT "story_checkpoints_target_token_forbidden_check"
  CHECK ("type" NOT IN ('emotion_self', 'problem_solving', 'reflection') OR "target_token" IS NULL);

-- Kiem tra truoc khi ap (moi cau phai ra 0):
-- SELECT count(*) FROM stories WHERE length <> 'custom' AND topic_id IS NULL;
