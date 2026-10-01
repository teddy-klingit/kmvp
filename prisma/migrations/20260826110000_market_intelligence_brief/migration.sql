-- CreateTable
CREATE TABLE "MarketIntelligenceBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "ideas" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketIntelligenceBrief_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketIntelligenceBrief_clientId_key" ON "MarketIntelligenceBrief"("clientId");

