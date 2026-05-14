-- V25: add missing database indexes
-- CommissionPayout: faster lookup by sourceJournalEntryId
CREATE INDEX IF NOT EXISTS "CommissionPayout_sourceJournalEntryId_idx" ON "CommissionPayout"("sourceJournalEntryId");
-- Customer: fast filter for blocked customers
CREATE INDEX IF NOT EXISTS "Customer_isBlocked_idx" ON "Customer"("isBlocked");
-- User: fast lookup for customer-portal users by linked customer
CREATE INDEX IF NOT EXISTS "User_linkedCustomerId_idx" ON "User"("linkedCustomerId");
-- AuditLog: actor activity timeline queries
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_action_timestamp_idx" ON "audit_logs"("actorId", "action", "timestamp");
