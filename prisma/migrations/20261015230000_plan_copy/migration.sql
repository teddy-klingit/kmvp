-- Phase U step 6: the plan cards say what the pricing page says (one-line pitch and feature bullets).
-- Only plans whose copy staff haven't edited since Phase S are updated.
UPDATE "PlatformPlan" SET "tagline" = 'The platform, with AI to get started.',
  "features" = '["Brand OS, Plan, Insights, Output library","All standard skills and assistants","1 brand, 3 seats","Standard reports"]',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'basic' AND "tagline" = 'Your own AI: Claude via MCP or your own API key';

UPDATE "PlatformPlan" SET "tagline" = 'For teams that make content every week.',
  "features" = '["Everything in Basic","More AI for a team that makes every week","1 brand, 10 seats","1 custom skill"]',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'pro' AND "tagline" = 'Klingit AI, about 300 AI credits a month';

UPDATE "PlatformPlan" SET "tagline" = 'Every feature, several brands, priority support.',
  "features" = '["Everything in Pro","Several brands and markets, unlimited seats","Custom skills and custom apps","Scheduled and branded reports, custom dashboards","Approvals, audit log, SSO","Priority support"]',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'enterprise' AND "tagline" = 'About 1,000 AI credits and every feature';
