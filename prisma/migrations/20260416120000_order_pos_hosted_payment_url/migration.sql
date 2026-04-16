-- Persist hosted payment URL for call-center collections / WhatsApp reminders
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "posHostedPaymentUrl" TEXT;
