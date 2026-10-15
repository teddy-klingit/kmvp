-- Phase T: Admin access separate from the job title. A Marketing PM can also be an admin (approved 2026-10-15:
-- Teddy W. keeps his PM view and gets Admin). Everyone with the ADMIN title keeps it.
ALTER TABLE "StaffMember" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "StaffMember" SET "isAdmin" = true WHERE "title" = 'ADMIN' OR "userId" IN (SELECT "id" FROM "User" WHERE "email" = 'teddy@klingit.com');
