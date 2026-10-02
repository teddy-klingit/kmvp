-- Insights v2: real per-day ad metrics, and structured agent output (one line, one number, one action; reasoning behind "Why?").
CREATE TABLE "AdDailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "spend" REAL NOT NULL,
    "conversions" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdDailyMetric_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdDailyMetric_clientId_platform_campaignId_date_key" ON "AdDailyMetric"("clientId", "platform", "campaignId", "date");
CREATE INDEX "AdDailyMetric_clientId_date_idx" ON "AdDailyMetric"("clientId", "date");

ALTER TABLE "MarketIntelligenceBrief" ADD COLUMN "points" JSONB;
ALTER TABLE "MarketIntelligenceIdea" ADD COLUMN "why" TEXT;
ALTER TABLE "MarketIntelligenceIdea" ADD COLUMN "evidence" JSONB;
ALTER TABLE "MarketIntelligenceIdea" ADD COLUMN "chart" JSONB;
ALTER TABLE "MarketIntelligenceIdea" ADD COLUMN "formats" JSONB;
ALTER TABLE "PerformanceBrief" ADD COLUMN "actions" JSONB;
ALTER TABLE "MarketSignal" ADD COLUMN "data" JSONB;
