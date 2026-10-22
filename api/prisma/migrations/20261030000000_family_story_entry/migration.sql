-- Hai loi vao tao truyen AI (spec 2026-10-22-family-story-design §7): "Chuyen mau" (topic) va
-- "Ke chuyen nha minh" (family); truyen tu viet thanh entry = handwritten.

-- Enum ---------------------------------------------------------------------------------------------
CREATE TYPE "story_entry" AS ENUM ('topic', 'family', 'handwritten');
CREATE TYPE "story_sub_skill_source" AS ENUM ('moment', 'need', 'parent');
ALTER TYPE "ai_request_type" ADD VALUE IF NOT EXISTS 'story_analysis';

-- stories ------------------------------------------------------------------------------------------
ALTER TABLE "stories"
  ADD COLUMN "entry" "story_entry" NOT NULL DEFAULT 'topic',
  ADD COLUMN "moment_summary" TEXT,
  ADD COLUMN "seed_event" TEXT,
  ADD COLUMN "scored" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: truyen tu viet (ke ca ban dang ban cua no) -> handwritten; con lai giu topic.
UPDATE "stories" SET "entry" = 'handwritten' WHERE "length" = 'custom';

ALTER TABLE "stories" DROP CONSTRAINT "stories_topic_required_check";
ALTER TABLE "stories" ADD CONSTRAINT "stories_topic_required_check"
  CHECK ("entry" <> 'topic' OR "topic_id" IS NOT NULL);
-- Truyen family luon co khoanh khac / tinh tiet, tru khi "chi ke truyen" (scored = false). Ban dang ban
-- (kind = published) bo chuyen that cua gia dinh nen khong ap luat nay.
ALTER TABLE "stories" ADD CONSTRAINT "stories_family_moment_check"
  CHECK ("kind" <> 'private' OR ("entry" = 'family') = ("moment_summary" IS NOT NULL OR "seed_event" IS NOT NULL OR NOT "scored"));

-- story_sub_skills ---------------------------------------------------------------------------------
CREATE TABLE "story_sub_skills" (
    "story_id" UUID NOT NULL,
    "sub_skill_id" UUID NOT NULL,
    "source" "story_sub_skill_source" NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "story_sub_skills_pkey" PRIMARY KEY ("story_id","sub_skill_id")
);

CREATE UNIQUE INDEX "story_sub_skills_story_id_position_key" ON "story_sub_skills"("story_id", "position");
CREATE INDEX "story_sub_skills_sub_skill_id_idx" ON "story_sub_skills"("sub_skill_id");

ALTER TABLE "story_sub_skills" ADD CONSTRAINT "story_sub_skills_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_sub_skills" ADD CONSTRAINT "story_sub_skills_sub_skill_id_fkey" FOREIGN KEY ("sub_skill_id") REFERENCES "eq_sub_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_sub_skills" ADD CONSTRAINT "story_sub_skills_position_check" CHECK ("position" BETWEEN 1 AND 2);

-- platform_settings --------------------------------------------------------------------------------
-- Gioi han phan tich loi ke moi phu huynh moi ngay + gia credit (0: khong tru). DB chua seed thi bo
-- qua: seed tao khoa.
INSERT INTO "platform_settings" ("key", "value", "updated_by", "updated_at")
SELECT k.key, k.value, src."updated_by", now()
FROM (SELECT "updated_by" FROM "platform_settings" WHERE "key" LIKE 'ai_cost.%' LIMIT 1) src
CROSS JOIN (VALUES
  ('limits.story_analysis_per_day', '30'::jsonb),
  ('ai_cost.story_analysis', '0'::jsonb)
) AS k(key, value)
ON CONFLICT ("key") DO NOTHING;
