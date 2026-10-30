-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('BUSINESS', 'RIDER', 'PLATFORM', 'ESCROW');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('TOPUP', 'DELIVERY_CHARGE', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'REFUND', 'RIDER_EARNING', 'COMMISSION', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "chargedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "ownerType" "WalletOwnerType" NOT NULL,
    "businessId" UUID,
    "riderId" UUID,
    "systemKey" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "EntryType" NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "deliveryId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "rejectionReason" TEXT,
    "bankReference" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_businessId_key" ON "Wallet"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_riderId_key" ON "Wallet"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_systemKey_key" ON "Wallet"("systemKey");

-- CreateIndex
CREATE INDEX "Wallet_ownerType_idx" ON "Wallet"("ownerType");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_reference_key" ON "WalletEntry"("reference");

-- CreateIndex
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletEntry_deliveryId_idx" ON "WalletEntry"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_businessId_createdAt_idx" ON "Payment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_requestedAt_idx" ON "PayoutRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_riderId_requestedAt_idx" ON "PayoutRequest"("riderId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
