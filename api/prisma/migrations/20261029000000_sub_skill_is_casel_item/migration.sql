-- Gop 2 tang "casel_references -> eq_sub_skills" thanh 1 tang: ky nang con CHINH LA muc CASEL
-- (nguoi dung chot 2026-10-21). 40 muc CASEL thanh 40 ky nang con source = 'casel'
-- (nguyen van tieng Anh o casel_text_en); Specialist bo sung them ky nang con source = 'specialist'.
-- DB rong (chua seed) thi cac buoc chuyen du lieu khong lam gi.

-- 1. Enum + cot moi
CREATE TYPE "sub_skill_source" AS ENUM ('casel', 'specialist');

ALTER TABLE "eq_sub_skills"
  ADD COLUMN "casel_text_en" TEXT,
  ADD COLUMN "source" "sub_skill_source" NOT NULL DEFAULT 'specialist';

-- 2. Ky nang con dang tro vao 1 muc CASEL: chep nguyen van tieng Anh, danh dau 'casel'.
--    Neu 2+ ky nang con cung tro vao 1 muc thi chi dong dau tien (display_order, created_at, id nho
--    nhat) thanh 'casel'; cac dong con lai giu 'specialist' nhung van mang casel_text_en de truy vet.
UPDATE "eq_sub_skills" s
SET "casel_text_en" = c."text_en",
    "name_vi" = CASE WHEN btrim(s."name_vi") = '' THEN COALESCE(c."text_vi", c."text_en") ELSE s."name_vi" END
FROM "casel_references" c
WHERE s."casel_reference_id" = c."id";

UPDATE "eq_sub_skills" s
SET "source" = 'casel'
FROM (
  SELECT DISTINCT ON ("casel_reference_id") "id"
  FROM "eq_sub_skills"
  ORDER BY "casel_reference_id", "display_order", "created_at", "id"
) firsts
WHERE s."id" = firsts."id";

-- 3. Muc CASEL chua co ky nang con nao -> them thanh ky nang con 'casel', mac dinh tat.
--    created_by: tai khoan ban su pham seed (pedagogy@storyweaver.ai), khong co thi lay 1 specialist/admin
--    bat ky; khong co ai thi bo qua (DB rong).
WITH author AS (
  SELECT "id" FROM "users"
  WHERE "email" = 'pedagogy@storyweaver.ai' OR "role" IN ('specialist', 'admin')
  ORDER BY ("email" = 'pedagogy@storyweaver.ai') DESC, "created_at"
  LIMIT 1
)
INSERT INTO "eq_sub_skills" (
  "id", "skill_id", "casel_reference_id", "code", "name_vi", "description_vi", "casel_text_en", "source",
  "age_min", "age_max", "is_active", "display_order", "created_by", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), c."skill_id", c."id",
  CASE WHEN EXISTS (SELECT 1 FROM "eq_sub_skills" x WHERE x."code" = c."code")
       THEN left(c."code", 54) || '_casel' ELSE c."code" END,
  left(COALESCE(c."text_vi", c."text_en"), 200), COALESCE(c."text_vi", ''), c."text_en", 'casel',
  5, 8, false, c."display_order", author."id", now(), now()
FROM "casel_references" c
CROSS JOIN author
WHERE NOT EXISTS (SELECT 1 FROM "eq_sub_skills" s WHERE s."casel_reference_id" = c."id");

-- 4. Bo tang casel_references
ALTER TABLE "eq_sub_skills" DROP CONSTRAINT "eq_sub_skills_casel_reference_id_fkey";
DROP INDEX "eq_sub_skills_casel_reference_id_idx";
ALTER TABLE "eq_sub_skills" DROP COLUMN "casel_reference_id";
DROP TABLE "casel_references";

-- Muc goc CASEL luon co nguyen van tieng Anh
ALTER TABLE "eq_sub_skills" ADD CONSTRAINT "eq_sub_skills_casel_text_check"
  CHECK ("source" <> 'casel' OR "casel_text_en" IS NOT NULL);
