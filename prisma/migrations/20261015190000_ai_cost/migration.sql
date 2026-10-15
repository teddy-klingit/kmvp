-- Phase U: AI credits are a dollar budget. 1 credit = $0.01 of real AI cost (staff setting). Every ledger row and run
-- stores its real cost; plans have a monthly AI budget in USD and the credits follow from it.
ALTER TABLE "AiCreditLedger" ADD COLUMN "costUsd" REAL;
ALTER TABLE "AiCreditLedger" ADD COLUMN "costEstimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiCreditLedger" ADD COLUMN "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiCreditLedger" ADD COLUMN "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiCreditLedger" ADD COLUMN "images" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN "costUsd" REAL;
ALTER TABLE "PlatformPlan" ADD COLUMN "aiBudgetUsd" REAL;

-- Rows from before this: cost estimated from their tokens and model at the placeholder prices ($ per million tokens,
-- in/out): Opus 5 15/75, Sonnet 3/15, Haiku 1/5, other 3/15. Marked as estimated.
UPDATE "AiCreditLedger" SET "costEstimated" = true, "costUsd" = ROUND((
  "tokensIn" * (CASE WHEN "model" LIKE 'claude-opus%' THEN 15.0 WHEN "model" LIKE 'claude-haiku%' THEN 1.0 ELSE 3.0 END) +
  "tokensOut" * (CASE WHEN "model" LIKE 'claude-opus%' THEN 75.0 WHEN "model" LIKE 'claude-haiku%' THEN 5.0 ELSE 15.0 END)
) / 1000000.0, 6) WHERE "kind" = 'USAGE' AND ("tokensIn" > 0 OR "tokensOut" > 0);

-- Plans (placeholders, the pricing page): Basic €25 / $3 = 300 credits, Pro $10 = 1,000, Enterprise $30 = 3,000.
-- Any plan may use the client's own Claude now, so Basic no longer needs one.
UPDATE "PlatformPlan" SET "priceEur" = 25, "aiBudgetUsd" = 3, "aiCreditsPerMonth" = 300, "ownModel" = false WHERE "key" = 'basic';
UPDATE "PlatformPlan" SET "aiBudgetUsd" = 10, "aiCreditsPerMonth" = 1000 WHERE "key" = 'pro';
UPDATE "PlatformPlan" SET "aiBudgetUsd" = 30, "aiCreditsPerMonth" = 3000 WHERE "key" = 'enterprise';

-- Scheduled work sent through the Batch API (half price, results within hours): one row per submitted batch.
CREATE TABLE "AiBatchJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
CREATE UNIQUE INDEX "AiBatchJob_batchId_key" ON "AiBatchJob"("batchId");
