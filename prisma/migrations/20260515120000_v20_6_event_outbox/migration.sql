-- V20.6 — Phase 4: Financial Event Outbox + Idempotent Consumer Log.
--
-- Two NEW tables, append-only (DB triggers below). Both are
-- additive — no existing column / index / FK / row is touched.
--
-- FinancialEventOutbox:
--   • One row per published financial domain event.
--   • `eventId` is a deterministic hash of (name, customerId,
--     correlationId, occurredAtIsoSec) computed by the publisher;
--     UNIQUE so a re-publish under the same business cause
--     short-circuits (idempotency at the publisher boundary).
--   • Outbox is the migration seam to Kafka/NATS — a future
--     dispatcher job can `findMany WHERE deliveredAt IS NULL`
--     and ship rows to the external bus, marking them delivered
--     when the broker acks.
--
-- FinancialEventDelivery:
--   • One row per (eventId, consumerName) processed.
--   • Composite UNIQUE on (eventId, consumerName) — replay-safe
--     consumers `ON CONFLICT DO NOTHING` to skip already-processed
--     events.

-- ---------- FinancialEventOutbox ----------
CREATE TABLE IF NOT EXISTS "FinancialEventOutbox" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId"        TEXT NOT NULL UNIQUE,
  "eventName"      TEXT NOT NULL,
  "customerId"     UUID,
  "correlationId"  TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL,
  "publishedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt"    TIMESTAMP(3),
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "lastError"      TEXT,
  "payload"        JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS "FinancialEventOutbox_customerId_publishedAt_idx"
  ON "FinancialEventOutbox" ("customerId", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "FinancialEventOutbox_eventName_publishedAt_idx"
  ON "FinancialEventOutbox" ("eventName", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "FinancialEventOutbox_undelivered_idx"
  ON "FinancialEventOutbox" ("publishedAt") WHERE "deliveredAt" IS NULL;

-- Append-only: only `attempts`, `deliveredAt`, `lastError` may change.
CREATE OR REPLACE FUNCTION "FinancialEventOutbox_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."eventId" IS DISTINCT FROM OLD."eventId"
       OR NEW."eventName" IS DISTINCT FROM OLD."eventName"
       OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
       OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
       OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
       OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
       OR NEW."payload" IS DISTINCT FROM OLD."payload" THEN
      RAISE EXCEPTION
        'FinancialEventOutbox detection-time fields are append-only — only attempts / deliveredAt / lastError may change'
        USING ERRCODE = '42809';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'FinancialEventOutbox rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FinancialEventOutbox_no_update" ON "FinancialEventOutbox";
CREATE TRIGGER "FinancialEventOutbox_no_update"
BEFORE UPDATE ON "FinancialEventOutbox"
FOR EACH ROW EXECUTE FUNCTION "FinancialEventOutbox_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialEventOutbox_no_delete" ON "FinancialEventOutbox";
CREATE TRIGGER "FinancialEventOutbox_no_delete"
BEFORE DELETE ON "FinancialEventOutbox"
FOR EACH ROW EXECUTE FUNCTION "FinancialEventOutbox_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialEventOutbox_no_truncate" ON "FinancialEventOutbox";
CREATE TRIGGER "FinancialEventOutbox_no_truncate"
BEFORE TRUNCATE ON "FinancialEventOutbox"
FOR EACH STATEMENT EXECUTE FUNCTION "FinancialEventOutbox_append_only_guard"();


-- ---------- FinancialEventDelivery ----------
CREATE TABLE IF NOT EXISTS "FinancialEventDelivery" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId"        TEXT NOT NULL,
  "consumerName"   TEXT NOT NULL,
  "processedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"         TEXT NOT NULL DEFAULT 'OK',
  "errorMessage"   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialEventDelivery_event_consumer_uq"
  ON "FinancialEventDelivery" ("eventId", "consumerName");
CREATE INDEX IF NOT EXISTS "FinancialEventDelivery_consumer_processedAt_idx"
  ON "FinancialEventDelivery" ("consumerName", "processedAt" DESC);

CREATE OR REPLACE FUNCTION "FinancialEventDelivery_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'FinancialEventDelivery rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FinancialEventDelivery_no_update" ON "FinancialEventDelivery";
CREATE TRIGGER "FinancialEventDelivery_no_update"
BEFORE UPDATE ON "FinancialEventDelivery"
FOR EACH ROW EXECUTE FUNCTION "FinancialEventDelivery_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialEventDelivery_no_delete" ON "FinancialEventDelivery";
CREATE TRIGGER "FinancialEventDelivery_no_delete"
BEFORE DELETE ON "FinancialEventDelivery"
FOR EACH ROW EXECUTE FUNCTION "FinancialEventDelivery_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialEventDelivery_no_truncate" ON "FinancialEventDelivery";
CREATE TRIGGER "FinancialEventDelivery_no_truncate"
BEFORE TRUNCATE ON "FinancialEventDelivery"
FOR EACH STATEMENT EXECUTE FUNCTION "FinancialEventDelivery_append_only_guard"();
