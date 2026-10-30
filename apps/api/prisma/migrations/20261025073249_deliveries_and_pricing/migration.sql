-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "searchStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAssignment_riderId_status_idx" ON "DeliveryAssignment"("riderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_status_expiresAt_idx" ON "DeliveryAssignment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAssignment_deliveryId_riderId_key" ON "DeliveryAssignment"("deliveryId", "riderId");

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
