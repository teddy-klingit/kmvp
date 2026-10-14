-- Phase S step 2: platform plans, team packs, FX rates and price overrides. All prices are placeholders.
CREATE TABLE "PlatformPlan" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceEur" REAL NOT NULL,
    "aiCreditsPerMonth" INTEGER NOT NULL,
    "ownModel" BOOLEAN NOT NULL DEFAULT false,
    "tagline" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "TeamPack" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pmCredits" INTEGER NOT NULL DEFAULT 0,
    "creativeCredits" INTEGER NOT NULL DEFAULT 0,
    "priceEur" REAL,
    "perRequest" BOOLEAN NOT NULL DEFAULT false,
    "requiresPlanKey" TEXT NOT NULL DEFAULT 'enterprise',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "FxRate" (
    "currency" TEXT NOT NULL PRIMARY KEY,
    "perEur" REAL NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "PriceOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "updatedByUserId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PriceOverride_ref_currency_key" ON "PriceOverride"("ref", "currency");

INSERT INTO "PlatformPlan" ("key", "name", "priceEur", "aiCreditsPerMonth", "ownModel", "tagline", "features", "sortOrder", "updatedAt") VALUES
  ('basic', 'Basic', 9, 0, true, 'Your own AI: Claude via MCP or your own API key', '["Brand OS, Plan and Opportunities","Insights and Ask your data","Output library and standard reports","All assistants and standard skills"]', 0, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pro', 'Pro', 99, 300, false, 'Klingit AI, about 300 AI credits a month', '["Everything in Basic","Klingit AI with top-ups","Standard reporting"]', 1, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('enterprise', 'Enterprise', 249, 1000, false, 'About 1,000 AI credits and every feature', '["Multi-brand","Custom skills and apps","Scheduled and branded reports","Custom dashboards","Approval flows and audit log","SSO and priority support"]', 2, CAST(strftime('%s','now') AS INTEGER) * 1000);

INSERT INTO "TeamPack" ("key", "name", "pmCredits", "creativeCredits", "priceEur", "perRequest", "sortOrder", "updatedAt") VALUES
  ('pm10', 'PM 10', 10, 0, 995, false, 0, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pm20', 'PM 20', 20, 0, 1895, false, 1, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pm40', 'PM 40', 40, 0, 3270, false, 2, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pmc10_20', 'PM + creative 10 + 20', 10, 20, 2655, false, 3, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pmc20_40', 'PM + creative 20 + 40', 20, 40, 4600, false, 4, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('pmc40_80', 'PM + creative 40 + 80', 40, 80, 8865, false, 5, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('per_request', 'Per request', 0, 0, NULL, true, 6, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- Units per EUR (placeholders, from the SEK reference rates: 1 EUR = 10.76 SEK; USD 9.22 and GBP 12.39 SEK).
INSERT INTO "FxRate" ("currency", "perEur", "updatedAt") VALUES
  ('SEK', 10.76, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('NOK', 11.70, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('USD', 1.167, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('GBP', 0.868, CAST(strftime('%s','now') AS INTEGER) * 1000);
