-- AlterEnum: subscription early cancellation journal line
ALTER TYPE "LedgerTransactionType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELLATION';
