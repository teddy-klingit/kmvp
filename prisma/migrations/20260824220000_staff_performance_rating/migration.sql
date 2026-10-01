-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "skills" JSONB,
    "brandFitTags" JSONB,
    "capacityHoursPerWeek" INTEGER NOT NULL DEFAULT 40,
    "performanceRating" REAL NOT NULL DEFAULT 4.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffMember" ("brandFitTags", "capacityHoursPerWeek", "createdAt", "id", "skills", "title", "userId") SELECT "brandFitTags", "capacityHoursPerWeek", "createdAt", "id", "skills", "title", "userId" FROM "StaffMember";
DROP TABLE "StaffMember";
ALTER TABLE "new_StaffMember" RENAME TO "StaffMember";
CREATE UNIQUE INDEX "StaffMember_userId_key" ON "StaffMember"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_staffMemberId_key" ON "TeamMember"("teamId", "staffMemberId");

