-- Reports: agent-written reports per closed period, and a real send schedule.
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "label" TEXT NOT NULL,
    "takeaways" JSONB NOT NULL,
    "topAssetIds" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GeneratedReport_clientId_kind_periodStart_key" ON "GeneratedReport"("clientId", "kind", "periodStart");
CREATE INDEX "GeneratedReport_clientId_kind_periodStart_idx" ON "GeneratedReport"("clientId", "kind", "periodStart");

ALTER TABLE "ClientReportingConfig" ADD COLUMN "sendDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ClientReportingConfig" ADD COLUMN "sendTime" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "ClientReportingConfig" ADD COLUMN "recipientUserIds" JSONB;
