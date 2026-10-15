-- Phase U: top-ups. Per client: automatic top-up (add 1,000 when below 100, at most 3 a month), and what happens at
-- 100% (null = the staff default: pause skills; "bill" = keep running and bill the overage at the top-up rate).
ALTER TABLE "BillingProfile" ADD COLUMN "autoTopUp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BillingProfile" ADD COLUMN "aiOverage" TEXT;
