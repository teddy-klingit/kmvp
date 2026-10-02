-- Demo-only data sources and a dummy card on file, always labelled "demo" in the UI.
ALTER TABLE "Client" ADD COLUMN "demoSources" JSONB;
ALTER TABLE "Client" ADD COLUMN "cardBrand" TEXT;
ALTER TABLE "Client" ADD COLUMN "cardLast4" TEXT;
ALTER TABLE "Client" ADD COLUMN "cardExpiry" TEXT;
ALTER TABLE "Client" ADD COLUMN "cardIsDemo" BOOLEAN NOT NULL DEFAULT false;
