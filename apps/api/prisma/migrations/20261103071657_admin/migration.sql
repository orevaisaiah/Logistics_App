-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'RIDER_CANCELLED';

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;
