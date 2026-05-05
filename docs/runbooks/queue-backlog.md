# Runbook: Queue backlog

## Symptoms
- Alerts `QueueBacklogSpike`, `DiscordQueueBacklog`, `QueueDelaySLO`.
- `queue_jobs_waiting` high; Discord/WhatsApp delayed.

## Metrics
- `queue_jobs_waiting`, `queue_jobs_active`, `queue_jobs_failed`
- `slo_queue_delay_estimate_s`
- `redis_latency_ms`

## Commands
```bash
curl -sS "${BASE}/metrics" | rg "queue_jobs_|redis_latency|slo_queue"
curl -sS "${BASE}/health/ready" | jq .checks
redis-cli -u "$REDIS_URL" INFO memory
```

## Recovery
1. Scale worker processes / ensure `DiscordAlertWorker` and `WhatsAppWorker` running.
2. If `circuit_state > 0`, check external webhooks (Discord/WhatsApp) — see integration runbooks.
3. Drain DLQ via authenticated admin replay endpoints (rate-limited); verify idempotent jobIds.
4. Temporarily raise concurrency only after confirming downstream capacity.
