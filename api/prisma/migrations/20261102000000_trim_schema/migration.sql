-- 2026-10-22 luoc bang/cot thua (DBML schema_rev8):
--   1. product_review_tags -> cot mang product_reviews.tags review_tag[]
--   2. bo admin_audit_logs.ip_address (khong ai ghi / doc)
--   3. bo eq_sub_skills.source + enum sub_skill_source; casel_text_en NOT NULL
--      (ky nang con chi con la danh muc CASEL co dinh, khong them / xoa qua API)

-- 1. Gom the danh gia vao cot mang (giu thu tu theo enum, khong trung vi PK cu la (review_id, tag))
ALTER TABLE "product_reviews" ADD COLUMN "tags" "review_tag"[] NOT NULL DEFAULT '{}';

UPDATE "product_reviews" r
SET "tags" = t."tags"
FROM (
  SELECT "review_id", array_agg("tag" ORDER BY "tag") AS "tags"
  FROM "product_review_tags"
  GROUP BY "review_id"
) t
WHERE t."review_id" = r."id";

DROP TABLE "product_review_tags";

-- 2. Cot IP chua bao gio duoc ghi
ALTER TABLE "admin_audit_logs" DROP COLUMN "ip_address";

-- 3. Ky nang con = muc CASEL (danh muc co dinh). Bo `source` thi dong cu source = 'specialist' (chi co o DB
--    test, do fixture tao; DB dev hien 0 dong) phai khong lan voi 40 muc goc. "Dong cu can don" = specialist
--    ma casel_text_en NULL (chan NOT NULL) hoac trung nguyen van cua mot muc goc casel (migration 20261029
--    da chep cau goc sang de truy vet -> sau khi bo source se khong phan biet duoc voi muc goc):
CREATE TEMP TABLE "_legacy_sub_skills" AS
SELECT s."id"
FROM "eq_sub_skills" s
WHERE s."source" = 'specialist'
  AND (
    s."casel_text_en" IS NULL
    OR EXISTS (SELECT 1 FROM "eq_sub_skills" c WHERE c."source" = 'casel' AND c."casel_text_en" = s."casel_text_en")
  );

--    a) chua bi tham chieu o dau -> xoa
DELETE FROM "eq_sub_skills" s
USING "_legacy_sub_skills" l
WHERE s."id" = l."id"
  AND NOT EXISTS (SELECT 1 FROM "question_templates" x WHERE x."sub_skill_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "topic_sub_skills" x WHERE x."sub_skill_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "story_checkpoints" x WHERE x."sub_skill_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "story_sub_skills" x WHERE x."sub_skill_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "checkpoint_answers" x WHERE x."sub_skill_id" = s."id");

--    b) con bi tham chieu -> lay ten tieng Viet lam cau goc (giu lich su diem, khong trung muc goc)
UPDATE "eq_sub_skills" s
SET "casel_text_en" = s."name_vi"
FROM "_legacy_sub_skills" l
WHERE s."id" = l."id";

ALTER TABLE "eq_sub_skills" DROP CONSTRAINT "eq_sub_skills_casel_text_check";
ALTER TABLE "eq_sub_skills" ALTER COLUMN "casel_text_en" SET NOT NULL;
ALTER TABLE "eq_sub_skills" DROP COLUMN "source";
DROP TYPE "sub_skill_source";
DROP TABLE "_legacy_sub_skills";
