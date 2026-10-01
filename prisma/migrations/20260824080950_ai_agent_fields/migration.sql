-- AlterTable
ALTER TABLE "Brief" ADD COLUMN "aiQualityScore" INTEGER;
ALTER TABLE "Brief" ADD COLUMN "aiSummary" TEXT;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "agentPriority" TEXT;
ALTER TABLE "Comment" ADD COLUMN "agentTaskSummary" TEXT;
