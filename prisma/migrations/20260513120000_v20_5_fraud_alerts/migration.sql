-- V20.5 — Phase 8 Fraud Detection.
--
-- Append-only alert table populated by FraudDetectionService.
-- Each detector emits one FraudAlert row per detected anomaly.
-- Operators (Owner / GM / Accountant) review and resolve alerts;
-- the resolution write goes to a sibling row, never an UPDATE on
-- the original alert (preserves forensic integrity).
--
-- The DB-level append-only trigger blocks UPDATE/DELETE/TRUNCATE
-- on the main table; the resolution table has its own
-- single-update path enforced in the application layer.

CREATE TYPE "FraudAlertSeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE "FraudAlertStatus" AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'RESOLVED_FALSE_POSITIVE',
  'RESOLVED_CONFIRMED'
);

CREATE TABLE "FraudAlert" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "severity" "FraudAlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
  "customerId" UUID,
  "actorId" UUID,
  "payload" JSONB,
  "fingerprint" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "resolutionNotes" TEXT,
  CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- `fingerprint` is a deterministic hash of the alert dimensions
-- (type + customerId + window key). The unique index makes the
-- detector idempotent — re-running the same detection window
-- never duplicates rows.
CREATE UNIQUE INDEX "FraudAlert_fingerprint_key"
  ON "FraudAlert"("fingerprint");
CREATE INDEX "FraudAlert_status_severity_idx"
  ON "FraudAlert"("status", "severity");
CREATE INDEX "FraudAlert_customerId_detectedAt_idx"
  ON "FraudAlert"("customerId", "detectedAt");
CREATE INDEX "FraudAlert_type_detectedAt_idx"
  ON "FraudAlert"("type", "detectedAt");

ALTER TABLE "FraudAlert"
  ADD CONSTRAINT "FraudAlert_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FraudAlert"
  ADD CONSTRAINT "FraudAlert_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FraudAlert"
  ADD CONSTRAINT "FraudAlert_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only on the core dimensions. The single allowed
-- mutation is `status` / `resolvedAt` / `resolvedById` /
-- `resolutionNotes` written from the application — the DB
-- trigger blocks any UPDATE that would touch the
-- detection-time fields (type, severity initial, customerId,
-- payload, fingerprint, detectedAt, actorId).
CREATE OR REPLACE FUNCTION "FraudAlert_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'FraudAlert rows are append-only — % not allowed',
      TG_OP
      USING ERRCODE = '42809';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
       OR NEW."actorId" IS DISTINCT FROM OLD."actorId"
       OR NEW."payload" IS DISTINCT FROM OLD."payload"
       OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
       OR NEW."detectedAt" IS DISTINCT FROM OLD."detectedAt" THEN
      RAISE EXCEPTION
        'FraudAlert detection-time fields are immutable'
        USING ERRCODE = '42809';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FraudAlert_no_mutation" ON "FraudAlert";
CREATE TRIGGER "FraudAlert_no_mutation"
BEFORE UPDATE OR DELETE ON "FraudAlert"
FOR EACH ROW EXECUTE FUNCTION "FraudAlert_append_only_guard"();

DROP TRIGGER IF EXISTS "FraudAlert_no_truncate" ON "FraudAlert";
CREATE TRIGGER "FraudAlert_no_truncate"
BEFORE TRUNCATE ON "FraudAlert"
FOR EACH STATEMENT EXECUTE FUNCTION "FraudAlert_append_only_guard"();
