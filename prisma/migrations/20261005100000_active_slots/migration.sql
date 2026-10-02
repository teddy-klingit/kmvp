-- Active slots per plan (placeholders, editable by an Admin in Settings) and the client queue.
CREATE TABLE "Plan" (
    "tier" TEXT NOT NULL PRIMARY KEY,
    "activeSlots" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "Plan" ("tier", "activeSlots", "updatedAt") VALUES
    ('STARTER', 1, CURRENT_TIMESTAMP),
    ('GROWTH', 2, CURRENT_TIMESTAMP),
    ('SCALE', 3, CURRENT_TIMESTAMP),
    ('ENTERPRISE', 5, CURRENT_TIMESTAMP);

ALTER TABLE "Project" ADD COLUMN "activatedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "queuePosition" INTEGER;

-- Work already past approval holds its slot from when it started.
UPDATE "Project" SET "activatedAt" = COALESCE("startedAt", "updatedAt")
WHERE "status" IN ('STAFFING', 'IN_PRODUCTION', 'QA', 'AWAITING_REVIEW', 'IN_FEEDBACK')
   OR ("status" = 'PAUSED' AND "pausedFromStatus" IN ('STAFFING', 'IN_PRODUCTION', 'QA', 'AWAITING_REVIEW', 'IN_FEEDBACK'));

-- Sent briefs not yet active queue up per client, oldest first.
UPDATE "Project" SET "queuePosition" = (
    SELECT COUNT(*) FROM "Project" AS p2
    WHERE p2."clientId" = "Project"."clientId"
      AND p2."activatedAt" IS NULL
      AND p2."status" IN ('BRIEFING', 'ESTIMATING')
      AND (p2."createdAt" < "Project"."createdAt" OR (p2."createdAt" = "Project"."createdAt" AND p2."id" <= "Project"."id"))
)
WHERE "activatedAt" IS NULL AND "status" IN ('BRIEFING', 'ESTIMATING');
