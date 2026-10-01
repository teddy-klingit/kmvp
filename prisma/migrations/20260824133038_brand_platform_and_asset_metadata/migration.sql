-- AlterTable
ALTER TABLE "BrandAsset" ADD COLUMN "colorSpace" TEXT;
ALTER TABLE "BrandAsset" ADD COLUMN "dimensions" TEXT;
ALTER TABLE "BrandAsset" ADD COLUMN "fileSizeLabel" TEXT;

-- AlterTable
ALTER TABLE "BrandOS" ADD COLUMN "coreValues" JSONB;
ALTER TABLE "BrandOS" ADD COLUMN "mission" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "servicesNote" TEXT;
ALTER TABLE "BrandOS" ADD COLUMN "usps" JSONB;
ALTER TABLE "BrandOS" ADD COLUMN "vision" TEXT;
