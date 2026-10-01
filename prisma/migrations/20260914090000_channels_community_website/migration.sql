-- CreateTable
CREATE TABLE "ConnectedChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConnectedChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SentMessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentMessageLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SentMessageLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ConnectedChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityEscalation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityEscalation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteAnalyticsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "visits" INTEGER NOT NULL,
    "uniqueVisitors" INTEGER NOT NULL,
    "conversions" INTEGER NOT NULL,
    "conversionRate" REAL NOT NULL,
    "avgSessionSeconds" INTEGER,
    "socialReferralVisits" INTEGER,
    "topSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteAnalyticsSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConnectedChannel_clientId_idx" ON "ConnectedChannel"("clientId");

-- CreateIndex
CREATE INDEX "SentMessageLog_clientId_sentAt_idx" ON "SentMessageLog"("clientId", "sentAt");

-- CreateIndex
CREATE INDEX "CommunityEscalation_clientId_status_idx" ON "CommunityEscalation"("clientId", "status");

-- CreateIndex
CREATE INDEX "WebsiteAnalyticsSnapshot_clientId_periodStart_idx" ON "WebsiteAnalyticsSnapshot"("clientId", "periodStart");

