-- Team credits: the Plan table is the source; a client gets an explicit override only where staff set one.
ALTER TABLE "Client" ADD COLUMN "teamCreditsOverride" INTEGER;

-- Clients whose stored allowance differs from their plan keep what they see today, now as an explicit override.
-- Demo clients follow their plan.
UPDATE "Client"
SET "teamCreditsOverride" = "monthlyCreditAllowance"
WHERE "isDemo" = 0
  AND "monthlyCreditAllowance" <> COALESCE((SELECT "monthlyTeamCredits" FROM "Plan" WHERE "Plan"."tier" = "Client"."planTier"), -1);
