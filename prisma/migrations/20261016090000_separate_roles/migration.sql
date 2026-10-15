-- Quick fixes (2026-10-15): roles are separate. A Marketing PM is not also an admin; Admin is the ADMIN title only.
-- The isAdmin flag stays in the table (not read any more) and is switched off for everyone who isn't an ADMIN.
-- Each change is logged.
INSERT INTO "AuditLog" ("id", "clientId", "actorUserId", "area", "action", "before", "after", "createdAt")
SELECT lower(hex(randomblob(12))), NULL, NULL, 'roles',
       'Admin access removed from ' || u."name" || ': roles are separate (a PM is not also an admin)',
       '{"isAdmin":true}', '{"isAdmin":false}', CURRENT_TIMESTAMP
FROM "StaffMember" s JOIN "User" u ON u."id" = s."userId"
WHERE s."isAdmin" = true AND s."title" <> 'ADMIN';
UPDATE "StaffMember" SET "isAdmin" = false WHERE "title" <> 'ADMIN';
