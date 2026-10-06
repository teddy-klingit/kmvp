-- Quality check is internal: versions with states, QC flags, and the version the client has.
ALTER TABLE "Asset" ADD COLUMN "sentVersion" INTEGER;

CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "fileUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedByUserId" TEXT,
    "checks" JSONB,
    "checkRunId" TEXT,
    "checkedAt" DATETIME,
    "sentAt" DATETIME,
    "sentByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssetVersion_assetId_number_key" ON "AssetVersion"("assetId", "number");
CREATE INDEX "AssetVersion_projectId_state_idx" ON "AssetVersion"("projectId", "state");

CREATE TABLE "QcFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "resolvedByUserId" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QcFlag_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QcFlag_projectId_status_idx" ON "QcFlag"("projectId", "status");

-- Work already with the client stays with the client: projects delivered or in review/feedback/delivered.
UPDATE "Asset" SET "sentVersion" = "version"
WHERE "status" = 'DELIVERED'
   OR "projectId" IN (SELECT "id" FROM "Project" WHERE "deliveredAt" IS NOT NULL OR "status" IN ('AWAITING_REVIEW', 'IN_FEEDBACK', 'DELIVERED'));

-- One version per existing asset, in the state that matches where the work is.
INSERT INTO "AssetVersion" ("id", "assetId", "projectId", "number", "state", "storageKey", "mimeType", "sizeBytes", "fileUrl", "uploadedByUserId", "sentAt", "createdAt")
SELECT
    'v' || lower(hex(randomblob(12))),
    a."id", a."projectId", a."version",
    CASE
        WHEN a."sentVersion" IS NULL THEN 'QC_READY'
        WHEN a."status" IN ('APPROVED', 'DELIVERED') THEN 'APPROVED'
        WHEN a."status" = 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
        ELSE 'SENT_TO_CLIENT'
    END,
    a."storageKey", a."mimeType", a."sizeBytes", a."fileUrl", a."uploadedByUserId",
    CASE WHEN a."sentVersion" IS NULL THEN NULL ELSE COALESCE(p."deliveredAt", a."createdAt") END,
    a."createdAt"
FROM "Asset" a JOIN "Project" p ON p."id" = a."projectId";
