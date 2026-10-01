-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "durationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "heightPercent" REAL;
ALTER TABLE "Comment" ADD COLUMN "timestampSeconds" REAL;
ALTER TABLE "Comment" ADD COLUMN "widthPercent" REAL;
