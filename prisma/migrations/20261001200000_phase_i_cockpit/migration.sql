-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN "displayName" TEXT;
ALTER TABLE "PriceListItem" ADD COLUMN "unit" TEXT;

-- CreateTable
CREATE TABLE "EstimateRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EstimateRevision_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstimateRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectStaffNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectStaffNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectStaffNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "agentRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DecisionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "platform" TEXT,
    "type" TEXT NOT NULL DEFAULT 'IMAGE',
    "fileUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedByUserId" TEXT,
    "changeRequestCount" INTEGER NOT NULL DEFAULT 0,
    "thumbnailColor" TEXT NOT NULL DEFAULT 'var(--avatar-3)',
    "durationSeconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'IN_REVIEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "performanceCtr" REAL,
    "performanceScore" INTEGER,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("clientId", "createdAt", "durationSeconds", "fileUrl", "format", "id", "name", "performanceCtr", "performanceScore", "platform", "projectId", "status", "tags", "thumbnailColor", "type", "version") SELECT "clientId", "createdAt", "durationSeconds", "fileUrl", "format", "id", "name", "performanceCtr", "performanceScore", "platform", "projectId", "status", "tags", "thumbnailColor", "type", "version" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE TABLE "new_Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sentByStaffId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalHours" REAL NOT NULL DEFAULT 0,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalPrice" REAL,
    "notes" TEXT,
    "sentAt" DATETIME,
    "expiresAt" DATETIME,
    "respondedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revisionReason" TEXT,
    "approvedVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inclusions" JSONB,
    "unresolvedNeeds" JSONB,
    CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Estimate_sentByStaffId_fkey" FOREIGN KEY ("sentByStaffId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Estimate" ("createdAt", "currency", "expiresAt", "id", "inclusions", "notes", "projectId", "respondedAt", "sentAt", "sentByStaffId", "status", "totalCredits", "totalHours", "totalPrice", "unresolvedNeeds") SELECT "createdAt", "currency", "expiresAt", "id", "inclusions", "notes", "projectId", "respondedAt", "sentAt", "sentByStaffId", "status", "totalCredits", "totalHours", "totalPrice", "unresolvedNeeds" FROM "Estimate";
DROP TABLE "Estimate";
ALTER TABLE "new_Estimate" RENAME TO "Estimate";
CREATE UNIQUE INDEX "Estimate_projectId_key" ON "Estimate"("projectId");
CREATE TABLE "new_EstimateLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "credits" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "complexityTier" TEXT,
    "priceListItemId" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "customReason" TEXT,
    CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstimateLineItem_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EstimateLineItem" ("credits", "deliverable", "detail", "estimateId", "hours", "id", "order") SELECT "credits", "deliverable", "detail", "estimateId", "hours", "id", "order" FROM "EstimateLineItem";
DROP TABLE "EstimateLineItem";
ALTER TABLE "new_EstimateLineItem" RENAME TO "EstimateLineItem";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CAMPAIGN',
    "status" TEXT NOT NULL DEFAULT 'BRIEFING',
    "pausedFromStatus" TEXT,
    "dueDate" DATETIME,
    "startedAt" DATETIME,
    "deliveredAt" DATETIME,
    "creditsQuoted" INTEGER,
    "creditsActual" INTEGER,
    "priceAmount" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "autopilot" BOOLEAN NOT NULL DEFAULT true,
    "autopilotPausedAt" DATETIME,
    "autopilotPausedByUserId" TEXT,
    "createdByClientUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_createdByClientUserId_fkey" FOREIGN KEY ("createdByClientUserId") REFERENCES "ClientUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("clientId", "confidential", "createdAt", "createdByClientUserId", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "pausedFromStatus", "priceAmount", "priceCurrency", "startedAt", "status", "type", "updatedAt") SELECT "clientId", "confidential", "createdAt", "createdByClientUserId", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "pausedFromStatus", "priceAmount", "priceCurrency", "startedAt", "status", "type", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EstimateRevision_estimateId_version_key" ON "EstimateRevision"("estimateId", "version");

-- CreateIndex
CREATE INDEX "ProjectStaffNote_projectId_createdAt_idx" ON "ProjectStaffNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionLog_projectId_createdAt_idx" ON "DecisionLog"("projectId", "createdAt");


-- Backfill: client-facing names per price-list row, and complexity / quantity / price-list link on existing estimate lines.
UPDATE "PriceListItem" SET "displayName" = 'Social posts', "unit" = 'post' WHERE "deliverableType" = 'Social post (static)' AND "complexityTier" = 'LOW';
UPDATE "PriceListItem" SET "displayName" = 'Social posts', "unit" = 'post' WHERE "deliverableType" = 'Social post (static)' AND "complexityTier" = 'MEDIUM';
UPDATE "PriceListItem" SET "displayName" = 'Custom social posts', "unit" = 'post' WHERE "deliverableType" = 'Social post (static)' AND "complexityTier" = 'HIGH';
UPDATE "PriceListItem" SET "displayName" = 'Presentation slides', "unit" = 'slide' WHERE "deliverableType" = 'PPT slide' AND "complexityTier" = 'LOW';
UPDATE "PriceListItem" SET "displayName" = 'Presentation slides', "unit" = 'slide' WHERE "deliverableType" = 'PPT slide' AND "complexityTier" = 'MEDIUM';
UPDATE "PriceListItem" SET "displayName" = 'Data visualisation slides', "unit" = 'slide' WHERE "deliverableType" = 'PPT slide' AND "complexityTier" = 'HIGH';
UPDATE "PriceListItem" SET "displayName" = 'Video cutdowns', "unit" = 'cutdown' WHERE "deliverableType" = 'Video cutdown (<30s)' AND "complexityTier" = 'LOW';
UPDATE "PriceListItem" SET "displayName" = 'Video cutdowns', "unit" = 'cutdown' WHERE "deliverableType" = 'Video cutdown (<30s)' AND "complexityTier" = 'MEDIUM';
UPDATE "PriceListItem" SET "displayName" = 'Motion cutdowns', "unit" = 'cutdown' WHERE "deliverableType" = 'Video cutdown (<30s)' AND "complexityTier" = 'HIGH';
UPDATE "PriceListItem" SET "displayName" = 'Video production', "unit" = 'video' WHERE "deliverableType" = 'Full video production' AND "complexityTier" = 'HIGH';
UPDATE "PriceListItem" SET "displayName" = 'Landing page', "unit" = 'page' WHERE "deliverableType" = 'Landing page build' AND "complexityTier" = 'MEDIUM';
UPDATE "PriceListItem" SET "displayName" = 'Custom landing page', "unit" = 'page' WHERE "deliverableType" = 'Landing page build' AND "complexityTier" = 'HIGH';
UPDATE "PriceListItem" SET "displayName" = 'Email copy', "unit" = 'email' WHERE "deliverableType" = 'Email copy' AND "complexityTier" = 'LOW';
UPDATE "PriceListItem" SET "displayName" = 'Campaign email copy', "unit" = 'email' WHERE "deliverableType" = 'Email copy' AND "complexityTier" = 'MEDIUM';
UPDATE "PriceListItem" SET "displayName" = 'Brand guidelines', "unit" = 'deck' WHERE "deliverableType" = 'Brand guidelines deck' AND "complexityTier" = 'HIGH';
UPDATE "EstimateLineItem" SET "complexityTier" = 'LOW' WHERE "complexityTier" IS NULL AND ("detail" LIKE '% Low %' OR "detail" LIKE '% Low');
UPDATE "EstimateLineItem" SET "detail" = REPLACE(REPLACE("detail", ' · Low — ', ' · '), ' · Low', '') WHERE "complexityTier" = 'LOW';
UPDATE "EstimateLineItem" SET "complexityTier" = 'MEDIUM' WHERE "complexityTier" IS NULL AND ("detail" LIKE '% Medium %' OR "detail" LIKE '% Medium');
UPDATE "EstimateLineItem" SET "detail" = REPLACE(REPLACE("detail", ' · Medium — ', ' · '), ' · Medium', '') WHERE "complexityTier" = 'MEDIUM';
UPDATE "EstimateLineItem" SET "complexityTier" = 'HIGH' WHERE "complexityTier" IS NULL AND ("detail" LIKE '% High %' OR "detail" LIKE '% High');
UPDATE "EstimateLineItem" SET "detail" = REPLACE(REPLACE("detail", ' · High — ', ' · '), ' · High', '') WHERE "complexityTier" = 'HIGH';
UPDATE "EstimateLineItem" SET "quantity" = CAST("detail" AS INTEGER) WHERE CAST("detail" AS INTEGER) > 0;
UPDATE "EstimateLineItem" SET "priceListItemId" = (SELECT p."id" FROM "PriceListItem" p WHERE p."deliverableType" = "EstimateLineItem"."deliverable" AND p."complexityTier" = "EstimateLineItem"."complexityTier") WHERE "priceListItemId" IS NULL;
