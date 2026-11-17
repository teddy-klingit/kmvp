-- Phase X v2 (X5): page-level website numbers in the data layer, and Google rankings for tracked keywords.
ALTER TABLE "MetricDaily" ADD COLUMN "page" TEXT NOT NULL DEFAULT '';
DROP INDEX "MetricDaily_clientId_source_date_channel_campaignId_utmContent_market_path_model_metric_key";
CREATE UNIQUE INDEX "MetricDaily_clientId_source_date_channel_campaignId_utmContent_market_path_model_page_metric_key" ON "MetricDaily"("clientId", "source", "date", "channel", "campaignId", "utmContent", "market", "path", "model", "page", "metric");
CREATE TABLE "SearchRanking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "position" INTEGER,
    "previousPosition" INTEGER,
    "url" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchRanking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SearchRanking_clientId_capturedAt_idx" ON "SearchRanking"("clientId", "capturedAt");
