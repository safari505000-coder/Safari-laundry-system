-- V19.0: add GENERAL_MANAGER tier to SafariRole enum.
-- Postgres-safe: idempotent ALTER TYPE ... ADD VALUE IF NOT EXISTS.
ALTER TYPE "SafariRole" ADD VALUE IF NOT EXISTS 'GENERAL_MANAGER';
