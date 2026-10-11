-- Plan replaces Calendar (Phase R step 3): every plan item has an owner, a status and, when Klingit helps, a brief-by date.
ALTER TABLE "ClientCalendarItem" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "channels" JSONB;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "formats" JSONB;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "maker" TEXT NOT NULL DEFAULT 'client';
ALTER TABLE "ClientCalendarItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE "ClientCalendarItem" ADD COLUMN "briefBy" DATETIME;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "reminded" JSONB;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "opportunityId" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "route" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "publishedAssetId" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "ClientCalendarItem" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "ClientCalendarItem" SET "updatedAt" = "createdAt";
-- Older items keep their one channel as their channel list.
UPDATE "ClientCalendarItem" SET "channels" = json_array("channel") WHERE "channels" IS NULL AND "channel" IS NOT NULL AND "channel" <> '';

CREATE UNIQUE INDEX "ClientCalendarItem_clientId_requestKey_key" ON "ClientCalendarItem"("clientId", "requestKey");
CREATE INDEX "ClientCalendarItem_clientId_date_idx" ON "ClientCalendarItem"("clientId", "date");

-- Lead times per format (working days) and a rough team-credit estimate: placeholders, staff-editable.
CREATE TABLE "PlanLeadTime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "format" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "teamCredits" REAL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PlanLeadTime_format_key" ON "PlanLeadTime"("format");
INSERT INTO "PlanLeadTime" ("id", "format", "workingDays", "teamCredits", "sortOrder") VALUES
  ('lt_post', 'Post', 5, 2, 0),
  ('lt_carousel', 'Carousel', 7, 4, 1),
  ('lt_stories', 'Stories', 7, 4, 2),
  ('lt_reel', 'Reel / video', 10, 6, 3),
  ('lt_film', 'Film', 20, 12, 4),
  ('lt_email', 'Email', 5, 3, 5),
  ('lt_banner', 'Banner set', 7, 4, 6);

-- Key moments per market (SE / NO / DK / FI): holidays and shopping days, staff-editable.
CREATE TABLE "KeyMoment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "endDate" DATETIME,
    "name" TEXT NOT NULL,
    "markets" JSONB NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'holiday',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "KeyMoment_date_idx" ON "KeyMoment"("date");
INSERT INTO "KeyMoment" ("id", "date", "name", "markets", "kind") VALUES
  ('km_2026_halloween', '2026-10-31T12:00:00.000Z', 'Halloween', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2026_allsaints_sefi', '2026-10-31T12:00:00.000Z', 'All Saints', '["SE","FI"]', 'holiday'),
  ('km_2026_allsaints_nodk', '2026-11-01T12:00:00.000Z', 'All Saints', '["NO","DK"]', 'holiday'),
  ('km_2026_fathers', '2026-11-08T12:00:00.000Z', 'Father''s Day', '["SE","NO","FI"]', 'holiday'),
  ('km_2026_singles', '2026-11-11T12:00:00.000Z', 'Singles Day', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2026_blackfriday', '2026-11-27T12:00:00.000Z', 'Black Friday', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2026_cybermonday', '2026-11-30T12:00:00.000Z', 'Cyber Monday', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2026_fi_independence', '2026-12-06T12:00:00.000Z', 'Independence Day', '["FI"]', 'holiday'),
  ('km_2026_lucia', '2026-12-13T12:00:00.000Z', 'Lucia', '["SE","FI"]', 'holiday'),
  ('km_2026_xmaseve', '2026-12-24T12:00:00.000Z', 'Christmas Eve', '["SE","NO","DK","FI"]', 'holiday'),
  ('km_2026_xmas', '2026-12-25T12:00:00.000Z', 'Christmas Day', '["SE","NO","DK","FI"]', 'holiday'),
  ('km_2026_boxing', '2026-12-26T12:00:00.000Z', 'Boxing Day sales', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2026_nye', '2026-12-31T12:00:00.000Z', 'New Year''s Eve', '["SE","NO","DK","FI"]', 'holiday'),
  ('km_2027_epiphany', '2027-01-06T12:00:00.000Z', 'Epiphany', '["SE","FI"]', 'holiday'),
  ('km_2027_no_mothers', '2027-02-14T12:00:00.000Z', 'Mother''s Day', '["NO"]', 'holiday'),
  ('km_2027_valentine', '2027-02-14T12:00:00.000Z', 'Valentine''s Day', '["SE","NO","DK","FI"]', 'shopping'),
  ('km_2027_womensday', '2027-03-08T12:00:00.000Z', 'Women''s Day', '["SE","NO","DK","FI"]', 'holiday'),
  ('km_2027_easter', '2027-03-28T12:00:00.000Z', 'Easter', '["SE","NO","DK","FI"]', 'holiday'),
  ('km_2027_dkfi_mothers', '2027-05-09T12:00:00.000Z', 'Mother''s Day', '["DK","FI"]', 'holiday'),
  ('km_2027_no_17mai', '2027-05-17T12:00:00.000Z', 'Constitution Day', '["NO"]', 'holiday'),
  ('km_2027_se_mothers', '2027-05-30T12:00:00.000Z', 'Mother''s Day', '["SE"]', 'holiday'),
  ('km_2027_dk_grundlov', '2027-06-05T12:00:00.000Z', 'Constitution Day', '["DK"]', 'holiday'),
  ('km_2027_se_national', '2027-06-06T12:00:00.000Z', 'National Day', '["SE"]', 'holiday'),
  ('km_2027_nodk_sankthans', '2027-06-23T12:00:00.000Z', 'Midsummer (Sankthans)', '["NO","DK"]', 'holiday'),
  ('km_2027_sefi_midsummer', '2027-06-25T12:00:00.000Z', 'Midsummer Eve', '["SE","FI"]', 'holiday');

-- Private iCal feeds per user (Plan → Subscribe), revocable.
CREATE TABLE "PlanFeedToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);
CREATE UNIQUE INDEX "PlanFeedToken_token_key" ON "PlanFeedToken"("token");
CREATE INDEX "PlanFeedToken_userId_idx" ON "PlanFeedToken"("userId");
