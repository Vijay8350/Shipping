-- AlterTable (Subscription: usage line item + period start for metering)
ALTER TABLE "Subscription" ADD COLUMN "usageLineItemId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
