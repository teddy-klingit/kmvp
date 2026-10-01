-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CAMPAIGN',
    "status" TEXT NOT NULL DEFAULT 'BRIEFING',
    "dueDate" DATETIME,
    "startedAt" DATETIME,
    "deliveredAt" DATETIME,
    "creditsQuoted" INTEGER,
    "creditsActual" INTEGER,
    "priceAmount" REAL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("clientId", "createdAt", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "priceAmount", "priceCurrency", "startedAt", "status", "updatedAt") SELECT "clientId", "createdAt", "creditsActual", "creditsQuoted", "deliveredAt", "dueDate", "id", "name", "priceAmount", "priceCurrency", "startedAt", "status", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
