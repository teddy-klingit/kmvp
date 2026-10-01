-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "contentType" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "scheduledDate" DATETIME,
    "publishedDate" DATETIME,
    "impressions" INTEGER,
    "reach" INTEGER,
    "engagements" INTEGER,
    "engagementRate" REAL,
    "videoViews" INTEGER,
    "websiteClicks" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentPost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowerSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientBusinessOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "revenue" REAL,
    "leadsGenerated" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientBusinessOutcome_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentPlanTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "weeklyVolume" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentPlanTarget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentPlanSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "platform" TEXT,
    "suggestedVolumeChange" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "briefedProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ContentPlanSuggestion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientReportingConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'WEEKLY',
    "kpiTargets" JSONB,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientReportingConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContentPost_clientId_platform_status_idx" ON "ContentPost"("clientId", "platform", "status");

-- CreateIndex
CREATE INDEX "FollowerSnapshot_clientId_platform_capturedAt_idx" ON "FollowerSnapshot"("clientId", "platform", "capturedAt");

-- CreateIndex
CREATE INDEX "ClientBusinessOutcome_clientId_periodStart_idx" ON "ClientBusinessOutcome"("clientId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPlanTarget_clientId_platform_key" ON "ContentPlanTarget"("clientId", "platform");

-- CreateIndex
CREATE INDEX "ContentPlanSuggestion_clientId_status_idx" ON "ContentPlanSuggestion"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientReportingConfig_clientId_key" ON "ClientReportingConfig"("clientId");

