-- Phase V step 1: one data layer per client (MetricDaily), data sources and campaign mapping. The ad platforms'
-- stored days (AdDailyMetric) are copied in, one number per row; AdDailyMetric is kept as it was (not read any more).
-- CreateTable
CREATE TABLE "MetricDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "utmContent" TEXT NOT NULL DEFAULT '',
    "outputId" TEXT,
    "market" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MetricDaily_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "account" TEXT,
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "health" JSONB,
    "settings" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" DATETIME,
    "disconnectedAt" DATETIME,
    "purgeAfter" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignMapping_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MetricDaily_clientId_date_idx" ON "MetricDaily"("clientId", "date");

-- CreateIndex
CREATE INDEX "MetricDaily_clientId_metric_date_idx" ON "MetricDaily"("clientId", "metric", "date");

-- CreateIndex
CREATE INDEX "MetricDaily_clientId_source_idx" ON "MetricDaily"("clientId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDaily_clientId_source_date_channel_campaignId_utmContent_market_path_model_metric_key" ON "MetricDaily"("clientId", "source", "date", "channel", "campaignId", "utmContent", "market", "path", "model", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_clientId_source_key" ON "DataSource"("clientId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMapping_clientId_source_campaignId_key" ON "CampaignMapping"("clientId", "source", "campaignId");

-- Backfill: every stored ad day → impressions, clicks, spend and the platform's conversions.
INSERT INTO "MetricDaily" ("id","clientId","date","source","channel","campaignId","campaignName","accountName","metric","value","currency","updatedAt")
SELECT lower(hex(randomblob(12))), "clientId", "date", "platform",
       CASE "platform" WHEN 'Google' THEN 'Google Ads' WHEN 'LinkedIn' THEN 'LinkedIn Ads' ELSE "platform" END,
       "campaignId", "campaignName", "accountName", m.metric,
       CASE m.metric WHEN 'impressions' THEN "impressions" WHEN 'clicks' THEN "clicks" WHEN 'spend' THEN "spend" ELSE "conversions" END,
       "currency", "updatedAt"
FROM "AdDailyMetric", (SELECT 'impressions' AS metric UNION ALL SELECT 'clicks' UNION ALL SELECT 'spend' UNION ALL SELECT 'conversions') m;

-- Every client with stored ad days gets a data source row per platform, as connected at its last sync.
INSERT INTO "DataSource" ("id","clientId","source","status","account","lastSyncAt","isDemo","connectedAt","updatedAt")
SELECT lower(hex(randomblob(12))), a."clientId", a."platform", 'connected', MAX(a."accountName"), MAX(a."updatedAt"), c."isDemo", MIN(a."updatedAt"), CURRENT_TIMESTAMP
FROM "AdDailyMetric" a JOIN "Client" c ON c."id" = a."clientId"
GROUP BY a."clientId", a."platform", c."isDemo";
