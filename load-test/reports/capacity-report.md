# Safari-ERP — Load test capacity report

_Generated 2026-04-22T03:55:11.939Z_

**Environment**
- Backend: local Node (port 3001) against local Postgres 17 (`safari_loadtest`)
- Seed: 1 branch · 1 manager · 1000 drivers · 200 customers · 41 laundry price-list rows
- Payments: `PAYMENTS_MOCK=true` (devMock callback is HMAC-bypassed)
- Working-hours gate: bypassed via `AUTH_BYPASS_WORKING_HOURS=1`

### Capacity verdict

- **Concurrent drivers scenario (50 → 1000)**: p95 = **9,048 ms**, 5xx = **1706**
- **Invoice throughput scenario (100 → 2000 / min)**: p95 = **16 ms**, 5xx = **0**

- WARN: drivers scenario exceeded the 200ms p95 target at peak — see per-endpoint breakdown.
- PASS: no 5xx errors during the 2000/min invoice run.

### Stage A — Concurrent drivers (50 → 1000)

- Requests sent: **37,656** (responses: 37,656)
- Wall-clock duration: **204.5s** — throughput **184.2 req/s**
- Response time p50/p95/p99: **2,466 / 9,048 / 9,801 ms**
- Max RT: **10,036 ms**

**HTTP status breakdown**
  - HTTP 201: **23398**
  - HTTP 200: **12552**
  - HTTP 500: **1706**

**Errors**
  _none_

**Per-endpoint latency (p50 / p95 / p99 ms)**

  | Endpoint | count | p50 | p95 | p99 |
  |---|---:|---:|---:|---:|
  | POST /api/auth/login (driver) | 12,552 | 4,867 | 9,417 | 9,999 |
  | GET /api/orders/driver/pending-invoices | 12,552 | 2,231 | 3,985 | 4,065 |
  | POST /api/orders/quick | 12,552 | 2,417 | 4,065 | 4,317 |

### Stage B — Invoice throughput (100 → 2000 / min)

- Requests sent: **11,160** (responses: 11,160)
- Wall-clock duration: **240.4s** — throughput **46.4 req/s**
- Response time p50/p95/p99: **9 / 16 / 21 ms**
- Max RT: **144 ms**

**HTTP status breakdown**
  - HTTP 201: **7440**
  - HTTP 200: **3720**

**Errors**
  _none_

**Per-endpoint latency (p50 / p95 / p99 ms)**

  | Endpoint | count | p50 | p95 | p99 |
  |---|---:|---:|---:|---:|
  | POST /api/auth/login (driver) | 3,720 | 8 | 12 | 17 |
  | POST /api/orders/quick (invoice) | 3,720 | 8 | 15 | 20 |
  | POST /api/payments/callback (KNET) | 3,720 | 10 | 18 | 23 |

### Postgres monitor

- Samples: **231** (every 2s)
- Peak active PG connections: **11**
- DebtLedgerEntry rows grew from **7,474** → **11,194**
- Final DB size: **62.0 MiB**

### Reconciliation — ledger consistency between reports

  - **smoke-test**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **baseline**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-a**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-b**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **baseline**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-a**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-b**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **baseline**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-a**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD
  - **after-stage-b**: MATCH — issuer=0.000 · unpaid=0.000 · collections=0.000 · Δ=0.0000 KWD

---

Raw artefacts:
- `load-test/reports/stage-a.json` / `stage-b.json` — Artillery aggregate
- `load-test/reports/db-monitor.jsonl` — per-sample DB stats
- `load-test/reports/reconciliation.jsonl` — Σ-check records
