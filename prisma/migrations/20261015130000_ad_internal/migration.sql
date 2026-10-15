-- Phase T: an ad account can be marked as Klingit's own ("internal"): it then feeds no client and leaves every list.
ALTER TABLE "IntegrationConnection" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
