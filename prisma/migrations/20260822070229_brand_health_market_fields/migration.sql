-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrandOS" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "toneRules" JSONB,
    "dos" JSONB,
    "donts" JSONB,
    "approvedColors" JSONB,
    "approvedTypography" JSONB,
    "figmaSyncConfig" JSONB,
    "foundationPct" INTEGER NOT NULL DEFAULT 0,
    "figmaLibraryPct" INTEGER NOT NULL DEFAULT 0,
    "assetArchivePct" INTEGER NOT NULL DEFAULT 0,
    "qualityBenchmarksPct" INTEGER NOT NULL DEFAULT 0,
    "indexedAssetsCount" INTEGER NOT NULL DEFAULT 0,
    "brandOsRulesCount" INTEGER NOT NULL DEFAULT 0,
    "toneGuidelinesCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandOS_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BrandOS" ("approvedColors", "approvedTypography", "brandOsRulesCount", "clientId", "donts", "dos", "figmaSyncConfig", "foundationPct", "id", "indexedAssetsCount", "lastSyncedAt", "toneGuidelinesCount", "toneRules", "updatedAt") SELECT "approvedColors", "approvedTypography", "brandOsRulesCount", "clientId", "donts", "dos", "figmaSyncConfig", "foundationPct", "id", "indexedAssetsCount", "lastSyncedAt", "toneGuidelinesCount", "toneRules", "updatedAt" FROM "BrandOS";
DROP TABLE "BrandOS";
ALTER TABLE "new_BrandOS" RENAME TO "BrandOS";
CREATE UNIQUE INDEX "BrandOS_clientId_key" ON "BrandOS"("clientId");
CREATE TABLE "new_MarketSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT,
    "relevance" TEXT NOT NULL DEFAULT 'Watch',
    "publishedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketSignal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MarketSignal" ("clientId", "id", "publishedAt", "source", "summary", "title", "type") SELECT "clientId", "id", "publishedAt", "source", "summary", "title", "type" FROM "MarketSignal";
DROP TABLE "MarketSignal";
ALTER TABLE "new_MarketSignal" RENAME TO "MarketSignal";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
