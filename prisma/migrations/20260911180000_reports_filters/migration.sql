-- AlterTable
ALTER TABLE "PerformanceSnapshot" ADD COLUMN "conversions" INTEGER;
ALTER TABLE "PerformanceSnapshot" ADD COLUMN "spend" REAL;

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedReport_clientId_createdAt_idx" ON "SavedReport"("clientId", "createdAt");

