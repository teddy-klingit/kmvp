-- The brief agent's drafted chips and The task's inputs, kept between studio turns.
ALTER TABLE "Brief" ADD COLUMN "agentDrafts" JSONB;
