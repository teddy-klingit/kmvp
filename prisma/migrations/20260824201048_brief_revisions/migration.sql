-- CreateTable
CREATE TABLE "BriefRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "briefId" TEXT NOT NULL,
    "goals" TEXT,
    "targetAudience" TEXT,
    "successMetrics" TEXT,
    "references" TEXT,
    "changedByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BriefRevision_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
