-- CreateTable
CREATE TABLE "StorefrontSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT '#1a73e8',
    "customCss" TEXT,
    "dateFormat" TEXT NOT NULL DEFAULT 'DD MMM YYYY',
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eddEnabled" BOOLEAN NOT NULL DEFAULT true,
    "returnsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eddMinDays" INTEGER NOT NULL DEFAULT 2,
    "eddMaxDays" INTEGER NOT NULL DEFAULT 7,
    "supportEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontSettings_shopId_key" ON "StorefrontSettings"("shopId");

-- AddForeignKey
ALTER TABLE "StorefrontSettings" ADD CONSTRAINT "StorefrontSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
