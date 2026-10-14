-- Phase S step 6: invoicing (no card), billing details, items for the next invoice, and purchase requests.
ALTER TABLE "Invoice" ADD COLUMN "contractId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "periodEnd" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "netAmount" REAL;
ALTER TABLE "Invoice" ADD COLUMN "vatRate" REAL;
ALTER TABLE "Invoice" ADD COLUMN "vatAmount" REAL;
ALTER TABLE "Invoice" ADD COLUMN "reference" TEXT;
CREATE INDEX "Invoice_contractId_periodStart_idx" ON "Invoice"("contractId", "periodStart");

CREATE TABLE "BillingProfile" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT,
    "orgNumber" TEXT,
    "vatNumber" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'SE',
    "invoiceEmail" TEXT,
    "reference" TEXT,
    "eInvoiceAddress" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "vatRate" REAL NOT NULL DEFAULT 0.25,
    "aiTopUpAutoApproveUpTo" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BillingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "requestId" TEXT,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BillingItem_clientId_invoiceId_idx" ON "BillingItem"("clientId", "invoiceId");

CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "price" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedByUserId" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PurchaseRequest_status_createdAt_idx" ON "PurchaseRequest"("status", "createdAt");
CREATE INDEX "PurchaseRequest_clientId_status_idx" ON "PurchaseRequest"("clientId", "status");
