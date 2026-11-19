-- Phase T2: the PM's notes, the client profile and relationship, check-ins; client key dates; users' last seen.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "KeyMoment" ADD COLUMN "clientId" TEXT;
CREATE INDEX "KeyMoment_clientId_idx" ON "KeyMoment"("clientId");

CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "projectId" TEXT,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "pinnedAt" DATETIME,
    "remindAt" DATETIME,
    "remindDoneAt" DATETIME,
    "durationMin" INTEGER,
    "kickoff" BOOLEAN NOT NULL DEFAULT false,
    "checkInId" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientNote_clientId_createdAt_idx" ON "ClientNote"("clientId", "createdAt");
CREATE INDEX "ClientNote_authorUserId_remindAt_idx" ON "ClientNote"("authorUserId", "remindAt");

CREATE TABLE "ClientProfile" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "goal" TEXT,
    "measures" TEXT,
    "keyDates" JSONB NOT NULL DEFAULT '[]',
    "markets" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "tools" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "cameFrom" TEXT,
    "clientSince" DATETIME,
    "read" TEXT,
    "readAt" DATETIME,
    "readByUserId" TEXT,
    "readNoteId" TEXT,
    "satisfaction" INTEGER,
    "satisfactionAt" DATETIME,
    "favourites" JSONB NOT NULL DEFAULT '[]',
    "updatedByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ClientCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'monthly review',
    "status" TEXT NOT NULL DEFAULT 'booked',
    "bookedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientCheckIn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientCheckIn_clientId_at_idx" ON "ClientCheckIn"("clientId", "at");
