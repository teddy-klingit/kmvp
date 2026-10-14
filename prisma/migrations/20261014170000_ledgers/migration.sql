-- Phase S step 5: PM and creative balances (never pooled), idempotent monthly grants, fixed-credit services.
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "pool" TEXT NOT NULL DEFAULT 'creative';
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "periodKey" TEXT;
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "serviceId" TEXT;
CREATE UNIQUE INDEX "CreditLedgerEntry_clientId_pool_type_periodKey_serviceId_key" ON "CreditLedgerEntry"("clientId", "pool", "type", "periodKey", "serviceId");
CREATE INDEX "CreditLedgerEntry_clientId_pool_createdAt_idx" ON "CreditLedgerEntry"("clientId", "pool", "createdAt");

ALTER TABLE "Contract" ADD COLUMN "extraSlots" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ServiceAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "priceListItemId" TEXT,
    "name" TEXT NOT NULL,
    "creditsPerMonth" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "months" INTEGER NOT NULL,
    "outsidePack" BOOLEAN NOT NULL DEFAULT false,
    "endedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceAllocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ServiceAllocation_clientId_idx" ON "ServiceAllocation"("clientId");
