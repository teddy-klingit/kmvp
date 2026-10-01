-- CreateTable
CREATE TABLE "MarketIntelligenceIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketIntelligenceIdea_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketIntelligenceQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIntelligenceQuestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "totalAds" INTEGER,
    "adIds" JSONB NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MarketIntelligenceBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIntelligenceBrief_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MarketIntelligenceBrief" ("assumptions", "clientId", "generatedAt", "id", "summary") SELECT "assumptions", "clientId", "generatedAt", "id", "summary" FROM "MarketIntelligenceBrief";
DROP TABLE "MarketIntelligenceBrief";
ALTER TABLE "new_MarketIntelligenceBrief" RENAME TO "MarketIntelligenceBrief";
CREATE UNIQUE INDEX "MarketIntelligenceBrief_clientId_key" ON "MarketIntelligenceBrief"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MarketIntelligenceIdea_clientId_status_idx" ON "MarketIntelligenceIdea"("clientId", "status");

-- CreateIndex
CREATE INDEX "MarketIntelligenceQuestion_clientId_createdAt_idx" ON "MarketIntelligenceQuestion"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_clientId_brand_platform_capturedAt_idx" ON "CompetitorSnapshot"("clientId", "brand", "platform", "capturedAt");

