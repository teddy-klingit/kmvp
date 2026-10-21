-- Phase W step 7: what "Not for us" (and missed results) taught the suggestions, per client.
CREATE TABLE "OpportunityPrefs" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "budgetFixedUntil" DATETIME,
    "moreChecksUntil" DATETIME,
    "excludeTopics" JSONB NOT NULL DEFAULT '[]',
    "minDataDays" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpportunityPrefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
