# Safari ERP — Observability & Maintenance (Stage-G)

This document explains the three operational pillars of Safari ERP:
**uptime monitoring**, **error reporting (Sentry)**, and **health
checks**. Together they answer two questions at 3 AM:

- _"Is the system up?"_
- _"If not, what broke?"_

---

## 1. Health endpoint

`GET /api/health` is public (no JWT) and returns a Terminus-standard
envelope:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  },
  "error": {},
  "details": { ... }
}
```

Returns HTTP `503` if the DB ping fails or memory thresholds are
exceeded. Thresholds are tunable via env:

| Variable                | Default | Purpose                    |
| ----------------------- | ------- | -------------------------- |
| `HEALTH_HEAP_LIMIT_MB`  | `300`   | Max allowed V8 heap (MB)   |
| `HEALTH_RSS_LIMIT_MB`   | `500`   | Max allowed RSS (MB)       |

---

## 2. Uptime monitoring (external)

Point **any** HTTP uptime service at `https://<prod-host>/api/health`.
Recommended providers (any of them will work):

- **UptimeRobot** — free tier is enough for the daily cadence.
- **BetterStack (Better Uptime)** — nicer incident UX, free for small
  teams.
- **Pingdom** — if you are already on Atlassian.

### Minimum configuration

| Field            | Value                                 |
| ---------------- | ------------------------------------- |
| Check type       | HTTPS GET                             |
| URL              | `https://<prod-host>/api/health`      |
| Interval         | 1 minute                              |
| Timeout          | 10 seconds                            |
| Expected status  | `200`                                 |
| Expected body    | `"status":"ok"`                       |
| Alert channels   | SMS **and** email for on-call engineer |

### Escalation

1. 2 consecutive failures → SMS primary on-call.
2. 5 consecutive failures (≈ 5 min) → SMS secondary + email management.
3. Auto-resolve notification when `status=ok` returns.

---

## 3. Error reporting — Sentry

The backend and the SPA both report unhandled errors to Sentry when
their DSN envs are set.

### Required environment variables

| Variable                       | Required | Notes                                      |
| ------------------------------ | -------- | ------------------------------------------ |
| `SENTRY_DSN`                   | Backend  | Server-side DSN. Absence ⇒ Sentry disabled.|
| `VITE_SENTRY_DSN`              | Frontend | Baked in at build time.                    |
| `SENTRY_RELEASE`               | Both     | Git SHA or semver. Enables source-map tie. |
| `SENTRY_TRACES_SAMPLE_RATE`    | Backend  | Defaults to `0.1`.                         |

### What is captured

- **Backend**: every non-HTTP exception caught by the
  `GlobalExceptionFilter`. Intentional HTTP errors (validation, 404)
  are suppressed so the Sentry inbox stays actionable.
- **Frontend**: React error boundary + `window.onerror` + unhandled
  promise rejections (default Sentry/React integration in
  `web/src/main.tsx`).

### What is NOT captured

- DB connection strings, JWT tokens, or any request body over 1kB.
  Sentry's default scrubbing is on; if you add custom breadcrumbs,
  keep secrets out.

---

## 4. Migration drift guard

Every CI run must execute:

```bash
npm run db:check-drift
```

This compares the applied migrations directory to the current
`schema.prisma`. Exit code `2` means a developer changed the schema
without creating a migration — block the merge until they run
`npx prisma migrate dev --name <short-desc>`.

See [`BACKUP.md`](./BACKUP.md) §5 for the rationale.

---

## 5. Backup & restore

See the full runbook: [`BACKUP.md`](./BACKUP.md). Summary:

- Daily `pg_dump -Fc` at 03:00 Kuwait via `scripts/pg-backup.sh`.
- SHA-256 checksum per dump; `pg_restore --list` sanity check.
- 14-day rolling retention on hot storage; weekly off-site copy.
- Monthly full restore to a throwaway DB to prove the chain works.
