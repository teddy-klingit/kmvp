-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClientApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "hostedUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByStaffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientApp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientApp_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClientApp" ("clientId", "createdAt", "description", "hostedUrl", "id", "name", "status", "updatedAt") SELECT "clientId", "createdAt", "description", "hostedUrl", "id", "name", "status", "updatedAt" FROM "ClientApp";
DROP TABLE "ClientApp";
ALTER TABLE "new_ClientApp" RENAME TO "ClientApp";
CREATE INDEX "ClientApp_clientId_idx" ON "ClientApp"("clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

