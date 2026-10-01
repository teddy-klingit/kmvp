-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "unresolvedNeeds" JSONB;

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableType" TEXT NOT NULL,
    "complexityTier" TEXT NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_deliverableType_complexityTier_key" ON "PriceListItem"("deliverableType", "complexityTier");

