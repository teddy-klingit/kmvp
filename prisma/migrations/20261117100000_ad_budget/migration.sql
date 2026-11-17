-- Phase X v2 (X3): the client's planned ad spend per month, for "% of plan" and budget pacing on Paid ads.
CREATE TABLE "AdBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "setByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdBudget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdBudget_clientId_month_channel_key" ON "AdBudget"("clientId", "month", "channel");
