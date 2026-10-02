-- Calendar suggestions get a proposed day and a short reason (agent-written). Older rows stay NULL: side card only.
ALTER TABLE "ContentPlanSuggestion" ADD COLUMN "proposedDate" DATETIME;
ALTER TABLE "ContentPlanSuggestion" ADD COLUMN "reason" TEXT;
