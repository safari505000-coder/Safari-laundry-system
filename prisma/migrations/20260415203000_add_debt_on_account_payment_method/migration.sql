-- Add explicit debt capture option for POS checkout settlement classification.
ALTER TYPE "PosPaymentMethod" ADD VALUE IF NOT EXISTS 'DEBT_ON_ACCOUNT';
