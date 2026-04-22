-- V19.11.5 — enforce append-only semantics on DebtLedgerEntry at the DB layer.
--
-- The Nest-side Proxy guard had to be removed because it fought Prisma 7's
-- driver-adapter batching (see src/prisma/prisma.service.ts). This trigger
-- is now the single line of defence: UPDATE/DELETE/TRUNCATE on the ledger
-- raise an exception regardless of how the query was issued.

CREATE OR REPLACE FUNCTION "DebtLedgerEntry_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'DebtLedgerEntry is append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "DebtLedgerEntry_no_update" ON "DebtLedgerEntry";
CREATE TRIGGER "DebtLedgerEntry_no_update"
BEFORE UPDATE ON "DebtLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "DebtLedgerEntry_append_only_guard"();

DROP TRIGGER IF EXISTS "DebtLedgerEntry_no_delete" ON "DebtLedgerEntry";
CREATE TRIGGER "DebtLedgerEntry_no_delete"
BEFORE DELETE ON "DebtLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "DebtLedgerEntry_append_only_guard"();

DROP TRIGGER IF EXISTS "DebtLedgerEntry_no_truncate" ON "DebtLedgerEntry";
CREATE TRIGGER "DebtLedgerEntry_no_truncate"
BEFORE TRUNCATE ON "DebtLedgerEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "DebtLedgerEntry_append_only_guard"();
