-- 2026-10-22 gon kiem duyet + gia (DBML schema_rev8):
--  1. Checklist su pham chi con tren web: bo review_checklist_results, checklist_items.
--  2. Gia tu dat: listings.price_vnd (0 = mien phi; con lai 5000..500000, boi 1000 - kiem o service),
--     backfill tu bac gia cu roi bo listings.price_tier_id va price_tiers.
--  3. Bo thu vien nen: story_scenes.background_id va backgrounds.

-- 1. checklist -------------------------------------------------------------------------------------
DROP TABLE "review_checklist_results";
DROP TABLE "checklist_items";

-- 2. gia tu dat ------------------------------------------------------------------------------------
ALTER TABLE "listings" ADD COLUMN "price_vnd" BIGINT;

UPDATE "listings" l SET "price_vnd" = t."price_vnd"
  FROM "price_tiers" t WHERE t."id" = l."price_tier_id";

ALTER TABLE "listings" ALTER COLUMN "price_vnd" SET NOT NULL;
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_check" CHECK ("price_vnd" >= 0);

ALTER TABLE "listings" DROP CONSTRAINT "listings_price_tier_id_fkey";
ALTER TABLE "listings" DROP COLUMN "price_tier_id";
DROP TABLE "price_tiers";

-- 3. thu vien nen ----------------------------------------------------------------------------------
ALTER TABLE "story_scenes" DROP CONSTRAINT "story_scenes_background_id_fkey";
ALTER TABLE "story_scenes" DROP COLUMN "background_id";
DROP TABLE "backgrounds";
