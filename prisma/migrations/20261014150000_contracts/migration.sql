-- Phase S step 4: contracts and their change history.
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "platformPlanKey" TEXT NOT NULL,
    "teamPackKey" TEXT,
    "pmCreditsPerMonth" REAL NOT NULL DEFAULT 0,
    "creativeCreditsPerMonth" REAL NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "invoicing" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "platformPrice" REAL NOT NULL,
    "teamPrice" REAL NOT NULL DEFAULT 0,
    "noticeDeadline" DATETIME NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "cancelledAt" DATETIME,
    "contactStaffId" TEXT,
    "pausedFrom" DATETIME,
    "pausedDays" INTEGER NOT NULL DEFAULT 0,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contract_contactStaffId_fkey" FOREIGN KEY ("contactStaffId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Contract_clientId_status_idx" ON "Contract"("clientId", "status");

CREATE TABLE "ContractChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "effectiveFrom" DATETIME NOT NULL,
    "until" DATETIME,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "byUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractChange_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContractChange_contractId_status_effectiveFrom_idx" ON "ContractChange"("contractId", "status", "effectiveFrom");
