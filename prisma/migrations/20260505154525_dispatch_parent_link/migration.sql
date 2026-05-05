-- V19.x — Dispatch escalation / reassignment self-link.
--
-- Purely ADDITIVE. Touches only the Dispatch table:
--   * NEW col   : Dispatch.parentDispatchId  (nullable, self-FK SET NULL)
--   * NEW idx   : Dispatch.parentDispatchId
--   * NEW FK    : Dispatch.parentDispatchId → Dispatch.id
--
-- Idempotency for the escalation cron is enforced by the presence of
-- ANY child row pointing at the parent (`children: { none: {} }`
-- predicate at the application layer) — no schema-level UNIQUE here
-- because a single parent CAN, by design, fan out to multiple
-- successor dispatches over time (e.g. agent reassigns a successor
-- again).

-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN "parentDispatchId" UUID;

-- CreateIndex
CREATE INDEX "Dispatch_parentDispatchId_idx" ON "Dispatch"("parentDispatchId");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_parentDispatchId_fkey"
  FOREIGN KEY ("parentDispatchId") REFERENCES "Dispatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
