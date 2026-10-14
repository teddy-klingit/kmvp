-- Phase S step 1: assistants never use AI credits. Their token cost is still logged, as not billable.
ALTER TABLE "AiCreditLedger" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;

-- Staff-editable settings (fair-use limit and, later, the commercial settings).
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "PlatformSetting" ("key", "value", "updatedAt") VALUES ('assistantFairUsePerDay', '200', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
