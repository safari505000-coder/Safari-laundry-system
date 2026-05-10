# Runbook — Realtime / WebSocket outage

> When the realtime gateway disconnects subscribers and the UI
> stops updating live. Financial writes are NOT affected; only the
> push-to-UI is degraded.

## 1. Symptoms

- Discord channel shows `[FINANCIAL_REALTIME_GATEWAY] disconnect`
  spike.
- `realtime_subscribers_active` counter dropped sharply.
- Frontend users report "the dashboard is frozen" — but page reload
  shows fresh data.
- WebSocket / SSE connections returning 503.

## 2. Severity

**P3 — degradation, not outage.**

The financial core is unaffected. Snapshots refresh on every
write (idempotent). The UI just won't push updates until the
gateway is healthy. Users can manually refresh.

If the realtime gateway is down for > 30 min, escalate to P2 because
the operational dashboards (cash-monitor, executive dashboard) lose
their value.

## 3. Triage (≤ 5 min)

```bash
# 1. Realtime metrics
curl -sS "${BASE}/metrics" | rg "realtime_|ws_"

# 2. Gateway health
curl -sS "${BASE}/health/ready" | jq '.checks.realtime'

# 3. Active subscribers
curl -sS "${BASE}/api/admin/realtime/stats" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .

# 4. Server logs (last 100 lines, filter realtime)
kubectl -n production logs deploy/safari-erp --tail=200 | rg -i "realtime|websocket|sse"
```

## 4. Containment

### 4.A Single pod struggling

If only one pod is affected (sticky-session client falling off),
restart the pod:

```bash
kubectl -n production delete pod <pod-name>
```

The replica controller spawns a fresh pod. WebSocket clients
auto-reconnect (the gateway emits `reconnect_recommended` on
graceful shutdown).

### 4.B All pods struggling

Check the bus adapter:

```bash
# Is the in-memory adapter under pressure?
curl -sS "${BASE}/metrics" | rg "event_bus_|outbox_"

# If using Redis Streams adapter:
redis-cli -u "$REDIS_URL" PING
redis-cli -u "$REDIS_URL" XLEN "finance:events:stream"
```

If the bus adapter is the bottleneck (queue depth growing), the
system is overloaded. Scale workers OR temporarily downsample the
realtime broadcast (drop the SSE stream, keep WebSocket only).

### 4.C Reverse proxy / load balancer killing long-lived connections

Common when nginx / cloud LB has a lower idle timeout than the
heartbeat interval:

```nginx
# nginx.conf — required for SSE / WebSocket
proxy_http_version 1.1;
proxy_set_header   Upgrade $http_upgrade;
proxy_set_header   Connection "upgrade";
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

If the LB is the cause, no API change is needed; fix the LB
config and restart the LB.

## 5. Recovery

1. Confirm `realtime_subscribers_active` rebuilds to historical
   level (typical: ~50–500 connections at peak).
2. Confirm `[FINANCIAL_REALTIME_GATEWAY] disconnect` rate has
   fallen back to baseline.
3. Open the executive dashboard in a browser, watch a known
   in-flight transaction; confirm the UI updates without manual
   refresh within 1s.

## 6. Post-incident

- If the outage was caused by overload, add a load-shed alert at
  e.g. 80% of historical peak so the next incident triggers an
  earlier scale-up.
- If caused by the LB, document the timeout config in
  [`production-deployment.md`](./production-deployment.md).
- File a ticket on the realtime gateway team.

## 7. What you must never do

- ❌ Disable the realtime gateway "to stop the alerts" — operational
  dashboards lose visibility into cash + custody flows.
- ❌ Disable the snapshot listener. The listener is how snapshots
  stay fresh; disabling it makes the UI silently stale even after
  realtime is fixed.
- ❌ Bypass the bus to write directly to subscribers. The bus is
  the only audited path; direct writes break the outbox guarantee.

## 8. Related

- [`../event-map.md`](../event-map.md) §6 (realtime gateway).
- `src/domain-events/realtime/` — the gateway code.
- [`../../v20-9-enterprise-realtime-platform-final-report.md`](../../v20-9-enterprise-realtime-platform-final-report.md)
  — the V20.9 enterprise realtime platform design.
