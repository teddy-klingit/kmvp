-- Phase V step 5: opportunities built from several sources (numbers computed in code) and their rule-based confidence.
ALTER TABLE "Opportunity" ADD COLUMN "combined" JSONB;
ALTER TABLE "Opportunity" ADD COLUMN "confidence" TEXT;
