-- AlterTable (Return: reverse-pickup leg bookkeeping)
ALTER TABLE "Return" ADD COLUMN "reverseCourierKey" TEXT;
ALTER TABLE "Return" ADD COLUMN "reverseExternalShipmentId" TEXT;
ALTER TABLE "Return" ADD COLUMN "reverseRawStatus" TEXT;

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationTemplate_shopId_idx" ON "NotificationTemplate"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_shopId_event_channel_key" ON "NotificationTemplate"("shopId", "event", "channel");

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
