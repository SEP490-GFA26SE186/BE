-- CreateTable
CREATE TABLE "narration_clips" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "segment" VARCHAR(120) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "status" "generation_status" NOT NULL DEFAULT 'queued',
    "round" INTEGER NOT NULL DEFAULT 1,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "audio_key" VARCHAR(300),
    "duration_seconds" DECIMAL(7,2),
    "error_code" VARCHAR(40),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narration_clips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "narration_clips_story_id_segment_key" ON "narration_clips"("story_id", "segment");

-- AddForeignKey
ALTER TABLE "narration_clips" ADD CONSTRAINT "narration_clips_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

