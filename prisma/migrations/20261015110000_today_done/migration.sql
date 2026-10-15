-- Phase T: Today's "Done today" (ticked or acted), per staff member and day.
CREATE TABLE "TodayDone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "how" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TodayDone_staffId_taskKey_day_key" ON "TodayDone"("staffId", "taskKey", "day");
CREATE INDEX "TodayDone_staffId_day_idx" ON "TodayDone"("staffId", "day");
