-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "MarketSignal" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "MarketSignal" ADD COLUMN "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "MarketSignal_clientId_dedupeKey_idx" ON "MarketSignal"("clientId", "dedupeKey");

