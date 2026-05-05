DO $$
BEGIN
  IF to_regclass('"AuditLog"') IS NOT NULL AND to_regclass('audit_logs') IS NULL THEN
    ALTER TABLE "AuditLog" RENAME TO audit_logs;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditStatus') THEN
    CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'DENIED');
  END IF;
END $$;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS status "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS suspicious BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS audit_logs_userId_timestamp_idx
  ON audit_logs("userId", timestamp);

CREATE INDEX IF NOT EXISTS audit_logs_ip_timestamp_idx
  ON audit_logs(ip, timestamp);

CREATE INDEX IF NOT EXISTS audit_logs_status_timestamp_idx
  ON audit_logs(status, timestamp);
