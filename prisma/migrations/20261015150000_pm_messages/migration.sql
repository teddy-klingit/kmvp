-- Phase U: one conversation per client with their Marketing PM. General messages live here; a message "about" a
-- project is that project's Comment (stored once, shown in both places).
CREATE TABLE "ClientMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorClientUserId" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientMessage_clientId_createdAt_idx" ON "ClientMessage"("clientId", "createdAt");

-- Who has read the client's thread up to when (client users and staff alike).
CREATE TABLE "PmThreadRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PmThreadRead_userId_clientId_key" ON "PmThreadRead"("userId", "clientId");

-- Attachments on project messages, like on general ones: [{ name, storageKey, mimeType, size }].
ALTER TABLE "Comment" ADD COLUMN "attachments" JSONB;

-- "Book a call" in the message panel: a link per Marketing PM.
ALTER TABLE "StaffMember" ADD COLUMN "bookingUrl" TEXT;
