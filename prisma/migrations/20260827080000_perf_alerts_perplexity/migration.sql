-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "ctr" REAL NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiVisibilityCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'claude',
    "grounded" BOOLEAN NOT NULL DEFAULT false,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "mentions" JSONB NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiVisibilityCheck_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiVisibilityCheck" ("answer", "checkedAt", "clientId", "id", "mentions", "question") SELECT "answer", "checkedAt", "clientId", "id", "mentions", "question" FROM "AiVisibilityCheck";
DROP TABLE "AiVisibilityCheck";
ALTER TABLE "new_AiVisibilityCheck" RENAME TO "AiVisibilityCheck";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_clientId_platform_campaignId_capturedAt_idx" ON "PerformanceSnapshot"("clientId", "platform", "campaignId", "capturedAt");

