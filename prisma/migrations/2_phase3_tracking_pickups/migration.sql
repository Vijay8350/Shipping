-- AlterTable (Shipment: Phase 3 tracking + fulfillment push-back bookkeeping)
ALTER TABLE "Shipment" ADD COLUMN "shopifyFulfillmentId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "lastTrackedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "externalShipmentId" TEXT;

-- CreateTable
CREATE TABLE "PickupRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "courierKey" TEXT NOT NULL,
    "externalPickupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "scheduledFor" TIMESTAMP(3),
    "packageCount" INTEGER NOT NULL DEFAULT 1,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupRequest_shopId_status_idx" ON "PickupRequest"("shopId", "status");

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
