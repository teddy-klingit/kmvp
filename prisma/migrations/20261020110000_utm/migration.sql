-- Phase V step 3: UTMs on everything Klingit ships. A project's utm_campaign slug (set once), and where each output
-- points (its landing page; the tagged link adds the UTMs).
ALTER TABLE "Project" ADD COLUMN "utmSlug" TEXT;
ALTER TABLE "Asset" ADD COLUMN "linkUrl" TEXT;
ALTER TABLE "SkillOutput" ADD COLUMN "linkUrl" TEXT;
