-- Phase X v2 (X4): post themes, the most-asked community questions, and when the audience is online.
ALTER TABLE "ContentPost" ADD COLUMN "theme" TEXT;
ALTER TABLE "CommunityManagementSnapshot" ADD COLUMN "questions" JSONB;
CREATE TABLE "AudienceActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "grid" JSONB NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AudienceActivity_clientId_platform_capturedAt_idx" ON "AudienceActivity"("clientId", "platform", "capturedAt");
