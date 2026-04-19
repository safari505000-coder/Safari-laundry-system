# V19.2 — Staging rollout: GM Island + CALL_CENTER 513 Standard

**Scope:** staging / test environment only. **Do not merge this branch to `main`.**
Production is pinned at `0398789` on `main`.

This document is the operator's checklist for the staging host that
consumes the `staging/v19.2-role-sync-and-cc-template` branch.

---

## 1. Deploy the branch

From the staging host (Render Preview, VPS, or dedicated staging service)
point the deploy at branch `staging/v19.2-role-sync-and-cc-template`
and set **`DATABASE_URL`** to the **staging** database — never production.

```bash
git fetch origin staging/v19.2-role-sync-and-cc-template
git checkout staging/v19.2-role-sync-and-cc-template
npm ci
npx prisma migrate deploy          # applies 20260419160000_safari_role_general_manager
npx prisma generate                # regenerates client with GENERAL_MANAGER
npm run build                      # backend
npm --prefix web run build         # frontend
```

The `main.ts` bootstrap seeds the `GENERAL_MANAGER` Role row on boot, so a
fresh staging DB gets it automatically.

---

## 2. GENERAL_MANAGER — The Second Eye

### 2.1 Create the staging GM user

Owner-only action; do it from **User Management** in the running staging
web app (or via `POST /api/users`):

| field        | value                                               |
| ------------ | --------------------------------------------------- |
| `fullName`   | GM Staging                                          |
| `username`   | gm.staging                                          |
| `password`   | (any non-empty string — rotate after first login)   |
| `safariRole` | `GENERAL_MANAGER`                                   |
| `branchId`   | any real branch (picker now shows اسم الفرع, not UUID) |

### 2.2 Sidebar Red-Line layout (verify in-app)

When `gm.staging` signs in, the sidebar MUST render in exactly this order
(source: `web/src/modules/general-manager/nav-config.ts`):

1. **Operations** — Invoices Data · Order Logs · Driver Shifts · Sequence Management (إدارة التسلسل)
2. **Finance & Reports** — Financial Reports · K-Net Reconciliation · Expense Approval · Financial Cycle Report · Managers' Held Cash · Employee Debts · Debt Collection Report · Payroll · Fixed Expenses · General Expenses
3. **System Settings** — Branch Management (إدارة الفروع) · User Management

Mobile footer: Keeta-style bottom nav with Financials · Orders · Subscribers · Branches (same as Owner).

### 2.3 Data plumbing — must flow end-to-end for GM

Run these GETs as the GM token in the staging app (open DevTools Network):

| endpoint                                   | GM must see                                 | feeds UI                                  |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| `GET /api/reports/executive-summary?from=…&to=…` | `grossKd`, `bankFeesTotalKd`, `netProfitKd` | Financials exec strip (net profit card)   |
| `GET /api/reports/bank-fees-by-branch?…`   | per-branch fees, not 403                    | Bank-fees card                            |
| `GET /api/expenses?status=APPROVED`        | `receiptUrl` populated (NOT null)           | Expense approval — Soap/Fuel photo audit  |
| `GET /api/expenses/pending-approval`       | pending rows visible                        | Expense approval queue                    |
| `GET /api/payroll`                         | all employees' payroll                      | Payroll island                            |
| `GET /api/fixed-expenses`                  | all scheduled rows                          | Fixed expenses                            |
| `GET /api/finance/reports/financial-cycle` | full cycle report                           | Financial Cycle report                    |
| `GET /api/finance/dashboard/realtime-totals` | live net profit                           | Financial Island dashboard tile           |
| `GET /api/branches`                        | all branches, 200 OK                        | Dialog "ربط الفرع" (اسم الفرع)            |

Any 403 here means a guard was missed — report back with the failing
endpoint and we patch before merge.

### 2.4 Receipt-photo audit (critical for GM)

Walk through one approved Soap or Fuel expense in **Expense Approval** and
click the receipt thumbnail. It must open the stored photo (Google Cloud
Storage signed URL in prod-like env, or `./uploads/...` in staging with
`STORAGE_DRIVER=local`). This is the auditable proof trail for the
Second Eye. If the URL is null → check
`src/expenses/expenses.service.ts::listForUser` (canSeeReceipt branch
must include `GENERAL_MANAGER`, already in `0398789`).

---

## 3. CALL_CENTER — The 513 Standard (sync user 512 → 513)

### 3.1 Tool

A one-shot CLI, safe by default (dry-run):

```bash
# Always dry-run first — shows the diff, writes NOTHING.
npx tsx scripts/sync-user-template.ts --template 513 --target 512

# After you've read the diff and it looks correct, apply:
npx tsx scripts/sync-user-template.ts --template 513 --target 512 --apply
```

Replace `512` / `513` with the real `username` values in the staging DB.
The script:

- Refuses to run without `DATABASE_URL` (so you cannot accidentally run
  it against prod by forgetting the env).
- Refuses to touch any OWNER account.
- Copies from template → target: `safariRole`, `roleId`, `branchId`,
  `isActive`, `jobTitle`, `vehicleLabel`.
- Never touches: `username`, `password`, `fullName`, `employeeId`,
  `phone`, `driverPrefix`, or any transactional history.

### 3.2 Why this is enough (permissions model note)

`prisma/schema.prisma` wires permissions on the **Role** model, not on the
User. Every CALL_CENTER user inherits the same permission set as soon as
they point at the same `roleId`. There is no per-user override to copy.
Therefore "hard-sync 512 to 513" is fully achieved by cloning the role
and profile fields above.

### 3.3 Post-sync verification

As user 512 on staging:

1. Log in — sidebar MUST match user 513's sidebar (CALL_CENTER layout).
2. `GET /api/call-center/operations-summary` → 200 (not 403).
3. `GET /api/call-center/debt-recovery-report` → 200 with data.
4. Open Subscribers / Customers screens → same columns/actions 513 sees.

---

## 4. Sign-off checklist (operator ticks these before PR-merge)

- [ ] Staging DB migrated (`20260419160000_safari_role_general_manager`).
- [ ] `gm.staging` signs in; lands on `/financials`; sidebar matches §2.2.
- [ ] All nine endpoints in §2.3 return 200 for GM, with real data.
- [ ] Receipt photos open for GM (§2.4).
- [ ] `sync-user-template` dry-run diff reviewed for 512 ← 513.
- [ ] `sync-user-template --apply` executed; 512 logged in; §3.3 checks pass.
- [ ] **No push to `origin main`.** Only `origin staging/v19.2-…`.

Once all boxes are green, open a PR `staging/v19.2-… → main` for Owner
review. Merge only on explicit Owner approval.
