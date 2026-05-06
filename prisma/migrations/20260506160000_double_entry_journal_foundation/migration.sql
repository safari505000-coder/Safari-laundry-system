-- Progressive double-entry accounting foundation.
-- Coexists with DebtLedgerEntry; no existing reads are changed.

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

CREATE TABLE "Account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL,
  "customerId" UUID,
  "orderId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "meta" JSONB,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE INDEX "Account_type_isActive_idx" ON "Account"("type", "isActive");

CREATE UNIQUE INDEX "JournalEntry_sourceRef_key" ON "JournalEntry"("sourceRef");
CREATE INDEX "JournalEntry_source_createdAt_idx" ON "JournalEntry"("source", "createdAt");
CREATE INDEX "JournalEntry_actorUserId_createdAt_idx" ON "JournalEntry"("actorUserId", "createdAt");
CREATE INDEX "JournalEntry_customerId_createdAt_idx" ON "JournalEntry"("customerId", "createdAt");
CREATE INDEX "JournalEntry_orderId_idx" ON "JournalEntry"("orderId");

CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Account" ("code", "name", "type")
VALUES
  ('1100', 'CASH', 'ASSET'),
  ('1200', 'BANK_KNET', 'ASSET'),
  ('1210', 'BANK_ONLINE', 'ASSET'),
  ('1300', 'ACCOUNTS_RECEIVABLE', 'ASSET'),
  ('4100', 'REVENUE', 'REVENUE'),
  ('5100', 'ADJUSTMENTS', 'EXPENSE')
ON CONFLICT ("code") DO NOTHING;

CREATE OR REPLACE FUNCTION "Journal_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Journal entries and lines are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "JournalEntry_no_update" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_update"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "Journal_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalEntry_no_delete" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_delete"
BEFORE DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "Journal_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalEntry_no_truncate" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_truncate"
BEFORE TRUNCATE ON "JournalEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "Journal_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalLine_no_update" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_update"
BEFORE UPDATE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "Journal_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalLine_no_delete" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_delete"
BEFORE DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "Journal_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalLine_no_truncate" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_truncate"
BEFORE TRUNCATE ON "JournalLine"
FOR EACH STATEMENT EXECUTE FUNCTION "Journal_append_only_guard"();
