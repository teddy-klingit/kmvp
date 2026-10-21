-- Phase W step 3: an opportunity's kind, its status from New to Result, the PM's note, and its prediction and result.
ALTER TABLE "Opportunity" ADD COLUMN "kind" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "pmNote" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "pmNoteByUserId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "pmNoteAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "viewedAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "statusSetByUserId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "statusSetAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "runningAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "prediction" JSONB;
ALTER TABLE "Opportunity" ADD COLUMN "result" JSONB;
ALTER TABLE "Opportunity" ADD COLUMN "resultAt" DATETIME;
ALTER TABLE "Opportunity" ADD COLUMN "learning" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "learningStatus" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "learningByUserId" TEXT;

-- The old statuses on the new stepper: added and briefed are In plan, live is Running.
UPDATE "Opportunity" SET "status" = 'in_plan' WHERE "status" IN ('added', 'briefed');
UPDATE "Opportunity" SET "status" = 'running' WHERE "status" = 'live';

-- Kind from what it was made from: the combined one moves budget; a key moment makes it seasonal; then competitor, trend.
UPDATE "Opportunity" SET "kind" = CASE
    WHEN "origin" = 'combined' THEN 'budget'
    WHEN "sources" LIKE '%seasonal%' THEN 'seasonal'
    WHEN "sources" LIKE '%competitor%' THEN 'competitor'
    WHEN "sources" LIKE '%trend%' THEN 'trend'
    ELSE 'content' END;
