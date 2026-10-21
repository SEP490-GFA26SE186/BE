-- Credit AI viet truyen theo do dai (nguoi dung chot 2026-10-19): ai_cost.story_text -> 3 khoa
-- ai_cost.story_text.short | medium | long (1 / 2 / 3 credit). Chi doi DU LIEU platform_settings, khong doi schema.
-- DB chua seed (khong co khoa cu) thi khong chen gi: seed tao khoa moi.
INSERT INTO "platform_settings" ("key", "value", "updated_by", "updated_at")
SELECT k.key, k.value, old."updated_by", now()
FROM "platform_settings" old
CROSS JOIN (VALUES
  ('ai_cost.story_text.short', '1'::jsonb),
  ('ai_cost.story_text.medium', '2'::jsonb),
  ('ai_cost.story_text.long', '3'::jsonb)
) AS k(key, value)
WHERE old."key" = 'ai_cost.story_text'
ON CONFLICT ("key") DO NOTHING;

DELETE FROM "platform_settings" WHERE "key" = 'ai_cost.story_text';
