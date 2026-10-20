-- O cham trong story_layout.* khong con gan kieu co dinh (spec casel-pedagogy §6.1): moi o khac
-- 'reflection' thanh 'scored', backend dien bang mau cau hoi cua ky nang con cua topic khi tao
-- truyen. Giu nguyen `pages` va `after` cua tung o.
UPDATE platform_settings
SET value = jsonb_set(
      value,
      '{checkpoints}',
      (
        SELECT COALESCE(
          jsonb_agg(
            CASE WHEN c->>'type' = 'reflection' THEN c
                 ELSE jsonb_set(c, '{type}', '"scored"') END
            ORDER BY ord
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(value->'checkpoints') WITH ORDINALITY AS t(c, ord)
      )
    ),
    updated_at = now()
WHERE key IN ('story_layout.short', 'story_layout.medium', 'story_layout.long')
  AND jsonb_typeof(value->'checkpoints') = 'array';
