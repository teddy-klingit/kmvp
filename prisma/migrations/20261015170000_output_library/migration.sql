-- Phase U: the Output library covers every kind of work. A category per output (null = mapped from format and
-- project type; staff can set it), download counts, an optional preview image (first slide or page), and "how it did".
ALTER TABLE "Asset" ADD COLUMN "category" TEXT;
ALTER TABLE "Asset" ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD COLUMN "previewKey" TEXT;
ALTER TABLE "SkillOutput" ADD COLUMN "category" TEXT;
ALTER TABLE "SkillOutput" ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;

-- How a piece did when there's no channel data: "Printed: 2,000", "Shared with 3 retailers", "Leads: 14".
CREATE TABLE "OutputFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "assetId" TEXT,
    "skillOutputId" TEXT,
    "label" TEXT NOT NULL,
    "value" REAL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'client',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutputFact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OutputFact_clientId_createdAt_idx" ON "OutputFact"("clientId", "createdAt");
CREATE INDEX "OutputFact_assetId_idx" ON "OutputFact"("assetId");
