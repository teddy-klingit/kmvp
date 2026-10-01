-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN "sourceSuggestionId" TEXT;

-- CreateTable
CREATE TABLE "SampleAdCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "ctr" REAL NOT NULL,
    "spend" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "costPerConversion" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SampleAdCampaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "competitorBrands" JSONB,
    "brandSummary" TEXT,
    "planTier" TEXT NOT NULL DEFAULT 'GROWTH',
    "status" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "monthlyCreditAllowance" INTEGER NOT NULL DEFAULT 0,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 80,
    "isSampleAccount" BOOLEAN NOT NULL DEFAULT false,
    "accountLeadId" TEXT,
    "renewalDate" DATETIME,
    "onboardingCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_accountLeadId_fkey" FOREIGN KEY ("accountLeadId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("accountLeadId", "brandSummary", "competitorBrands", "createdAt", "creditBalance", "healthScore", "id", "industry", "monthlyCreditAllowance", "name", "onboardingCompletedAt", "planTier", "renewalDate", "slug", "status", "updatedAt", "website") SELECT "accountLeadId", "brandSummary", "competitorBrands", "createdAt", "creditBalance", "healthScore", "id", "industry", "monthlyCreditAllowance", "name", "onboardingCompletedAt", "planTier", "renewalDate", "slug", "status", "updatedAt", "website" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");
CREATE TABLE "new_ContentPlanSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "platform" TEXT,
    "suggestedVolumeChange" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stage" TEXT NOT NULL DEFAULT 'IN_REVIEW',
    "sourceCadence" TEXT NOT NULL DEFAULT 'Monthly strategy recommendation',
    "briefedProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ContentPlanSuggestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentPlanSuggestion" ("briefedProjectId", "clientId", "createdAt", "id", "platform", "rationale", "resolvedAt", "status", "suggestedVolumeChange", "title") SELECT "briefedProjectId", "clientId", "createdAt", "id", "platform", "rationale", "resolvedAt", "status", "suggestedVolumeChange", "title" FROM "ContentPlanSuggestion";
DROP TABLE "ContentPlanSuggestion";
ALTER TABLE "new_ContentPlanSuggestion" RENAME TO "ContentPlanSuggestion";
CREATE INDEX "ContentPlanSuggestion_clientId_status_idx" ON "ContentPlanSuggestion"("clientId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SampleAdCampaign_clientId_platform_idx" ON "SampleAdCampaign"("clientId", "platform");

