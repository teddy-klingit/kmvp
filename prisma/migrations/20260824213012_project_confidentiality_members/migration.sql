-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CAMPAIGN',
    "status" TEXT NOT NULL DEFAULT 'BRIEFING',
    "pausedFromStatus" TEXT,
    "dueDate" DATETIME,
    "startedAt" DATETIME,
    "deliveredAt" DATETIME,
    "creditsQuoted" INTEGER,
    "creditsActual" INTEGER,
    "priceAmount" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "createdByClientUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_createdByClientUserId_fkey" FOREIGN KEY ("createdByClientUserId") REFERENCES "ClientUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("clientId", "createdAt", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "pausedFromStatus", "priceAmount", "priceCurrency", "startedAt", "status", "type", "updatedAt") SELECT "clientId", "createdAt", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "pausedFromStatus", "priceAmount", "priceCurrency", "startedAt", "status", "type", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_clientUserId_key" ON "ProjectMember"("projectId", "clientUserId");
