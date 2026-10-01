-- AlterTable
ALTER TABLE "Team" ADD COLUMN "confirmedAt" DATETIME;


-- Backfill: a confirmed team's clock started when the STAFFING stage completed;
-- fall back to when the team was created if that stage row is missing.
UPDATE "Team"
SET "confirmedAt" = COALESCE(
  (SELECT "completedAt" FROM "PipelineStage" WHERE "PipelineStage"."projectId" = "Team"."projectId" AND "PipelineStage"."name" = 'STAFFING'),
  "createdAt"
)
WHERE "confirmed" = 1 AND "confirmedAt" IS NULL;
