# System Health Dashboard & Owner Command Center

Two read-only Owner endpoints introduced in V10. Both live in
`src/owner-command-center/` and reuse existing infrastructure
(`ReadinessService`, `PrismaService`) — they never write or recompute any
financial value.

## `GET /api/owner/system-health`

Role: `OWNER`. Unified infrastructure + runtime health.

```jsonc
{
  "ok": true,
  "generatedAt": "2026-06-01T16:00:00.000Z",
  "region": "kw",
  "deploymentColor": "blue",
  "uptimeSeconds": 38211,
  "database": { "status": "UP" },
  "redis": { "status": "UP" },
  "queue": { "status": "UP", "name": "discord-alerts", "counts": { "waiting": 0, "active": 0, "failed": 0 } },
  "failedJobs": 0,
  "apiErrorRate": { "windowMinutes": 15, "total": 420, "denied": 2, "deniedRatePct": 0.48 },
  "activeUsers": 7,
  "activeSessions": 9,
  "disk": { "available": true, "totalBytes": 0, "freeBytes": 0, "usedPct": 0 },
  "memory": { "processRssBytes": 0, "heapUsedBytes": 0, "systemTotalBytes": 0, "systemFreeBytes": 0, "systemUsedPct": 0 },
  "alerts": []
}
```

| Field          | Source                                                        |
| -------------- | ------------------------------------------------------------- |
| database/redis/queue | `ReadinessService.check()` (`SELECT 1`, Redis `PING`, BullMQ) |
| failedJobs / queue.counts | BullMQ `getJobCounts` on the alert queue            |
| apiErrorRate   | `audit_logs` denied vs total over 15 min                      |
| activeUsers    | distinct `audit_logs` actors (15 min)                         |
| activeSessions | active `UserSession` rows                                     |
| disk           | `fs.statfs(process.cwd())`                                    |
| memory         | `process.memoryUsage()` + `os.totalmem/freemem`               |

> The error rate is an auth/authorization proxy (denied responses captured by
> the audit layer), not a full HTTP 5xx rate. Pair with Sentry/Prometheus for
> exception-level monitoring.

## `GET /api/owner/command-center`

Role: `OWNER`. Executive snapshot in one page.

```jsonc
{
  "generatedAt": "2026-06-01T16:00:00.000Z",
  "currency": "KWD",
  "dailyRevenue": { "kd": 1234.5, "orders": 37 },
  "outstandingDebts": { "kd": 8800.0, "customers": 142 },
  "driverCustody": { "outstandingKd": 320.0, "byStatus": [ { "status": "PENDING_DEPOSIT", "kd": 320, "count": 4 } ] },
  "pendingDeposits": { "pendingKd": 600.0, "pendingCount": 6, "byStatus": [] },
  "payrollDue": { "pendingCount": 18, "pendingBasicKd": 5400.0, "byStatus": [] },
  "failedPayments": { "last24h": 1 },
  "securityAlerts": { "suspicious24h": 0, "denied24h": 3, "recent": [] },
  "systemAlerts": { "ok": true, "alerts": [], "database": "UP", "redis": "UP", "queue": "UP", "failedJobs": 0 }
}
```

| Card             | Source (read-only)                                          |
| ---------------- | ----------------------------------------------------------- |
| Daily Revenue    | `Order` where `status=COMPLETED` and `completedAt >= today`  |
| Outstanding Debts| `FinancialSnapshot.remainingDebtKd > 0` (UI read-model)      |
| Driver Custody   | `ManagerCashCustody` grouped by status (open = not VERIFIED/REJECTED) |
| Pending Deposits | `BankDepositLog` status = PENDING                           |
| Payroll Due      | `Payroll` status = PENDING                                  |
| Failed Payments  | `JournalFailureLog` last 24h                                |
| Security Alerts  | `audit_logs` suspicious / DENIED last 24h                   |
| System Alerts    | roll-up of `GET /owner/system-health`                       |

## Why read-only is safe

Both endpoints only call `count` / `aggregate` / `groupBy` / `findMany`. There
are no transactions, no journal writes, and no mutations — so they cannot affect
double-entry accounting or any ledger invariant.
