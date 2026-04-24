-- V19.22 — Customer QR feedback (rating + note) captured from the public
-- `/r/:orderId` micro-page the invoice QR points at. One row per order,
-- cascade-deleted when the order itself is removed.
CREATE TABLE "OrderFeedback" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "submittedFrom" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" UUID,

    CONSTRAINT "OrderFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

-- Enforce one feedback row per order (customer may re-submit to update).
CREATE UNIQUE INDEX "OrderFeedback_orderId_key" ON "OrderFeedback"("orderId");

-- Dashboard queries: unread / low-rating / latest.
CREATE INDEX "OrderFeedback_rating_idx" ON "OrderFeedback"("rating");
CREATE INDEX "OrderFeedback_acknowledgedAt_idx" ON "OrderFeedback"("acknowledgedAt");
CREATE INDEX "OrderFeedback_submittedAt_idx" ON "OrderFeedback"("submittedAt");

ALTER TABLE "OrderFeedback"
    ADD CONSTRAINT "OrderFeedback_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
