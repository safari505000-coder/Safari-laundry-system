# V10 Hardening — Pull Request Summary

Additive security, observability, and resilience hardening for Safari ERP.
**No existing API was changed and no accounting behavior was modified.** Every
new capability is read-only or stored in brand-new, standalone tables.

---

## 1. System Health Dashboard

A single Owner endpoint that unifies infrastructure + runtime health.

- **Endpoint:** `GET /api/owner/system-health` (role: `OWNER`)
- **Module:** `src/owner-command-center/`
- Returns:
  - **Database status** — `ReadinessService` `SELECT 1` probe
  - **Redis status** — Redis `PING`
  - **Queue status** + **failed jobs** — BullMQ job counts (`waiting/active/completed/failed/delayed/paused`)
  - **API error rate** — denied/total ratio from `audit_logs` over the last 15 min
  - **Active users** — distinct `audit_logs` actors (15 min) + active `UserSession` count
  - **Disk usage** — `fs.statfs` of the working volume
  - **Memory usage** — process RSS/heap + system total/free/used %
  - **alerts[]** — `DATABASE_DOWN`, `REDIS_DOWN`, `QUEUE_DOWN`, `QUEUE_FAILED_JOBS:n`

## 2. Owner Command Center

One executive page aggregating the numbers an owner watches daily (read-only).

- **Endpoint:** `GET /api/owner/command-center` (role: `OWNER`)
- Returns: **Daily Revenue** (completed orders today), **Outstanding Debts**
  (`FinancialSnapshot.remainingDebtKd`), **Driver Custody** (open
  `ManagerCashCustody` by status), **Pending Deposits** (`BankDepositLog`
  PENDING), **Payroll Due** (`Payroll` PENDING), **Failed Payments**
  (`JournalFailureLog` 24h), **Security Alerts** (suspicious/denied audit logs),
  **System Alerts** (health roll-up).
- Pure aggregation over existing tables — **does not write or recompute any
  ledger value.**

## 3. Security Hardening — MFA / Sessions / Devices / Login History

- **Module:** `src/account-security/`
- **MFA (TOTP, RFC 6238)** implemented with Node `crypto` only — **no new
  dependency.** Targeted at `OWNER` and `ACCOUNTANT`.
- **Endpoints** (`@Controller('owner/security')`, roles `OWNER`, `ACCOUNTANT`):

  | Method & path                              | Purpose                          |
  | ------------------------------------------ | -------------------------------- |
  | `POST /api/owner/security/mfa/enroll`      | Start TOTP enrollment (secret + otpauth URI) |
  | `POST /api/owner/security/mfa/activate`    | Confirm code → ACTIVE + recovery codes |
  | `POST /api/owner/security/mfa/disable`     | Disable after re-verifying       |
  | `GET  /api/owner/security/mfa/status`      | Status + recovery codes remaining |
  | `GET  /api/owner/security/sessions`        | List active sessions             |
  | `DELETE /api/owner/security/sessions/:id`  | Forced logout (single session)   |
  | `POST /api/owner/security/sessions/revoke-all` | Forced logout (all)          |
  | `GET  /api/owner/security/login-history`   | Recent logins (success/failure)  |
  | `GET  /api/owner/security/devices`         | Known devices                    |
  | `POST /api/owner/security/devices/trust`   | Trust a device                   |
  | `POST /api/owner/security/devices/untrust` | Untrust a device                 |

- **Login capture:** `AuthService` emits a guarded, fire-and-forget
  `auth.login.succeeded` event; `AccountSecurityLoginListener` records login
  history + device + session asynchronously. The emit is wrapped in try/catch
  and the listener swallows errors, so **it can never affect the login path**.
- **Full audit logging:** every security mutation calls the global
  `AuditLogsService` (`MFA_ENROLL_STARTED`, `MFA_ACTIVATED`, `MFA_DISABLED`,
  `SESSION_REVOKED`, `SESSION_REVOKED_ALL`, `DEVICE_TRUSTED`, …).

### New database tables (additive, migration `20260601190000_v10_account_security`)

`UserMfaSecret`, `UserSession`, `UserDevice`, `UserLoginHistory` + enums
`MfaStatus`, `LoginOutcome`. `userId` is a **plain scalar** (no FK relation) so
the `User` model is untouched. The `schema.lock` spec (which freezes financial
columns) is unaffected.

### Rollout note — making MFA mandatory

MFA is currently **opt-in** (enroll/verify available; login is not yet gated) to
avoid breaking the live trial. `AccountSecurityService.verifyMfaCode()` and
`MFA_REQUIRED_ROLES` are the hooks for enforcement. Enabling a mandatory MFA
challenge for OWNER/ACCOUNTANT at login should be a **separate, reviewed PR**
with a feature flag and a tested fallback.

## 4. Load Test Suite (k6)

- **Location:** `tests/load/`
- Scenarios: `login`, `orders`, `invoices`, `payments`, `reports`
  (shared `config.js`, default thresholds: `http_req_failed < 1%`,
  `p95 < 800ms`).
- **Read-only by default**; write load is templated and gated for staging.
- Results template: `tests/load/LOAD_TEST_RESULTS_TEMPLATE.md`.

## 5. Backup Verification

- **Script:** `scripts/verify-backup.ts`
- Finds the latest `safari-erp-backup-*.dump` (from
  `scripts/backup-db-to-desktop.ts`), validates the archive with
  `pg_restore --list`, restores into a throwaway `postgres:18-alpine` container,
  and runs core-table sanity counts.
- Writes `BACKUP_VERIFICATION_REPORT.md` and exits non-zero on any failed step
  (so it can gate a scheduled job / CI). Degrades to integrity-only when Docker
  is unavailable.

---

## Tests added

| Suite | Coverage |
| ----- | -------- |
| `src/account-security/totp.util.spec.ts` | RFC 6238 vectors, base32 round-trip, drift window, recovery codes |
| `src/account-security/account-security.service.spec.ts` | enroll/activate/verify/disable, recovery consumption, session revoke, login capture |
| `src/owner-command-center/owner-command-center.service.spec.ts` | health roll-up, alert flags, command-center aggregation |

All new tests pass (25). Existing guard/RBAC/auth/lock suites re-verified green;
`api-contract.lock` and `rbac.lock` snapshots regenerated for the new routes.

## Safety guarantees

- ✅ No existing endpoint, DTO, or service signature changed (only an
  `@Optional()` event-emitter added to `AuthService`, fully backward compatible).
- ✅ No accounting/ledger writes — health and command-center are read-only.
- ✅ New tables are standalone; financial `schema.lock` invariants untouched.
- ✅ Type-check (`tsc --noEmit`) clean; targeted Jest suites green.

## Files

```
src/account-security/            MFA + sessions + devices + login history
src/owner-command-center/        system-health + command-center endpoints
prisma/schema.prisma             4 new models + 2 enums (appended)
prisma/migrations/20260601190000_v10_account_security/
src/auth/auth.service.ts         +optional EventEmitter2 + guarded login emit
src/app.module.ts                register 2 new modules
tests/load/                      k6 suite + results template
scripts/verify-backup.ts         backup restore drill
BACKUP_VERIFICATION_REPORT.md    generated report (initial template)
docs/V10_HARDENING_SUMMARY.md    this file
docs/SYSTEM_HEALTH_AND_COMMAND_CENTER.md
docs/SECURITY_HARDENING.md
```
