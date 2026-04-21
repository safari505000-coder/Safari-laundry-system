-- V19.9 — Add CALL_CENTER_SUPERVISOR rank to SafariRole enum.
--
-- PostgreSQL requires `ALTER TYPE ... ADD VALUE` for extending an enum.
-- The IF NOT EXISTS clause makes the migration idempotent so re-running
-- it on an already-migrated DB is a no-op. The BEFORE clause places the
-- new value right after CALL_CENTER so Prisma Studio and enum-sorted
-- dropdowns list the two Call-Center ranks next to each other.
ALTER TYPE "SafariRole" ADD VALUE IF NOT EXISTS 'CALL_CENTER_SUPERVISOR' AFTER 'CALL_CENTER';
