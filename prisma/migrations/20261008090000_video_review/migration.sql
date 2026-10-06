-- Video review: comment ranges and per-version video metadata (poster, thumbnail strip, fps, audio).
ALTER TABLE "Comment" ADD COLUMN "timestampEndSeconds" REAL;
ALTER TABLE "AssetVersion" ADD COLUMN "durationSeconds" REAL;
ALTER TABLE "AssetVersion" ADD COLUMN "fps" REAL;
ALTER TABLE "AssetVersion" ADD COLUMN "hasAudio" BOOLEAN;
ALTER TABLE "AssetVersion" ADD COLUMN "posterKey" TEXT;
ALTER TABLE "AssetVersion" ADD COLUMN "thumbStripKey" TEXT;
