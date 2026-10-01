-- AlterTable
ALTER TABLE "BrandOS" ADD COLUMN "audiencePersonas" JSONB;
ALTER TABLE "BrandOS" ADD COLUMN "competitiveNote" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "illustrationStyle" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "imageryStyle" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "keyProducts" JSONB;
ALTER TABLE "BrandOS" ADD COLUMN "valueProposition" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "voiceAttributes" JSONB;

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN "pendingQuestions" JSONB;
ALTER TABLE "Brief" ADD COLUMN "rawIntake" TEXT;
ALTER TABLE "Brief" ADD COLUMN "sourceFileName" TEXT;
ALTER TABLE "Brief" ADD COLUMN "sourceLink" TEXT;
