-- Phase X v2 (X8): the client's marketing goals, set by its PM, shown on Insights → Overview.
CREATE TABLE "ClientGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "measure" TEXT NOT NULL DEFAULT 'manual',
    "target" REAL NOT NULL,
    "current" REAL,
    "unit" TEXT,
    "startAt" DATETIME,
    "dueAt" DATETIME,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "setByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientGoal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientGoal_clientId_sortOrder_idx" ON "ClientGoal"("clientId", "sortOrder");
