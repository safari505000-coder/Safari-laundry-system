# Canary V1 — Test Results

> **Scope:** Staging canary readiness for `release/canary-v1` (currently `staging/v19.2-role-sync-and-cc-template`).
> **Window:** 72h continuous monitoring. Update each row as tests run. Fail-stop on any 🔴.

---

## 0. Gap register (before running Canary)

This block captures every item in the canary brief that is **not** backed by the current codebase. Close the red rows before signing off, or drop them from scope.

| # | Brief reference | Expected in system | Actual | Status |
|---|---|---|---|---|
| G1 | `POST /api/auth/token` | JWT issuance endpoint | Endpoint is `POST /api/auth/login` returning `{ accessToken, user }` | 🟡 Rename or alias |
| G2 | `GET /api/version` | Version/build metadata | Implemented in V19.3. Public route in `src/health/version.controller.ts`; returns `{ name, version, gitCommit, buildTime, node, env, uptime, startedAt }`. Populate `GIT_COMMIT` + `BUILD_TIME` env vars at deploy time | 🟢 Done |
| G3 | `GET /api/verify/:docType/:id` | Generic QR verify route | Three typed routes: `/api/verify/payslip/:id`, `/api/verify/leave_request/:id`, `/api/verify/employee_loan/:id` | 🟡 Plan must hit typed routes |
| G4 | QR payload contains `{ docType, id, hash, verifyUrl }` | Signed payload with hash | QR encodes the verify URL only (`/api/verify/<type>/<id>`). No HMAC signature today. | 🔴 Add QR_SECRET-signed payload |
| G5 | `POST /api/documents/upload` + OCR pipeline | Receipt upload + OCR validation + RED/GREEN badge | Not implemented. Expense approval flow accepts receipt uploads but there is no OCR validation or RED/GREEN state | 🔴 Out of scope for Canary V1, or add item |
| G6 | Dual-approval threshold for expenses | Amount ≥ X → Manager then Owner sign-off | Expense approval today is a single Accountant decision (DRAFT → SUBMITTED → APPROVED/REJECTED) | 🔴 Business rule not encoded |
| G7 | Slack alerts on cron failures | Slack webhook wired | Not configured. Sentry captures exceptions, but Slack relay is missing | 🔴 Add Slack webhook or remove from AC |
| G8 | `./scripts/migrate.sh staging` | Shell helper | Use `npx prisma migrate deploy` instead (canonical). Wrapper script does not exist | 🟡 Update plan commands |
| G9 | `./scripts/run_cron.sh <name>` | Manual cron trigger | Cron jobs run via `@Cron` decorators only. No manual trigger CLI today. Can add a dev-only Nest command if required | 🔴 Add trigger or test via clock-forwarding |
| G10 | `POST /api/attendance/biometric` | Biometric webhook | Exists as **stub** (no real device integration). Accepts payload and writes `AttendanceLog` with `BIOMETRIC` source | 🟡 Acceptable for canary, flag as stub |
| G11 | Test accounts `owner@test`, … | Seeded dev users | Seeding is manual today. See `scripts/sync-user-template.ts` for bootstrap template | 🟡 Run template before canary |

Legend: 🟢 matches plan · 🟡 minor drift, proceed with adjusted command · 🔴 plan expects feature that is not implemented; close before sign-off.

---

## 1. Smoke tests (first 30 minutes)

| # | Test | Command / Route | Expected | Actual | Status |
|---|---|---|---|---|---|
| S1 | Backend health | `GET /api/health` | 200, `{ status: "ok", info: { database: "up", memory_heap: "up", memory_rss: "up" } }` | | |
| S1b | Backend version | `GET /api/version` | 200, `data.version` matches release tag, `data.gitCommit` matches deployed SHA | | |
| S2 | Login — OWNER | `POST /api/auth/login` `{ username, password }` | 200, `{ accessToken, user.safariRole = "OWNER" }` | | |
| S3 | Login — GM | same | 200, role `GENERAL_MANAGER` | | |
| S4 | Login — ACCOUNTANT | same | 200, role `ACCOUNTANT` | | |
| S5 | Login — MANAGER | same | 200, role `MANAGER` | | |
| S6 | Login — DRIVER | same | 200, role `DRIVER` | | |
| S7 | Login — CALL_CENTER | same | 200, role `CALL_CENTER` | | |
| S8 | Owner sidebar renders six toned islands | open `/` as OWNER | Seven groups visible: Main / Finance (blue) / HR (green) / Inventory (orange) / Customers (purple) / Payment (red) / Admin (gray) | | |
| S9 | Payslip print opens | `/payroll/:id/print` as OWNER | 200, A4 layout, QR visible bottom-right | | |
| S10 | Payslip verify API | `GET /api/verify/payslip/:id` (public) | 200, `{ valid: true, issuedTo, summary }` | | |
| S11 | Leave print + verify | `/leaves/:id/print` + `GET /api/verify/leave_request/:id` | 200 both | | |
| S12 | Loan print + verify | `/loans/:id/print` + `GET /api/verify/employee_loan/:id` | 200 both | | |
| S13 | Frontend typecheck | `cd web; npx tsc -p tsconfig.app.json --noEmit` | exit 0, zero errors | | |
| S14 | Backend typecheck | `npx tsc -p tsconfig.build.json --noEmit` | exit 0 | | |

---

## 2. Security & RBAC

Test that every role sees only what `access-matrix.ts` grants.

| # | Actor role | Action | Expected | Actual | Status |
|---|---|---|---|---|---|
| R1 | DRIVER | `DELETE /api/orders/:id` | 403 (key `orders.delete` = OWNER + ACCOUNTANT) | | |
| R2 | ACCOUNTANT | `DELETE /api/orders/:id` on a test order | 200 + `AuditLog` row with type `ORDER_HARD_DELETED` | | |
| R3 | DRIVER | Sign-in at 03:00 Kuwait | 401, `errorCode: OUTSIDE_WORKING_HOURS`, `AuditLog` row | | |
| R4 | GM | `GET /admin/live-monitor` (Pulse) | 403, `liveMonitor.view = [OWNER]` | | |
| R5 | MANAGER | `POST /api/debt-transfers` | 403 (`debtTransfer.create = GM + ACCOUNTANT`) | | |
| R6 | ACCOUNTANT | create + finalize DebtTransfer | both 200; two DRIVER signatures required in between | | |
| R7 | MANAGER | `POST /api/pos/checkout` | 200 (manager branch POS) | | |
| R8 | ACCOUNTANT | `POST /api/pos/checkout` | 403 (`pos.use = MANAGER + DRIVER`) | | |
| R9 | DRIVER | `GET /api/insights/anomalies` | 403 | | |
| R10 | Owner | hard-delete user | 200 + `USER_HARD_DELETED` AuditLog | | |
| R11 | GM | hard-delete user | 403 | | |
| R12 | AUTH_BYPASS_WORKING_HOURS=1 | DRIVER login at 03:00 | 200 + WARN log `working-hours bypass active` | | |

---

## 3. Functional suites

### 3.1 POS → Inventory auto-decrement

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| F1 | POS checkout with line item linked to `stockItemId` | Order PAID, `BranchStockLevel.quantityOnHand` decreases by quantity, `StockMovement` row with type `OUT` | | |
| F2 | POS checkout when stock is below requested qty | Order still PAID (negative allowed), `StockMovement` row records the negative leap, alert visible in `/inventory/low-stock` within 24h cron cycle | | |
| F3 | Refund / soft cancel on a PAID order | Reverse `StockMovement` row recorded; levels restored | | |

### 3.2 Payroll × Loan integration

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| F4 | Create active `EmployeeLoan` for a driver, run payroll | Payroll record shows loan deduction; loan balance decreases by installment | | |
| F5 | Loan fully paid mid-cycle | Next payroll shows 0 deduction; loan status flips to `CLOSED` | | |

### 3.3 Custody × Shift decoupling

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| F6 | Driver hands cash to manager 14:00, manager has not deposited yet, 00:00 shift cycle runs | Shift closes; `ManagerCashCustody` remains OPEN independently | | |
| F7 | Manager deposits cash to bank later, receipt attached | `ManagerCashCustody` → `CLOSED`; `BankDepositLog` created; ledger balanced | | |

### 3.4 Debt Transfer — dual-signature

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| F8 | ACCOUNTANT creates transfer with 3 orders, status `PENDING_SIGNATURES` | Persisted; both drivers can see it in `/my/debt-transfers` | | |
| F9 | Source driver signs | Status `PENDING_TARGET_SIGNATURE` | | |
| F10 | Target driver signs | Status `PENDING_FINALIZATION` | | |
| F11 | ACCOUNTANT finalizes | Orders reassigned; `GeneralLedgerEntry` created; `DEBT_TRANSFER_FINALIZED` in AuditLog | | |
| F12 | Cancel after driver signed | Status `CANCELLED`; original orders untouched; cancellation reason persisted | | |

---

## 4. Printable sheet + QR

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| P1 | Screen ↔ print parity (payslip) | Header, totals, footer visually identical on screen and `Ctrl+P` preview | | |
| P2 | Same test for leave request + loan + attendance report | identical | | |
| P3 | QR decode (phone camera or `zbarimg`) | URL decodes to `/api/verify/<type>/<id>` on the configured base URL | | |
| P4 | Fetch that URL while signed out | 200 (public route), `{ valid: true, issuedTo, summary }` | | |
| P5 | Fetch `/api/verify/payslip/0000-non-existent` | 200 with `{ valid: false }` (or 404; document the actual contract) | | |
| P6 | Gap G4 — tamper the QR content (flip a char in the id) | Document verify should return `valid: false`; if no HMAC signature today, log this as a V19.4 gap and record 🔴 here | | |

---

## 5. Cron jobs

Manual trigger options: `node -e "require('./dist/src/...').handleCron()"` or forward system clock in a disposable docker compose.

| # | Job | Schedule (Kuwait) | Trigger test | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| C1 | `ShiftCycleService` | `0 0 * * *` | force via clock or SQL-forward last row | Today's `Shift` closed, tomorrow's opened, audit line `SHIFT_CYCLE_RAN` | | |
| C2 | `SerialGapService` | `5 0 * * *` | delete an order row mid-sequence then run | `AuditLog` row `SERIAL_GAP_DETECTED` + Owner page shows the gap in `/owner/serials` | | |
| C3 | `LowStockCronService` | `0 6 * * *` | drop a `BranchStockLevel.quantityOnHand` below `reorderThreshold` | `/inventory/low-stock` shows the item; alert payload recorded | | |
| C4 | `AttendanceService.syncShiftAttendance` | `5 21 * * *` | insert a test `Shift` with closed time yesterday | `AttendanceLog` row appears with `source = SYNCED_FROM_SHIFT` | | |
| C5 | `WeeklyExecutiveReportService.runWeekly` | `0 7 * * 0` | call method directly | PDF saved in configured path, entry in weekly reports list | | |

---

## 6. Observability

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| O1 | `GET /api/health` while DB is reachable | 200 all checks `up` | | |
| O2 | `GET /api/health` after stopping Postgres | 503 with `database.status = down` | | |
| O3 | Force an uncaught exception on any endpoint | `global-exception.filter` fires `Sentry.captureException`, event appears in Sentry project | | |
| O4 | Run `npm run db:check-drift` against a modified schema | exit 1, diff printed | | |
| O5 | Run `scripts/pg-backup.sh` | backup file created, size > 0, restore succeeds on scratch DB | | |

---

## 7. Performance (light load)

Use `autocannon` or `k6` against the reachable host.

| # | Endpoint | Target | Actual | Status |
|---|---|---|---|---|
| PF1 | `GET /api/health` | p95 < 100ms, zero errors | | |
| PF2 | `GET /api/orders?branchId=<x>` (authorised) | p95 < 500ms @ 50 rps for 60s | | |
| PF3 | `POST /api/pos/checkout` (authorised) | p95 < 800ms @ 10 rps for 60s | | |
| PF4 | Server CPU during PF2 + PF3 combined | avg < 70% on the canary node | | |

---

## 8. Acceptance criteria

All must be 🟢 before canary sign-off:

- [ ] Every row in §1 is 🟢.
- [ ] No 🔴 in §0 without an accepted waiver signed below.
- [ ] §2 RBAC rows R1–R12 are 🟢.
- [ ] §3 F1–F12 are 🟢.
- [ ] §4 P1–P5 are 🟢; P6 either 🟢 or a documented V19.4 gap.
- [ ] §5 C1–C5 are 🟢.
- [ ] §6 O1–O5 are 🟢.
- [ ] §7 PF1–PF4 are 🟢.
- [ ] Approvals below signed.

### Approvals

| Role | Name | Signature | Date |
|---|---|---|---|
| OWNER | | | |
| Head of Finance | | | |
| Lead Dev | | | |

### Waivers (for 🔴 gaps not blocking canary)

| Gap | Reason | Owner | Target version |
|---|---|---|---|
| | | | |

---

## 9. Rollback drill

If any of these trip during canary, execute rollback:

- any Sev-1 issue uncaught by tests,
- cumulative error rate > 1% for 30 minutes,
- cron job failure > 2 consecutive runs,
- data corruption detected in `GeneralLedgerEntry`.

Rollback steps (run in order, record timestamp for each):

1. Point load balancer / PM2 back to previous release tag.
2. Restore DB snapshot taken immediately before the canary cutover.
3. Redeploy prior Docker image / `dist/` build.
4. Verify `/api/health` returns prior version.
5. Post incident notice.
6. Open postmortem issue within 24h with `incident/` prefix.

| Rollback step | Timestamp (UTC) | Operator |
|---|---|---|
| 1 — Traffic cut | | |
| 2 — DB restore | | |
| 3 — Prior build redeploy | | |
| 4 — Health verified | | |
| 5 — Incident notice sent | | |
| 6 — Postmortem opened | | |

---

## 10. Incident log (append per event)

```
[YYYY-MM-DDTHH:MM:SSZ] <severity> <short title>
Actor: <who>
Trigger: <what happened>
Impact: <scope>
Detection: <how we noticed>
Mitigation: <what was done>
Sentry: <event id>
Issue: #<gh-issue>
```
