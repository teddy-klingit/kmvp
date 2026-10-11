-- Phase R: rows inserted by the R1–R3 migrations' SQL stored dates as text; Prisma stores SQLite dates as integer
-- milliseconds, and date filters (the plan's key moments, for one) compare numbers. Convert them in place.
UPDATE "BrandRule" SET "createdAt" = CAST(strftime('%s', "createdAt") AS INTEGER) * 1000 WHERE typeof("createdAt") = 'text';
UPDATE "BrandRule" SET "updatedAt" = CAST(strftime('%s', "updatedAt") AS INTEGER) * 1000 WHERE typeof("updatedAt") = 'text';
UPDATE "BrandRule" SET "deletedAt" = CAST(strftime('%s', "deletedAt") AS INTEGER) * 1000 WHERE typeof("deletedAt") = 'text';
UPDATE "BrandRuleChange" SET "createdAt" = CAST(strftime('%s', "createdAt") AS INTEGER) * 1000 WHERE typeof("createdAt") = 'text';
UPDATE "BrandRuleChange" SET "undoneAt" = CAST(strftime('%s', "undoneAt") AS INTEGER) * 1000 WHERE typeof("undoneAt") = 'text';
UPDATE "PlanLeadTime" SET "updatedAt" = CAST(strftime('%s', "updatedAt") AS INTEGER) * 1000 WHERE typeof("updatedAt") = 'text';
UPDATE "KeyMoment" SET "date" = CAST(strftime('%s', "date") AS INTEGER) * 1000 WHERE typeof("date") = 'text';
UPDATE "KeyMoment" SET "endDate" = CAST(strftime('%s', "endDate") AS INTEGER) * 1000 WHERE typeof("endDate") = 'text';
UPDATE "KeyMoment" SET "createdAt" = CAST(strftime('%s', "createdAt") AS INTEGER) * 1000 WHERE typeof("createdAt") = 'text';
UPDATE "Agent" SET "createdAt" = CAST(strftime('%s', "createdAt") AS INTEGER) * 1000 WHERE typeof("createdAt") = 'text';
UPDATE "ClientCalendarItem" SET "updatedAt" = CAST(strftime('%s', "updatedAt") AS INTEGER) * 1000 WHERE typeof("updatedAt") = 'text';
