-- SystemConfig — operational-only single-row platform config. Stores
-- non-financial settings the Owner edits from the Settings UI
-- (e.g. WhatsApp alert recipient for the System Guardian). The
-- single canonical row is keyed at id = 'GLOBAL'. NEVER touches
-- financial state.

CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "id"            TEXT PRIMARY KEY,
  "guardianPhone" TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the single GLOBAL row so subsequent updates can be UPSERT-style
-- without juggling INSERT vs UPDATE in application code. We do NOT
-- seed a phone number here — admins must opt in from the UI (or via
-- the env fallback) before any WhatsApp alert is sent.
INSERT INTO "SystemConfig" ("id", "guardianPhone", "updatedAt")
VALUES ('GLOBAL', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
