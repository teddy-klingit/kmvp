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
    "paidMediaInScope" BOOLEAN NOT NULL DEFAULT true,
    "accountLeadId" TEXT,
    "renewalDate" DATETIME,
    "onboardingCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_accountLeadId_fkey" FOREIGN KEY ("accountLeadId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("accountLeadId", "brandSummary", "competitorBrands", "createdAt", "creditBalance", "healthScore", "id", "industry", "isSampleAccount", "monthlyCreditAllowance", "name", "onboardingCompletedAt", "planTier", "renewalDate", "slug", "status", "updatedAt", "website") SELECT "accountLeadId", "brandSummary", "competitorBrands", "createdAt", "creditBalance", "healthScore", "id", "industry", "isSampleAccount", "monthlyCreditAllowance", "name", "onboardingCompletedAt", "planTier", "renewalDate", "slug", "status", "updatedAt", "website" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

