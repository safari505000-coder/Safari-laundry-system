ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS "actorId" UUID;

CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs("actorId");
