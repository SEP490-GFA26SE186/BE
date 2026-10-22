-- Anh bia truyen = anh cua mot canh (story_scenes.image_key). NULL = canh 1 (mac dinh);
-- phu huynh chon canh khac. Xoa canh dang lam bia -> quay ve mac dinh.

-- stories ------------------------------------------------------------------------------------------
ALTER TABLE "stories" ADD COLUMN "cover_scene_id" UUID;

ALTER TABLE "stories" ADD CONSTRAINT "stories_cover_scene_id_fkey"
  FOREIGN KEY ("cover_scene_id") REFERENCES "story_scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
