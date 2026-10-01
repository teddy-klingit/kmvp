-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "authorUserId" TEXT,
    "authorClientUserId" TEXT,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "agentPriority" TEXT,
    "agentTaskSummary" TEXT,
    "xPercent" REAL,
    "yPercent" REAL,
    "widthPercent" REAL,
    "heightPercent" REAL,
    "timestampSeconds" REAL,
    "archivedAt" DATETIME,
    "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
    "contextKind" TEXT,
    "contextRef" TEXT,
    "contextLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorClientUserId_fkey" FOREIGN KEY ("authorClientUserId") REFERENCES "ClientUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Comment" ("agentPriority", "agentTaskSummary", "archivedAt", "assetId", "authorClientUserId", "authorUserId", "body", "createdAt", "heightPercent", "id", "projectId", "resolved", "timestampSeconds", "widthPercent", "xPercent", "yPercent") SELECT "agentPriority", "agentTaskSummary", "archivedAt", "assetId", "authorClientUserId", "authorUserId", "body", "createdAt", "heightPercent", "id", "projectId", "resolved", "timestampSeconds", "widthPercent", "xPercent", "yPercent" FROM "Comment";
DROP TABLE "Comment";
ALTER TABLE "new_Comment" RENAME TO "Comment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

