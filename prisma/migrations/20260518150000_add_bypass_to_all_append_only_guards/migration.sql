-- Uniform bypass support for all append-only trigger guard functions.
--
-- Any guard function that lacked the `app.immutable_ledger_bypass` session-flag
-- check now gains it.  Setting `SET LOCAL "app.immutable_ledger_bypass" = 'true'`
-- inside a transaction (e.g. test cleanup) allows DELETE on every guarded table.
-- The setting is transaction-scoped (SET LOCAL) so it reverts automatically on
-- commit or rollback; production code never sets it.
--
-- Functions updated (CREATE OR REPLACE — no trigger DDL changes needed):
--   DebtLedgerEntry_append_only_guard
--   prevent_audit_logs_mutation
--   FraudAlert_append_only_guard        (UPDATE field-level check preserved)
--   PromiseEvent_append_only_guard
--   CollectionsStageEvent_append_only_guard
--   FinancialPeriodViolation_append_only_guard
--   FinancialEventOutbox_append_only_guard  (UPDATE field-level check preserved)
--   FinancialEventDelivery_append_only_guard

CREATE OR REPLACE FUNCTION "DebtLedgerEntry_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION
    'DebtLedgerEntry is append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'audit_logs is immutable';
END;
$$ LANGUAGE plpgsql;

-- FraudAlert: preserves UPDATE field-level immutability check.
CREATE OR REPLACE FUNCTION "FraudAlert_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'FraudAlert rows are append-only — % not allowed',
      TG_OP
      USING ERRCODE = '42809';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."type"        IS DISTINCT FROM OLD."type"
       OR NEW."customerId"  IS DISTINCT FROM OLD."customerId"
       OR NEW."actorId"     IS DISTINCT FROM OLD."actorId"
       OR NEW."payload"     IS DISTINCT FROM OLD."payload"
       OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
       OR NEW."detectedAt"  IS DISTINCT FROM OLD."detectedAt" THEN
      RAISE EXCEPTION
        'FraudAlert detection-time fields are immutable'
        USING ERRCODE = '42809';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "PromiseEvent_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION
    'PromiseEvent rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "CollectionsStageEvent_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION
    'CollectionsStageEvent rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "FinancialPeriodViolation_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION
    'FinancialPeriodViolation rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

-- FinancialEventOutbox: preserves UPDATE field-level immutability check.
CREATE OR REPLACE FUNCTION "FinancialEventOutbox_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id"            IS DISTINCT FROM OLD."id"
       OR NEW."eventId"       IS DISTINCT FROM OLD."eventId"
       OR NEW."eventName"     IS DISTINCT FROM OLD."eventName"
       OR NEW."customerId"    IS DISTINCT FROM OLD."customerId"
       OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
       OR NEW."occurredAt"    IS DISTINCT FROM OLD."occurredAt"
       OR NEW."publishedAt"   IS DISTINCT FROM OLD."publishedAt"
       OR NEW."payload"       IS DISTINCT FROM OLD."payload" THEN
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

CREATE OR REPLACE FUNCTION "FinancialEventDelivery_append_only_guard"()
RETURNS trigger AS $$
DECLARE bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION
    'FinancialEventDelivery rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;
