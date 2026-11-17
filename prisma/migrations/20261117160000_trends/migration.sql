-- Phase X v2 (X7): trend topics with stage and brand fit, and category demand on the trend brief.
ALTER TABLE "TrendBrief" ADD COLUMN "categoryDemand" JSONB;
CREATE TABLE "TrendTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "measure" TEXT NOT NULL DEFAULT 'searches',
    "change" REAL NOT NULL,
    "series" JSONB NOT NULL,
    "stage" TEXT NOT NULL,
    "fit" INTEGER NOT NULL,
    "fitNote" TEXT,
    "opportunityId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendTopic_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TrendTopic_clientId_capturedAt_idx" ON "TrendTopic"("clientId", "capturedAt");
