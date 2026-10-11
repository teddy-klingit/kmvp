-- Phase Q: plans with AI credits, the AI-credit ledger, bundles and top-ups, skills/assistants on the AI catalog,
-- token use on runs, skill outputs for the Output library. All additive; Agent and Plan are rebuilt with their rows.
-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN "aiCredits" REAL;
ALTER TABLE "AgentRun" ADD COLUMN "model" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "tokensIn" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "tokensOut" INTEGER;
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "performanceViews" INTEGER;
-- AlterTable
ALTER TABLE "BrandConnection" ADD COLUMN "meta" JSONB;
-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "format" TEXT;
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "userId" TEXT;
-- CreateTable
CREATE TABLE "ClientPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "AiCreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "fundedBy" TEXT,
    "sourceType" TEXT,
    "sourceKey" TEXT,
    "sourceName" TEXT,
    "projectId" TEXT,
    "format" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "billedTo" TEXT NOT NULL DEFAULT 'klingit',
    "agentRunId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditLedger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "AiCreditBundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "size" INTEGER NOT NULL,
    "priceAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateTable
CREATE TABLE "AiTopUpRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiTopUpRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiTopUpRequest_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "AiCreditBundle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "SkillOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "format" TEXT,
    "channel" TEXT,
    "text" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillOutput_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "costPerRunCredits" REAL,
    "selfService" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'INTERNAL',
    "clientId" TEXT,
    "skillCategory" TEXT,
    "aiCreditsPerRun" REAL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Agent" ("category", "costPerRunCredits", "createdAt", "description", "id", "key", "name", "selfService", "status", "version") SELECT "category", "costPerRunCredits", "createdAt", "description", "id", "key", "name", "selfService", "status", "version" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_key_key" ON "Agent"("key");
CREATE TABLE "new_Plan" (
    "tier" TEXT NOT NULL PRIMARY KEY,
    "activeSlots" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "monthlyAiCredits" INTEGER NOT NULL DEFAULT 0,
    "monthlyTeamCredits" INTEGER NOT NULL DEFAULT 0,
    "priceAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "ownModel" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Plan" ("activeSlots", "tier", "updatedAt") SELECT "activeSlots", "tier", "updatedAt" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
-- CreateIndex
CREATE UNIQUE INDEX "ClientPlan_clientId_periodStart_key" ON "ClientPlan"("clientId", "periodStart");
-- CreateIndex
CREATE INDEX "AiCreditLedger_clientId_createdAt_idx" ON "AiCreditLedger"("clientId", "createdAt");
-- CreateIndex
CREATE INDEX "SkillOutput_clientId_createdAt_idx" ON "SkillOutput"("clientId", "createdAt");

-- Plans (all PLACEHOLDER values, editable in ops → Plans & AI credits). Team credits keep today's allowances.
INSERT OR IGNORE INTO "Plan" ("tier", "activeSlots", "updatedAt") VALUES ('BASIC', 1, CURRENT_TIMESTAMP);
UPDATE "Plan" SET "name" = 'Basic', "monthlyAiCredits" = 0, "monthlyTeamCredits" = 16, "ownModel" = true, "sortOrder" = 0 WHERE "tier" = 'BASIC';
UPDATE "Plan" SET "name" = 'Starter', "monthlyAiCredits" = 500, "monthlyTeamCredits" = 16, "sortOrder" = 1 WHERE "tier" = 'STARTER';
UPDATE "Plan" SET "name" = 'Growth', "monthlyAiCredits" = 1500, "monthlyTeamCredits" = 40, "sortOrder" = 2 WHERE "tier" = 'GROWTH';
UPDATE "Plan" SET "name" = 'Scale', "monthlyAiCredits" = 3000, "monthlyTeamCredits" = 80, "sortOrder" = 3 WHERE "tier" = 'SCALE';
UPDATE "Plan" SET "name" = 'Enterprise', "monthlyAiCredits" = 3000, "monthlyTeamCredits" = 160, "sortOrder" = 4 WHERE "tier" = 'ENTERPRISE';

-- AI-credit bundles (PLACEHOLDER sizes, no prices yet).
INSERT INTO "AiCreditBundle" ("id", "size", "sortOrder") VALUES ('bundle_250', 250, 0), ('bundle_1000', 1000, 1), ('bundle_2500', 2500, 2);

-- The catalog: standard skills (client-run), assistants (built-in helpers), the rest stays internal.
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Ad gen', "skillCategory" = 'Visual', "aiCreditsPerRun" = 25, "summary" = 'Finished ad with headline and CTA on the image, plus a caption' WHERE "key" = 'ad_gen';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Brief generator', "skillCategory" = 'Briefs', "aiCreditsPerRun" = 8, "summary" = 'A ready-to-use creative brief from one line' WHERE "key" = 'brief_generator_agent';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Email copy', "skillCategory" = 'Copy', "aiCreditsPerRun" = 6, "summary" = 'Subject lines, preheader and body copy' WHERE "key" = 'email_copy_agent';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Image gen', "skillCategory" = 'Visual', "aiCreditsPerRun" = 20, "summary" = 'An on-brand image or illustration, no text' WHERE "key" = 'image_gen_agent';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Instagram caption', "skillCategory" = 'Social', "aiCreditsPerRun" = 4, "summary" = 'Caption, hashtags and alt text for a post' WHERE "key" = 'instagram_caption_agent';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'Landing page copy', "skillCategory" = 'Copy', "aiCreditsPerRun" = 10, "summary" = 'Headline, sections and CTA for a landing page' WHERE "key" = 'landing_page_copy_agent';
UPDATE "Agent" SET "kind" = 'SKILL', "name" = 'LinkedIn post', "skillCategory" = 'Social', "aiCreditsPerRun" = 4, "summary" = 'A ready-to-post update in your brand voice' WHERE "key" = 'linkedin_post_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'Brief assistant', "summary" = 'Asks only what Brand OS doesn''t know' WHERE "key" = 'brief_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'Market ideas', "summary" = 'Weekly ideas from trends and competitors; answers Ask your data' WHERE "key" = 'market_intel_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'Performance insights', "summary" = 'Explains what changed and why' WHERE "key" = 'performance_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'SEO & AI visibility check' WHERE "key" = 'seo_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'Content plan ideas' WHERE "key" = 'content_plan_agent';
UPDATE "Agent" SET "kind" = 'ASSISTANT', "name" = 'Brand OS drafting' WHERE "key" = 'brand_os';
UPDATE "Plan" SET "activeSlots" = 3 WHERE "tier" = 'GROWTH' AND "activeSlots" = 2;
