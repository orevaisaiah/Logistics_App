-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SEARCHING_RIDER', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'RIDER', 'BUSINESS', 'ADMIN');

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "baseFee" INTEGER NOT NULL,
    "perKmFee" INTEGER NOT NULL,
    "perKgFee" INTEGER NOT NULL DEFAULT 0,
    "includedWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxWeightKg" DOUBLE PRECISION NOT NULL,
    "minFee" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "businessId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupContactName" TEXT NOT NULL,
    "pickupContactPhone" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "packageDescription" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "declaredValue" INTEGER,
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SEARCHING_RIDER',
    "vehicleType" "VehicleType" NOT NULL,
    "zoneId" UUID NOT NULL,
    "riderId" UUID,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "price" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "riderPayoutAmount" INTEGER NOT NULL,
    "deliveryOtpHash" TEXT,
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RateCard_zoneId_vehicleType_key" ON "RateCard"("zoneId", "vehicleType");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_trackingCode_key" ON "Delivery"("trackingCode");

-- CreateIndex
CREATE INDEX "Delivery_businessId_status_idx" ON "Delivery"("businessId", "status");

-- CreateIndex
CREATE INDEX "Delivery_riderId_status_idx" ON "Delivery"("riderId", "status");

-- CreateIndex
CREATE INDEX "Delivery_status_createdAt_idx" ON "Delivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryId_createdAt_idx" ON "DeliveryEvent"("deliveryId", "createdAt");

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
