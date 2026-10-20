-- Phase V step 5: what an AI answer or takeaway is based on (source chips, data size, rule-based confidence).
ALTER TABLE "MarketIntelligenceQuestion" ADD COLUMN "sources" JSONB;
ALTER TABLE "MarketIntelligenceQuestion" ADD COLUMN "dataSize" TEXT;
ALTER TABLE "MarketIntelligenceQuestion" ADD COLUMN "confidence" TEXT;
ALTER TABLE "PerformanceBrief" ADD COLUMN "basis" JSONB;
