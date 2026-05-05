# Multi-region readiness

## Flags
- `REGION=primary|secondary` — exposed on `/api/version` and `/health/ready`.
- `DEPLOYMENT_COLOR` / `DEPLOYMENT_SLOT` — blue/green routing hints for L7 LB.

## PostgreSQL
- **Primary:** read-write. **Secondary region:** read replica (streaming); avoid dual-writer.
- Application: point `DATABASE_URL` to local region endpoint (replica for read-only future routes).

## Redis
- **Preferred:** managed Redis cluster / Global Datastore with single active append stream for BullMQ, or **one active region** for workers.
- BullMQ uses Redis locks — multiple regions can run workers against **one** Redis; avoid split-brain by **not** running duplicate clusters without sync.

## Workers
- Safe horizontally in one Redis namespace; duplicate processing prevented by deterministic `jobId` + idempotent handlers.
