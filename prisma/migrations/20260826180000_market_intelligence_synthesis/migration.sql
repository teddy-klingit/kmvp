-- CreateTable
CREATE TABLE "CompetitorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "positioning" TEXT NOT NULL,
    "themes" JSONB NOT NULL,
    "activityLevel" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrendBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "takeaway" TEXT NOT NULL,
    "themes" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendBrief_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PerformanceBenchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ownFormat" TEXT NOT NULL,
    "ownCtr" REAL NOT NULL,
    "estimatedLow" REAL NOT NULL,
    "estimatedHigh" REAL NOT NULL,
    "rationale" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerformanceBenchmark_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorProfile_clientId_brand_key" ON "CompetitorProfile"("clientId", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "TrendBrief_clientId_key" ON "TrendBrief"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceBenchmark_clientId_key" ON "PerformanceBenchmark"("clientId");

