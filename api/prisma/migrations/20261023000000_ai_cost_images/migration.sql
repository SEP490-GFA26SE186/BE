-- Tranh AI (nguoi dung chot 2026-10-19, ai/docs/01): gia credit cho chan dung nhan vat va moi tranh canh.
-- Chi them DU LIEU platform_settings, khong doi schema. DB chua seed (chua co khoa ai_cost nao) thi bo qua:
-- seed tao khoa.
INSERT INTO "platform_settings" ("key", "value", "updated_by", "updated_at")
SELECT k.key, k.value, src."updated_by", now()
FROM (SELECT "updated_by" FROM "platform_settings" WHERE "key" LIKE 'ai_cost.%' LIMIT 1) src
CROSS JOIN (VALUES
  ('ai_cost.character_portrait', '1'::jsonb),
  ('ai_cost.scene_image', '1'::jsonb)
) AS k(key, value)
ON CONFLICT ("key") DO NOTHING;
