# Runbook: Redis down / degraded

## Symptoms
- `/health/ready` returns 503; `checks.redis` or `checks.queue` false.
- BullMQ workers idle; alerts on Redis latency or connection errors.

## Metrics
- `redis_latency_ms`
- `up` for Redis exporter (if deployed)

## Commands
```bash
curl -sS "${BASE}/health/ready" | jq .
redis-cli -u "$REDIS_URL" PING
# ElastiCache / managed: check provider console — failover, CPU, evictions
```

## Recovery
1. Failover to replica / promote read replica per vendor runbook.
2. Restart API/workers after Redis stable (BullMQ reconnects).
3. Verify no duplicate side effects: jobs use deterministic `jobId` (see `docs/operations/replay-safety.md`).
4. If AOF/RDB restore required, restore snapshot then restart consumers.
