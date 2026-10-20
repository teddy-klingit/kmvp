-- Phase V step 1: competitor checks keep up to 3 example ads, so the Competitors page reads stored checks only.
ALTER TABLE "CompetitorSnapshot" ADD COLUMN "ads" JSONB;
