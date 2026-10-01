-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN "comments" INTEGER;
ALTER TABLE "ContentPost" ADD COLUMN "saves" INTEGER;
ALTER TABLE "ContentPost" ADD COLUMN "shares" INTEGER;

-- CreateTable
CREATE TABLE "CommunityManagementSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "commentVolume" INTEGER NOT NULL,
    "dmVolume" INTEGER NOT NULL,
    "sentimentPositivePct" INTEGER NOT NULL,
    "sentimentNeutralPct" INTEGER NOT NULL,
    "sentimentNegativePct" INTEGER NOT NULL,
    "escalations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityManagementSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "ageBreakdown" JSONB,
    "genderBreakdown" JSONB,
    "topLocations" JSONB,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommunityManagementSnapshot_clientId_periodStart_idx" ON "CommunityManagementSnapshot"("clientId", "periodStart");

-- CreateIndex
CREATE INDEX "AudienceSnapshot_clientId_platform_idx" ON "AudienceSnapshot"("clientId", "platform");

