# Safe deployment

## Graceful shutdown
- `enableShutdownHooks()` in `main.ts`.
- `HttpDrainService` closes the HTTP server **before** Nest tears down workers (module shutdown order).

## Blue / green
- Set `DEPLOYMENT_COLOR=blue|green` (or `DEPLOYMENT_SLOT`) per target group; LB shifts traffic after `/api/version` verification.

## Job loss
- BullMQ jobs persist in Redis; closing workers waits for in-flight work (best effort). Use `SIGTERM` (not `SIGKILL`) on rollout.

## Checklist
1. `curl /health/ready` green in canary.
2. Compare `/api/version` git SHA to CI artifact.
3. Shift traffic; watch `payments_finalize_failure_total` and queue gauges.
