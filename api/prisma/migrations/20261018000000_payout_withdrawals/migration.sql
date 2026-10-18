-- AlterEnum
ALTER TYPE "withdrawal_status" ADD VALUE 'processing';

-- AlterTable
ALTER TABLE "seller_profiles" ADD COLUMN     "bank_bin" VARCHAR(20);

