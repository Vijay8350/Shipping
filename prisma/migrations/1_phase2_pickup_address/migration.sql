-- AlterTable (Order: mirror the street address lines needed to ship)
ALTER TABLE "Order" ADD COLUMN "shippingAddress1" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingAddress2" TEXT;

-- CreateTable
CREATE TABLE "PickupAddress" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupAddress_shopId_idx" ON "PickupAddress"("shopId");

-- AddForeignKey
ALTER TABLE "PickupAddress" ADD CONSTRAINT "PickupAddress_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
