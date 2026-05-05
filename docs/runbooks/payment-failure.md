# Runbook: Payment failures

## Symptoms
- Alert `HighPaymentFailureRate` or `PaymentSLOBurn`.
- Customers report paid orders stuck unpaid.
- `payments_finalize_failure_total` increasing in Prometheus.

## Metrics
- `rate(payments_finalize_failure_total[5m])`
- `slo_payment_success_ratio`, `slo_payment_error_budget_remaining_ratio`
- `payments_finalize_duration_ms` histogram
- Gateway logs / UPayments dashboard

## Commands
```bash
# Local / pod
curl -sS "${BASE}/metrics" | rg "payments_finalize_"
curl -sS "${BASE}/health/ready" | jq .

# Postgres — recent finalized orders sample (read-only)
psql "$DATABASE_URL" -c "SELECT id, status, \"walletSettledAt\", \"posGatewayTrackId\" FROM \"Order\" ORDER BY \"updatedAt\" DESC LIMIT 20;"
```

## Recovery
1. Confirm gateway status API returns CAPTURED for affected `track_id`.
2. Verify `DATABASE_URL`, `REDIS_URL`, worker pods healthy; check `/health/ready`.
3. Use existing admin/order tools to reconcile; **do not** replay payment jobs blindly.
4. If systemic: scale API pods; check Postgres connections and slow queries (`db_query_duration_ms`).
5. Page payments on-call; open incident with `payments_finalize_failure_total` graph.
