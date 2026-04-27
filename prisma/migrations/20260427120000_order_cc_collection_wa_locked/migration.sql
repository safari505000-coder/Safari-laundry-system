-- Lock CC duplicate WhatsApp when field (driver/manager) already notified customer with payment link.
ALTER TABLE "Order" ADD COLUMN "ccCollectionPaymentWaLocked" BOOLEAN NOT NULL DEFAULT false;
