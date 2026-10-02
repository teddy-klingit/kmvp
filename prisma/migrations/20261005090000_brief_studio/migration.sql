-- Brief studio: sectioned live brief, deterministic quality score, the agent's question log and the studio conversation.
ALTER TABLE "Brief" ADD COLUMN "sections" JSONB;
ALTER TABLE "Brief" ADD COLUMN "qualityScore" INTEGER;
ALTER TABLE "Brief" ADD COLUMN "questionsLog" JSONB;
ALTER TABLE "Brief" ADD COLUMN "messages" JSONB;

-- Price List lead times (business days, staffing to final), for the studio's default deadline.
ALTER TABLE "PriceListItem" ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 5;
UPDATE "PriceListItem" SET "leadTimeDays" = 2 WHERE "deliverableType" = 'Email copy';
UPDATE "PriceListItem" SET "leadTimeDays" = 3 WHERE "deliverableType" IN ('Social post (static)', 'PPT slide');
UPDATE "PriceListItem" SET "leadTimeDays" = 5 WHERE "deliverableType" = 'Video cutdown (<30s)';
UPDATE "PriceListItem" SET "leadTimeDays" = 8 WHERE "deliverableType" = 'Landing page build';
UPDATE "PriceListItem" SET "leadTimeDays" = 15 WHERE "deliverableType" IN ('Full video production', 'Brand guidelines deck');
