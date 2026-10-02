-- Price list rows are archived, never deleted (estimates keep their link).
ALTER TABLE "PriceListItem" ADD COLUMN "archivedAt" DATETIME;
