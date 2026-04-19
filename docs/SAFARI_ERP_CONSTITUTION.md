# Safari‑ERP — System Constitution (دستور سفاري)

**Version:** V19.2 · **Scope:** staging playbook + production reference
**Branch:** `staging/v19.2-role-sync-and-cc-template`
**Authored from source code:** every fact below is cited with `file:line`; there is no opinion here that isn't grounded in the repo.
**Audience:** Owner (Abu Mohammed) · General Manager · Accountant · Branch Managers · Drivers · Call Center · training material · marketing.
**Languages:** each workflow article is written in English first, then Arabic (العربية).

---

## Table of Contents

**Part I — The Deep Audit (TOMB RAIDER MODE)**
  §1.1 Why `GENERAL_MANAGER` was rejected — root cause and proof
  §1.2 Why the branch dropdown showed a UUID — root cause and proof
  §1.3 Other anomalies uncovered during the audit

**Part II — The Operational Constitution (bilingual)**
  Art. 1 — The Driver's Loop / حلقة السائق
  Art. 2 — The Branch Manager's Loop / حلقة مدير الفرع
  Art. 3 — The Accountant's Loop / حلقة المحاسب
  Art. 4 — The General Manager's Loop / حلقة المدير العام (العين الثانية)
  Art. 5 — The Owner's Loop / حلقة المالك
  Art. 6 — The Call Center's Loop / حلقة مركز الاتصال
  Art. 7 — Supervisor & Viewer / المراقب والمُطّلع

**Part III — The Cash-Flow Constitution**
  Art. 8 — The Five Stages of the Kuwaiti Dinar
  Art. 9 — Net Profit Formula (exact, as implemented)
  Art. 10 — The Receipt Lifecycle (Fuel/Soap)

**Part IV — Role × Sidebar × Bottom-Nav Matrix**

**Part V — Technical Annexes**
  Annex A — State machines (every enum that touches money)
  Annex B — Money-bearing tables (index)
  Annex C — Known anomalies & suggested follow-ups

---

# PART I — The Deep Audit

This section is the forensic record of the two bugs visible in the Owner's
red-error screenshot (user-management dialog). Each finding is stated as:
**symptom → root cause → fix → proof (file:line)**.

---

## §1.1 Why `GENERAL_MANAGER` was rejected

**Symptom.** Creating a new user with role `GENERAL_MANAGER` returned a red
validation error: *"safariRole must be one of the following values: OWNER,
MANAGER, DRIVER, …"* — the string `GENERAL_MANAGER` was missing from the list.

**Root cause.** The DTO used

```typescript
import { SafariRole } from '@prisma/client';
// ...
@IsEnum(SafariRole)
safariRole: SafariRole;
```

`@IsEnum(SafariRole)` evaluates the enum **at runtime** against whatever
Prisma generated into `node_modules/@prisma/client` on that deploy target.
The `GENERAL_MANAGER` value was added to `prisma/schema.prisma` in V19.0,
but if a deploy target hadn't yet run `prisma generate` against the new
schema, the runtime enum was still the pre-V19.0 set — so class-validator
legitimately rejected `GENERAL_MANAGER`.

This is a **timing-coupled validation bug**: it is invisible in dev (where
you always `prisma generate`), but it fires on any environment that cached
an older generated client.

**Fix** (commit `0398789`, `src/users/dto/create-user.dto.ts`):

```typescript
const SAFARI_ROLE_VALUES: SafariRole[] = [
  'OWNER',
  'GENERAL_MANAGER',
  'MANAGER',
  'DRIVER',
  'WORKER',
  'CALL_CENTER',
  'ACCOUNTANT',
  'SUPERVISOR',
  'VIEWER',
];

@IsIn(SAFARI_ROLE_VALUES, {
  message: `safariRole must be one of: ${SAFARI_ROLE_VALUES.join(', ')}`,
})
safariRole: SafariRole;
```

Validation is now an **explicit, checked-in allow-list** — no runtime
dependency on the generated Prisma client. Any attempt to add or remove a
role mechanically forces an edit to `SAFARI_ROLE_VALUES` (which shows up in
code review), preventing silent regressions.

**Proof the fix flowed into every entry point.**

| Layer                | Location                                                                  | Accepts GM? |
| -------------------- | ------------------------------------------------------------------------- | ----------- |
| DB enum              | `prisma/schema.prisma:12-22` (`enum SafariRole { OWNER GENERAL_MANAGER …}`) | ✅          |
| DB role seed         | `src/main.ts` (bootstrap ensures `Role.name = 'GENERAL_MANAGER'`)         | ✅          |
| DTO validation       | `src/users/dto/create-user.dto.ts` (V19.1 `@IsIn(SAFARI_ROLE_VALUES)`)    | ✅          |
| Service role resolve | `src/users/users.service.ts:42-52` (`resolveRoleId` looks up by name)     | ✅          |
| Auth service         | `src/auth/auth.service.ts` (`INSTITUTIONAL_ROLES` includes GM)            | ✅          |
| Frontend union       | `web/src/lib/api.ts` (`SafariRole` union has `'GENERAL_MANAGER'`)         | ✅          |
| Frontend form        | `web/src/modules/shared/reactors/StaffControlReactor.tsx:33-42` (`ROLE_OPTIONS`) | ✅ |
| i18n label           | `web/src/i18n/locales/ar.ts` (`roles.GENERAL_MANAGER = 'مدير عام'`)       | ✅          |

---

## §1.2 Why the branch dropdown showed a UUID

**Symptom.** In the Add-New-User dialog, the "ربط الفرع" selector's trigger
displayed a long UUID (e.g. `a3c8b1e0-4f6d-…`) instead of a branch name
(`الرقة`, `حطين`).

**Root cause (two compounding defects).**

1. **Backend guard gap.** `GET /branches` was decorated with
   `@Roles(OWNER, MANAGER, ACCOUNTANT, SUPERVISOR, VIEWER)`. It did **not**
   include `GENERAL_MANAGER`. When a GM user opened the dialog, the fetch
   returned `403 Forbidden`, the `branches` state stayed empty, and no
   `<SelectItem>` matched the pre-selected `branchId` — so Radix UI's
   `SelectValue` fell through to the raw `value` string (the UUID).

2. **Frontend text-extraction fragility.** Even once branches loaded, Radix
   `SelectValue` renders the `textContent` of the matched `SelectItem`'s
   children. If the fetch resolved *after* the dialog opened, there was a
   brief render window where the UUID was visible before the name appeared.

**Fix** (commit `0398789`, two files):

- `src/branches/branches.controller.ts:18-32` — `@Roles(...)` now includes
  `SafariRole.GENERAL_MANAGER`, so GM can populate the picker.
- `web/src/modules/shared/reactors/StaffControlReactor.tsx` — a
  `branchNameById` map is pre-computed from the branches list, and the
  `SelectTrigger` now renders the branch *name* explicitly in a `<span>`:

```tsx
<SelectTrigger className="bg-white">
  {branchId && branchNameById[branchId] ? (
    <span className="text-slate-900">{branchNameById[branchId]}</span>
  ) : (
    <SelectValue placeholder="اختر الفرع" />
  )}
</SelectTrigger>
```

The same treatment was applied to the in-table per-user branch picker. The
label also now reads **"ربط الفرع (اسم الفرع)"** so there is no ambiguity
about what the user is choosing.

---

## §1.3 Other anomalies uncovered during the audit

These are genuine inconsistencies found while tracing the workflows below.
They are documented here — not silently patched — so the Owner can decide
priority. Each includes a file:line anchor.

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| A | `ExpensesService.listPendingApproval` does **not** gate `receiptUrl` by role, so `ACCOUNTANT` sees raw receipt photos on the pending queue even though the `GET /expenses` list correctly restricts them to OWNER+GM only. | `src/expenses/expenses.service.ts:184-214` (canSeeReceipt applied to `listForUser` but not `listPendingApproval`). | Medium — contradicts the "Financial-Island auditors only" comment. |
| B | `ExpensesService.updateStatus` does not enforce that FUEL/SOAP rows carry a `receiptUrl` before transitioning to `APPROVED`. A manager could theoretically post a FUEL expense without proof (driver UI enforces it, manager UI makes it `required`). | `src/expenses/expenses.service.ts:217-236`. | Low — UI already guards, but the service is the defense-in-depth layer. |
| C | `web/src/pages/manager-custody-aging-page.tsx:83-84` has `canView = OWNER + ACCOUNTANT` only — `GENERAL_MANAGER` is in the backend guard but not in the UI gate. | Backend: `src/manager-custody/manager-custody.controller.ts:176-184` includes GM. | Medium — GM will see the "forbidden" screen despite having the permission. |
| D | `web/src/pages/bank-deposits-page.tsx:53` has `canView = OWNER + ACCOUNTANT + MANAGER` — backend `GET /finance/bank-deposits` accepts GM (see V19.0 edit), so the UI lags. | Same pattern as (C). | Medium. |
| E | `web/src/pages/financials-page.tsx:292-294` drill treats `status === 'APPROVED' \|\| 'AUDIT'` as approved expenses, but `ReportsService.netProfitExecutive` (via `sumInRangeByCategories`) only sums `APPROVED`. The drill total may not reconcile with the KPI card. | `src/expenses/expenses.service.ts:266-285` vs `financials-page.tsx:851-856`. | Medium — discrepancy visible to Owner. |
| F | `ExpensesService.create` returns `{ ...row, receiptUrl: null }` to the creator, so the driver never gets the stored receipt URL back on the POST response even though it was saved. | `src/expenses/expenses.service.ts:142`. | Low — UX only; data is correct. |
| G | `BranchExpense.receiptUrl` is a `Text` column storing a full **data URL** (base64 image in the DB), capped at 500,000 chars. There is no GCS/disk indirection for this field, unlike `manager-custody` slips (`/uploads/...`) and `bank-deposits` receipts. | `prisma/schema.prisma:237-239`; `src/expenses/dto/create-expense.dto.ts:32-36`. | Low design debt — works at current scale; will hurt at 100k+ rows. |
| H | The "deposit" flow has **two** parallel concepts that are easy to confuse:<br>&nbsp;&nbsp;• `Deposit` (driver-submitted, `POST /api/finance/deposits`, multipart, status `PENDING`) — functionally a driver→accountant queue.<br>&nbsp;&nbsp;• `ManagerCashCustody` (manager-submitted, `POST /api/manager-custody/approve-receipt`, the actual handover bag) — status lifecycle `PENDING_DEPOSIT` → `AWAITING_VERIFICATION` → `VERIFIED`/`REJECTED`. | `src/finance/deposits.controller.ts:74-134` vs `src/manager-custody/manager-custody.service.ts:95-215`. | Documentation — addressed in Article 8 below. |

---

# PART II — The Operational Constitution

Each article below is the contract between a role and the system. Each
article contains:

- **Mission** — the one-line purpose of this role.
- **Entry point** — what they land on after login.
- **Workflow** — the ordered sequence of real buttons & endpoints.
- **Hand-off** — what they pass to the next role and when.

---

## Article 1 — The Driver's Loop / حلقة السائق

### 1.1 Mission (EN)

The Driver generates revenue in the field. He issues invoices at the
customer's door, receives the payment (cash, KNET, prepaid wallet, payment
link), and physically carries the cash back to his Branch Manager at the
end of his shift. He is responsible for uploading a photo of every fuel
and soap receipt he spends in the field.

### 1.1 الرسالة (العربية)

السائق هو مصدر الإيراد الميداني. يُصدر الفاتورة أمام العميل،
يستلم الدفعة (نقدًا، كي-نت، محفظة مسبقة الدفع، أو رابط دفع)، ويحمل
النقد فعليًا إلى مدير الفرع عند نهاية ورديته. مسؤول عن رفع صورة
لكل إيصال وقود وصابون يصرفه في الميدان.

### 1.2 Entry point

- Mobile/tablet POS app. The driver shell does **not** render the
  executive sidebar; the POS is full-screen
  (`web/src/modules/shared/components/shell/mobile-bottom-nav.tsx:118-125`
  — `if (role === 'DRIVER') return null;`).
- Default page: `/pos` (see Article 1 sidebar in Part IV).

### 1.3 Start of shift — `POST /api/finance/driver/ensure-shift`

- **Roles:** `DRIVER` only (`src/finance/finance.controller.ts:67-76`).
- **What it does:** idempotent — if no `Shift` exists it creates one in
  status `OPEN`; if an `OPEN` shift started **before Kuwait midnight**, it
  is closed to end-of-prior-Kuwait-day and a new `OPEN` shift is created
  (`src/finance/services/cash.service.ts:54-81`).
- **UI trigger:** `useDriverOperatingPoll` fires it automatically when the
  financial date rolls over
  (`web/src/modules/driver/hooks/use-driver-operating-poll.ts:21-26`).

### 1.4 Issuing an invoice — two flows, one result

**Flow A — POS checkout with payment** (the 95% case).

- **Endpoint:** `POST /api/pos/checkout`
  (`src/pos/pos.controller.ts:65-72`).
- **Roles:** `DRIVER`, `MANAGER`.
- **Body:** `PosCheckoutDto` — extends `CreateOrderQuickDto` and adds
  optional `posPaymentMethod` enum
  (`src/orders/dto/pos-checkout.dto.ts`).
- **Logic:** `OrdersService.posCheckout`
  (`src/orders/orders.service.ts:364-554`):
  - Creates `Order` with `status: COMPLETED`, `cashStatus: PAID_TO_DRIVER`,
    and the resolved `posPaymentMethod`.
  - Stamps the human-readable serial `${driverPrefix}-${next}` via
    `SerialCounter` (`src/serials/serial-counter.service.ts:31-67`).
  - Appends a `POS_SALE_COMPLETED` row to the general ledger.
  - If prepaid wallet covers the full amount, resolver forces
    `SUBSCRIPTION_WALLET` and calls `applyOrderWalletSettlementForCompletedOrder`
    (`src/customer-ledger/customer-ledger.service.ts:75-220`).

**Flow B — Quick order (intake, no payment)**.

- **Endpoint:** `POST /api/orders/quick`
  (`src/orders/orders.controller.ts:53-62`, `@Roles(DRIVER)`).
- **Result:** `Order` in `PENDING`, `posPaymentMethod: null`,
  `cashStatus: UNPAID`. Used for collect-now-pay-later field intakes.

### 1.5 The three payment paths

| Method | Stored as | Counts toward driver's cash custody? | Counts toward gross revenue? |
|---|---|---|---|
| **CASH** | `posPaymentMethod = CASH`, `cashStatus = PAID_TO_DRIVER` | ✅ yes | ✅ yes |
| **KNET** | `posPaymentMethod = KNET`, `cashStatus = PAID_TO_DRIVER` | ❌ no (bank-side) | ✅ yes (minus bank fees) |
| **SUBSCRIPTION_WALLET** | resolver forces this when wallet covers full amount; `CustomerWallet.balance` debited | ❌ no (prepaid) | ✅ yes |
| **PAYMENT_LINK / ONLINE** | `PENDING` until gateway callback confirms | ❌ no | counted when gateway marks completed |
| **DEBT_ON_ACCOUNT** | `posPaymentMethod = DEBT_ON_ACCOUNT` | ❌ no | ✅ yes, debt appears on customer wallet |

### 1.6 Driver's cash custody — the accumulator

There is **no** dedicated "driver wallet" row. The driver's cash custody is
**computed on demand** by summing completed orders:

- `CashService.getDriverBalances`
  (`src/finance/services/cash.service.ts:122-211`):
  - `heldCashTotal` = sum of `Order.totalPrice` where
    `status=COMPLETED`, `cashStatus=PAID_TO_DRIVER`, `posPaymentMethod=CASH`.
  - Split tiles: `pendingCashKd`, `pendingKnetKd`, `pendingLinkKd`,
    `pendingTotalKd`.
- Exposed to the UI via `GET /api/finance/driver-balance` (roles OWNER,
  GM, MANAGER, ACCOUNTANT, CALL_CENTER, SUPERVISOR, VIEWER —
  `src/finance/finance.controller.ts:193-210`).

### 1.7 Filing a field receipt (Fuel/Soap)

This is the most misunderstood flow in the system. It is **not** a
multipart file upload; it is a JSON POST with a **data URL** string.

- **UI:** `web/src/modules/driver/pages/driver-field-expenses-page.tsx`.
  The driver picks `type="file" accept="image/*"`; `FileReader.readAsDataURL`
  converts it to a base64 data URL (line 121-136).
- **Submit:** `POST /api/expenses` with JSON body:
  ```json
  {
    "title": "تعبئة وقود محطة مشرف",
    "amount": 3.500,
    "category": "FUEL",
    "expenseMethod": "CASH",
    "receiptUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRgAB…"
  }
  ```
- **Validation (client):** FUEL requires a receipt or the submit button is
  disabled with toast `"يجب تصوير الإيصال قبل الحفظ للصرف في الوقود"` (line
  89-91).
- **Validation (server):** `CreateExpenseDto` caps `receiptUrl` at 500,000
  chars; server does **not** enforce that FUEL carries a receipt
  (Anomaly B in §1.3).
- **Persistence:** `BranchExpense` row created with
  `status = PENDING_ACCOUNTANT`, `recordedById = driver.id`,
  `branchId = driver.branchId` (`src/expenses/expenses.service.ts:97-117`).
- **Ledger:** `EXPENSE_RECORDED` appended to the general ledger
  (lines 127-140).

### 1.8 End of shift — handover

The driver does **not** press a button to "end the shift". The **Branch
Manager** presses the "Approve Receipt" button on the Manager Custody page
(Article 2, §2.3), which atomically:

1. Closes the driver's `OPEN` shift to `CLOSED`.
2. Moves every CASH order from `PAID_TO_DRIVER` → `HANDED_OVER_TO_OFFICE`.
3. Creates a `ManagerCashCustody` bag owned by that manager.

This asymmetry is deliberate (Dastur §3): the driver cannot unilaterally
"clear" his liability; the manager must physically receive the cash first.

### 1.9 الخلاصة بالعربية (حلقة السائق في جملة واحدة)

يفتح وردية → يصدر فواتير POS مع طريقة دفع → يستلم نقدًا مقابل CASH
فقط → يصور إيصال الوقود/الصابون ويرفعه كصورة JSON إلى
`POST /api/expenses` → يُسلِّم النقد ماديًا إلى مدير الفرع الذي يُغلق
الوردية ويُنشئ "الكيس" (ManagerCashCustody).

---

## Article 2 — The Branch Manager's Loop / حلقة مدير الفرع

### 2.1 Mission

**EN.** The Branch Manager is the first auditor. He physically receives
cash from every driver on his branch, verifies the sum against the system's
count of that driver's CASH orders, uploads the bank-deposit slip image,
and forwards the bag to the Accountant for final verification.

**AR.** مدير الفرع هو المدقق الأول. يستلم النقد ماديًا من كل سائق في
فرعه، يقارن بين المبلغ ومجموع فواتير CASH للسائق في النظام، يرفع
صورة إيصال الإيداع البنكي، ويُحيل "الكيس" إلى المحاسب للتحقق النهائي.

### 2.2 Entry point

- Landing: `/` → `DashboardPage` (fallback — MANAGER is not GM/OWNER so
  `IndexRoute` skips the financials redirect, `web/src/App.tsx:55-60`).
- Sidebar (see Part IV): **Main** (POS, Dashboard, Orders) · **Operations**
  (Driver Shifts) · **Finance** (Expenses, **My Custody** ← THE button).

### 2.3 Approving a driver handover — `POST /api/manager-custody/approve-receipt`

- **Roles:** `MANAGER` only (`src/manager-custody/manager-custody.controller.ts:61-72`).
- **DTO:** `ApproveReceiptFromDriverDto` — `driverId`, optional
  `declaredHandoverTotal`, optional `note`.
- **Service:** `ManagerCustodyService.approveReceiptFromDriver`
  (`src/manager-custody/manager-custody.service.ts:95-215`):
  1. Selects that driver's `OPEN` shift.
  2. Loads all orders with `status=COMPLETED`, `cashStatus=PAID_TO_DRIVER`,
     `posPaymentMethod=CASH`, `driverId=target`.
  3. Sums them → `amountKd`.
  4. Flips them to `cashStatus=HANDED_OVER_TO_OFFICE`, stamps
     `handoverShiftId`.
  5. Sets the shift to `CLOSED`.
  6. Creates `ManagerCashCustody` row with `status=PENDING_DEPOSIT`,
     `managerId=req.user.id`, `driverId`, `branchId`, `shiftId`,
     `amountKd`, `receivedFromDriverAt=now()`.
- **UI button:** on `MyCustodyPage`
  (`web/src/modules/manager/pages/MyCustodyPage.tsx`), one-click per driver.

### 2.4 Uploading the bank-deposit slip

Two endpoints are available for the slip image:

- **`POST /api/manager-custody/:id/upload-slip-image`** — multipart,
  field name `file`, accepted JPEG/PNG/WebP up to 6 MB; stored under
  `uploads/manager-custody-slips/` with UUID filename.
- **`POST /api/manager-custody/:id/upload-slip`** — JSON with
  `depositSlipUrl` (if the image already lives on GCS or elsewhere).

Either path transitions the bag: `PENDING_DEPOSIT` → `AWAITING_VERIFICATION`
(`src/manager-custody/manager-custody.service.ts:218-268`).

### 2.5 Bulk bank deposit — `POST /api/finance/bank-deposits`

- **Roles:** `MANAGER`, `GENERAL_MANAGER` (`src/finance/bank-deposits.controller.ts:77-151`).
- **Purpose:** the *paperwork* trail — a `BankDepositLog` row that records
  the official bank interaction, independent of any single custody bag. It
  carries `depositType` (`CASH_DEPOSIT_SLIP` or `KNET_Z_REPORT`) and its
  own `verifiedByAccountantId` / `verifiedAt` lifecycle.
- **Important:** do not confuse this with the `Deposit` model
  (`src/finance/deposits.controller.ts`, role `DRIVER`), which is a
  driver-self-service queue with `PENDING` status for accountant review
  — a less-used alternate lane.

### 2.6 Recording branch expenses

- **Endpoint:** `POST /api/expenses` (same as driver, `@Roles(MANAGER, DRIVER)`).
- **UI:** `web/src/pages/expenses-page.tsx` — receipt file is `required`
  (line 221-226), independent of category. FUEL is technically required
  by convention but server does not enforce (Anomaly B).

### 2.7 حلقة مدير الفرع بالعربية

يستقبل كل سائق → يضغط **اعتماد التسليم** لكل واحد (يُغلق وردية السائق
ويُنشئ الكيس في حالة PENDING_DEPOSIT) → يرفع صورة الإيصال البنكي
(الحالة تنتقل إلى AWAITING_VERIFICATION) → يُسجّل مصاريف الفرع إن
وُجدت → يُحيل كل الأكياس إلى المحاسب.

---

## Article 3 — The Accountant's Loop / حلقة المحاسب

### 3.1 Mission — Dastur §2.2 "Liability-Only"

**EN.** The Accountant is the second auditor. He verifies manager-custody
bags and bank-deposit logs, approves or rejects field expenses, and
reconciles KNET. He is **forbidden** from seeing Owner signals — the
sidebar explicitly omits Safari Pulse / Live Monitor
(`web/src/modules/accountant/nav-config.ts:17-22` — "Keep this file clean
of any radar/pulse import to guarantee total invisibility of that surface").

**AR.** المحاسب هو المدقق الثاني. يتحقق من أكياس عُهدة المدراء
وسجلات الإيداع البنكي، يعتمد أو يرفض مصاريف الميدان، ويُطابق
شبكة الكي-نت. ممنوع منعًا باتًا أن يرى إشارات المالك (الرادار /
نبض سفاري).

### 3.2 Sidebar posture (see Part IV)

Three groups: **Driver Radar** · **Audit** · **Operations**. No
`Financials`, no `Reports` (those are OWNER/GM only).

### 3.3 Verifying manager custody

- **Verify:** `POST /api/manager-custody/:id/verify` — roles `ACCOUNTANT`,
  body `{ note? }`. Sets
  `status=VERIFIED`, `verifiedByAccountantId`, `verifiedAt`
  (`src/manager-custody/manager-custody.service.ts:281-300`).
- **Reject:** `POST /api/manager-custody/:id/reject` — body
  `{ rejectionReason }` (3-500 chars). Sets `status=REJECTED`,
  `rejectedByAccountantId`, `rejectedAt`, `rejectionReason` (lines
  325-331). Manager can re-upload a corrected slip → bag flips back to
  `AWAITING_VERIFICATION` (lines 230-232).
- **UI:** `web/src/pages/manager-custody-aging-page.tsx`.
  ⚠️ Frontend `canView` is `OWNER + ACCOUNTANT` only — Anomaly C.

### 3.4 Verifying bank deposits

- **Endpoint:** `POST /api/finance/bank-deposits/:id/verify` — `ACCOUNTANT`
  only (`src/finance/bank-deposits.controller.ts:153-164`). Sets
  `verifiedByAccountantId`, `verifiedAt`. No reject path exists;
  verification is idempotent.

### 3.5 Reviewing the expense queue

- **List:** `GET /api/expenses/pending-approval` — roles `ACCOUNTANT`,
  `OWNER`, `GENERAL_MANAGER`. Returns `status=PENDING_ACCOUNTANT` rows
  (`src/expenses/expenses.service.ts:195-214`).
- **Action:** `PATCH /api/expenses/:id/status` — body `{ status }` one of:
  - `APPROVED` → enters net-profit aggregates.
  - `REJECTED` → excluded from net profit.
  - `AUDIT` → parked for further review; excluded from net profit (but
    visible in the financials drill — Anomaly E).
- **UI:** `web/src/pages/expense-approval-page.tsx`. Arabic buttons:
  **اعتماد** (approve), **رفض** (reject), **تحويل للتدقيق** (audit).

### 3.6 Other accountant duties

- **KNET Audit:** `web/src/modules/accountant/pages/KnetAudit.tsx` — roles
  OWNER+GM+ACCOUNTANT; reconciles POS KNET receipts against the bank's
  Z-report via `BankDepositLog(depositType=KNET_Z_REPORT)`.
- **Movement Logs & Unified Ledger:** read-only views of
  `GeneralLedgerEntry` and the driver radar.
- **Inventory stock-in:** `AccountantInventory` + `StockIn` pages.

### 3.7 حلقة المحاسب بالعربية

يفتح طابور "عهدة المدراء" → يتحقق من كل كيس أو يرفضه بسبب واضح
→ يعتمد الإيصالات البنكية → يطوف طابور المصاريف المعلقة
(مع مشاهدة الصورة) ويقرر اعتماد/رفض/تحويل للتدقيق → يُطابق كي-نت
مع Z-report من البنك.

---

## Article 4 — The General Manager's Loop / حلقة المدير العام (العين الثانية)

### 4.1 Mission

**EN.** The General Manager is the Owner's strategic proxy — the
"Second Eye". He inherits the Accountant's full access and is additionally
granted everything the Owner sees on the Financial Island, except for
Owner-only overrides (user deletion, radar).

**AR.** المدير العام هو الوكيل الاستراتيجي للمالك — "العين الثانية".
يرث كامل صلاحيات المحاسب، ويُضاف إليه كل ما يراه المالك في الجزيرة
المالية، ما عدا الصلاحيات الحصرية للمالك (حذف المستخدمين، الرادار).

### 4.2 Entry point

`IndexRoute` redirects GM straight to `/financials`
(`web/src/App.tsx:55-60`): both GM and OWNER land on the Financial Island.

### 4.3 Sidebar (Red-Line layout, per spec)

`web/src/modules/general-manager/nav-config.ts`:

1. **Operations** — Invoices Data · Order Logs · Driver Shifts · Sequence Management (إدارة التسلسل).
2. **Finance & Reports** — Financial Reports · K-Net Reconciliation ·
   Expense Approval · Financial Cycle Report · Managers' Held Cash ·
   Employee Debts · Debt Collection Report · Payroll · Fixed Expenses ·
   General Expenses.
3. **System Settings** — Branch Management · Users Management.

### 4.4 What GM approves vs what GM observes

| Action | Can do? | Notes |
|---|---|---|
| Approve/reject expense | ✅ | Same guard as accountant (`PATCH /api/expenses/:id/status`). |
| Approve/reject manager custody | ✅ via `verify` endpoint (GM is included in backend guard; UI gap = Anomaly C). |
| Verify bank deposit | ✅ backend; UI gap = Anomaly D. |
| Open receipt photo (FUEL/SOAP) | ✅ GM is in `canSeeReceipt` (`src/expenses/expenses.service.ts:184-192`). |
| View net profit | ✅ GM is in `@Roles` on `/reports/executive-summary`. |
| Create branch | ✅ OWNER+GM only. |
| Manage staff (create users) | ✅ `CAN_MANAGE_STAFF` extended to GM. |
| Delete user | ❌ code blocks delete of OWNER accounts only, but only OWNER can initiate (`src/users/users.service.ts:198-200`). |
| Open Safari Pulse / live monitor | ❌ OWNER-only island. |

### 4.5 Receipt photo audit (the distinctive GM power)

GM is one of only two roles (the other is OWNER) whose `GET /api/expenses`
response includes a non-null `receiptUrl` — allowing the "open receipt"
button to render. This is the mechanism that makes GM a real auditor of
driver spending, not just a reviewer of numbers.

### 4.6 حلقة المدير العام بالعربية

يهبط مباشرة على الجزيرة المالية → يرى صافي الربح ومصاريف الصابون/الوقود
المعتمدة والرواتب والمصاريف الثابتة → يعتمد/يرفض المصاريف مع فتح صورة
الإيصال للتحقق الشخصي → يراجع أكياس عُهدة المدراء → يُدير الفروع
والمستخدمين.

---

## Article 5 — The Owner's Loop / حلقة المالك

### 5.1 Mission

**EN.** The Owner is the final authority. He sees everything the GM sees,
**plus** Safari Pulse / Live Monitor (radar), **plus** the ability to
delete or dismiss any user.

**AR.** المالك هو السلطة النهائية. يرى كل ما يراه المدير العام، إضافة
إلى رادار "نبض سفاري" (Safari Pulse)، وصلاحية حذف أو إيقاف أي مستخدم.

### 5.2 Entry point

Same as GM: `/financials`. The difference is the tiny **Safari Pulse**
button in the executive header, gated by `RequireOwnerIsland`
(`web/src/App.tsx:90-97`).

### 5.3 Sidebar

Uses `defaultSidebarNavGroups`
(`web/src/modules/shared/nav/default-nav-config.ts`) — the fullest
sidebar in the system. Four groups: **Main** · **Operations** · **Finance**
· **System Settings**.

### 5.4 Owner overrides

- `SerialsController` — class-level `@Roles(OWNER, GENERAL_MANAGER)`;
  OWNER bypass is also hard-coded in `RolesGuard` (lines 35-38 of
  `src/auth/guards/roles.guard.ts`) so a new role list never accidentally
  locks the Owner out.
- User deletion: `DELETE /api/users/:id` — `src/users/users.service.ts:190-234`
  refuses to delete OWNER accounts and refuses any user that has financial
  references (use "deactivate" instead).

---

## Article 6 — The Call Center's Loop / حلقة مركز الاتصال

### 6.1 Mission

**EN.** The Call Center converts leads, books subscriptions, chases debts,
and operates WhatsApp outreach. They are customer-facing only; they never
see financial cards.

**AR.** مركز الاتصال يُحوّل العملاء المحتملين إلى مشتركين، يحجز
الاشتراكات، يُحصّل الديون، ويُدير التواصل عبر واتساب. يتعامل مع
العملاء فقط ولا يرى الأرقام المالية.

### 6.2 Sidebar (see Part IV)

- **Main** — Customers · Collections · Subscribers · WhatsApp Tools.
- **Driver Radar** — Driver Monitor (read-only map).

### 6.3 Core endpoints

- `GET /api/customers` · `POST /api/customers` · `PATCH /api/customers/:id`
  (customer CRUD, scoped).
- `POST /api/subscribers` · `POST /api/subscriptions` (onboard subscribers).
- `GET /api/call-center/operations-summary` — daily dashboard
  (`src/call-center/call-center.controller.ts`).
- `GET /api/call-center/debt-recovery-report` — overdue debts queue.

### 6.4 The 513 Standard (V19.2)

User `513` is the canonical CC template. All other CC users (e.g. user
`512`) MUST match 513's role, branch, active state, and job title. The
staging tool `scripts/sync-user-template.ts` enforces this — see
`docs/STAGING_V19_2.md` for the exact procedure.

Permissions model note: there are **no** per-user permission rows in the
schema. Permissions attach to `Role`, and all CC users share the same
`Role` row, so cloning `roleId` is sufficient to mirror permissions.

---

## Article 7 — Supervisor & Viewer / المراقب والمُطّلع

Both fall through `defaultSidebarNavGroups`. They have no write-side
endpoints beyond what the defaults grant (usually GET-only on reports,
orders, invoices). Use these for compliance observers or stakeholders
who need transparency without command authority.

---

# PART III — The Cash-Flow Constitution

## Article 8 — The Five Stages of the Kuwaiti Dinar

This is the **exact** path a 1 KD banknote takes from the customer's hand
to the Net Profit KPI on the Owner's Financial Island.

### Stage 1 — Customer → Driver (POS checkout)

- Event: driver calls `POST /api/pos/checkout` with `posPaymentMethod=CASH`.
- DB write: new `Order` row, `cashStatus=PAID_TO_DRIVER`.
- Ledger: `POS_SALE_COMPLETED` appended to `GeneralLedgerEntry`.
- Computed state: that 1 KD is now in the driver's **held cash**
  (`CashService.getDriverBalances`).

### Stage 2 — Driver → Branch Manager (physical handover)

- Trigger: Branch Manager clicks **اعتماد التسليم** per driver on
  `MyCustodyPage`.
- Event: `POST /api/manager-custody/approve-receipt`.
- DB writes (atomic transaction):
  1. `Order.cashStatus`: `PAID_TO_DRIVER` → `HANDED_OVER_TO_OFFICE`.
  2. `Shift.status`: `OPEN` → `CLOSED`, `closedAt=now()`, totals stamped.
  3. `ManagerCashCustody` row created, `status=PENDING_DEPOSIT`.
- State: the 1 KD is now on the Manager's books, awaiting a deposit slip.

### Stage 3 — Branch Manager → Bank (slip upload)

- Manager physically deposits the cash at the bank and photographs the slip.
- Event: `POST /api/manager-custody/:id/upload-slip-image` (multipart,
  field `file`, max 6 MB). File lands in `uploads/manager-custody-slips/`
  with UUID filename; URL like `/uploads/manager-custody-slips/<uuid>.jpg`.
- DB write: `ManagerCashCustody.depositSlipUrl` set,
  `slipUploadedAt=now()`, `status=AWAITING_VERIFICATION`.
- State: the 1 KD is physically in the bank but not yet auditor-verified.

### Stage 4 — Accountant verifies

- Event: `POST /api/manager-custody/:id/verify` (ACCOUNTANT only; OWNER
  bypass present).
- DB write: `status=VERIFIED`, `verifiedByAccountantId`, `verifiedAt`.
- Parallel: a `BankDepositLog(CASH_DEPOSIT_SLIP)` row may carry its own
  `verifiedByAccountantId` / `verifiedAt` for the bank-paperwork side.
- State: the 1 KD is **settled cash** in the system.

### Stage 5 — Net Profit realization (OWNER / GM view)

- Net profit does **not** read the custody table. It reads completed-order
  revenue:
  - `grossRevenueKd = Σ Order.totalPrice WHERE status=COMPLETED AND date∈[from,to]`
    (`src/reports/reports.service.ts:383-396`).
- Subtractions are applied in `netProfitExecutive` (Article 9).
- State: the 1 KD contributes to the amber **Exec Net** card on
  `/financials` (rendered `web/src/pages/financials-page.tsx:460-489`).

**Conceptual note:** Manager-custody verification is an **operational
control**, not an accounting subtraction. Revenue is recognized at Stage 1
(order completion), and the custody lifecycle exists to detect *missing*
cash between the driver and the bank.

---

## Article 9 — Net Profit Formula (exact, as implemented)

Source of truth: `src/reports/reports.service.ts:375-478`.

### 9.1 Executive formula (no `driverId` filter)

```
netProfitKd =
    grossRevenueKd
  − bankFeesTotalKd
  − variableSoapFuelKd          (= Σ approved BranchExpense WHERE category IN {SOAP, FUEL})
  − miscOperationalKd           (= Σ approved BranchExpense WHERE category = MISC)
  − payrollPaidKd               (= Σ Payroll.paidAmount in range)
  − fixedExpensesKd             (= Σ FixedExpenseSchedule.accrued in range)
```

Implemented via `decSubMany(grossRevenueKd, bankFeesTotalKd, variableSoapFuelKd, miscOperationalKd, payrollPaidKd, fixedExpensesKd)` — lines 446-453.

### 9.2 Driver-scoped formula (when `driverId` is supplied)

Payroll and fixed expenses are **forced to zero** (they're company-wide),
so:

```
netProfitKd =
    grossRevenueKd_for_that_driver
  − bankFeesTotalKd_for_that_driver
  − variableSoapFuelKd
  − miscOperationalKd
```

Lines 439-445.

### 9.3 Bank fees (KNET + card)

- Per-order: `computeOrderBankFeeKd` applies the V8.5 rule
  (`src/payment-method-fees/bank-fee.util.ts`):
  - **KNET** default: `max(0.100 KD, 1.5% of gross)` (per
    `PaymentMethodFeeConfig.knetRule = HIGHER_OF_FLAT_AND_PERCENT`).
  - **Card / link**: `2.5% of gross`.
  - CASH / wallet / debt / subscription wallet: 0.
- Aggregated by `aggregateBankFeesForCompletedOrders`
  (`reports.service.ts:316-368`).

### 9.4 What is **not** in the formula (by design)

- Subscription subsidy (computed for transparency, lines 427-432, but not
  subtracted from `netProfitKd`).
- Customer debt (tracked on `DebtLedgerEntry` / `CustomerWallet`; not a P&L line).
- `ManagerCashCustody` status (operational, not financial).

---

## Article 10 — The Receipt Lifecycle (Fuel/Soap)

### 10.1 What happens when the driver taps "Save receipt"

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHONE CAMERA                                                         │
│   └─ <input type="file" accept="image/*" capture="environment">      │
│        └─ FileReader.readAsDataURL()                                 │
│            └─ "data:image/jpeg;base64,/9j/4AAQSk…" (string in state) │
├──────────────────────────────────────────────────────────────────────┤
│ NETWORK                                                              │
│   POST /api/expenses                                                 │
│     body (JSON): { title, amount, category, receiptUrl: <dataURL>}   │
├──────────────────────────────────────────────────────────────────────┤
│ NESTJS BACKEND                                                       │
│   ExpensesController.create  →  ExpensesService.create               │
│     • Validates: CreateExpenseDto (receiptUrl ≤ 500_000 chars)       │
│     • Gates driver amount: computeDriverSpendableCash                │
│     • INSERT INTO "BranchExpense" (receiptUrl, status, …)            │
│         status = 'PENDING_ACCOUNTANT'                                │
│     • GeneralLedgerEntry.append('EXPENSE_RECORDED')                  │
├──────────────────────────────────────────────────────────────────────┤
│ POSTGRES                                                             │
│   BranchExpense.receiptUrl  (Text, full data URL in-DB)              │
├──────────────────────────────────────────────────────────────────────┤
│ READ SIDE (hours later)                                              │
│   ACCOUNTANT opens /expense-approval                                 │
│     GET /api/expenses/pending-approval  →  receiptUrl is raw string  │
│       <a href={receiptUrl} target="_blank">                          │
│         عرض الإيصال                                                  │
│       </a>                                                           │
│   ACCOUNTANT clicks "اعتماد"                                         │
│     PATCH /api/expenses/:id/status { status: "APPROVED" }            │
├──────────────────────────────────────────────────────────────────────┤
│ NET PROFIT                                                           │
│   netProfitExecutive  →  sumInRangeByCategories([SOAP, FUEL])        │
│     WHERE status = 'APPROVED'                                        │
│   Result subtracted in Article 9 formula                             │
│     → card "Exec Net" drops by the expense amount                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.2 Who sees the photo at each stage

| Stage | Role that triggers it | Role(s) that can open the photo |
|---|---|---|
| Upload (data URL in memory) | DRIVER | DRIVER (just before submit) |
| `PENDING_ACCOUNTANT` on queue | Accountant reviewing | ACCOUNTANT, OWNER, GM (backend doesn't gate on this query — Anomaly A) |
| `APPROVED` in list (`GET /api/expenses`) | — | OWNER, GM only (gated by `canSeeReceipt`) |
| `APPROVED` in financials drill | GM / OWNER clicks drill | OWNER, GM (same data) |
| `REJECTED` | — | OWNER, GM via filtered list |

### 10.3 Arabic: دورة حياة إيصال الوقود في جملتين

يصور السائق الإيصال من الكاميرا → يُحوَّل لـ data URL → يُرسَل JSON
إلى `POST /api/expenses` → يُخزَّن نصًّا في `BranchExpense.receiptUrl`
بحالة `PENDING_ACCOUNTANT` → يفتحه المحاسب من طابور الاعتماد ويضغط
**اعتماد** → يتحوّل إلى `APPROVED` → يدخل في معادلة صافي الربح بخصم
`variableSoapFuelKd` في `/financials`.

---

# PART IV — Role × Sidebar × Bottom-Nav Matrix

Source: `web/src/modules/shared/nav/resolve-sidebar-nav.ts` (dispatch) and
the per-role nav-config files. Bottom nav: `mobile-bottom-nav.tsx:63-86`.

## Legend

- 🏠 = landing page after login (from `IndexRoute` in `App.tsx`).
- Items listed in sidebar-group order, top-down.
- ⛔ = no bottom nav (full-screen shell).

---

## 4.1 OWNER

- 🏠 Landing: `/financials`.
- **Sidebar** (`default-nav-config.ts`):
  - **Main**: POS · Manage Items · Owner Inventory · Dashboard ·
    Customers · My Daily Sales · Collections · Subscriptions · Subscribers
    · Driver Monitor.
  - **Operations**: Invoices Data · Order Logs · Driver Shifts ·
    Sequence Management.
  - **Finance**: Financial Reports · K-Net Reconciliation ·
    Expense Approval · Financial Cycle Report · Managers' Held Cash ·
    Employee Debts · Debt Collection Report · Reports · Payroll ·
    Fixed Expenses · General Expenses.
  - **System Settings**: Branch Management · Users Management.
- **Mobile bottom nav** (4 tabs + More): Financials · Orders · Subscribers · Branches.
- **Extras**: Safari Pulse button in exec header (gated by `RequireOwnerIsland`).

## 4.2 GENERAL_MANAGER

- 🏠 Landing: `/financials` (same as OWNER).
- **Sidebar** (`general-manager/nav-config.ts`, Red-Line layout):
  - **Operations**: Invoices Data · Order Logs · Driver Shifts · Sequence Management.
  - **Finance & Reports**: Financial Reports · K-Net Reconciliation ·
    Expense Approval · Financial Cycle Report · Managers' Held Cash ·
    Employee Debts · Debt Collection Report · Reports · Payroll ·
    Fixed Expenses · General Expenses.
  - **System Settings**: Branch Management · Users Management.
- **Mobile bottom nav**: Financials · Orders · Subscribers · Branches (identical to Owner).
- **Extras**: no Safari Pulse access (Owner-only).

## 4.3 ACCOUNTANT

- 🏠 Landing: `/` → `DashboardPage`.
- **Sidebar** (`accountant/nav-config.ts`):
  - **Driver Radar**: Movement Logs · Unified Ledger · Driver Monitor · Driver Shifts.
  - **Audit**: K-Net Audit · Expense Approval · Managers' Held Cash · Employee Debts.
  - **Operations**: Invoices Data · Accountant Inventory · Stock In.
- **Mobile bottom nav**: Dashboard · Reports · Invoices Data · Expenses.
- **Dastur §2.2 constraint**: NO Safari Pulse / Financials / Net Profit visibility.

## 4.4 MANAGER (Branch Manager)

- 🏠 Landing: `/` → `DashboardPage`.
- **Sidebar** (`manager/nav-config.ts`):
  - **Main**: POS · Dashboard · Order Logs.
  - **Operations**: Driver Shifts.
  - **Finance**: Branch Expenses · **My Custody**.
- **Mobile bottom nav**: Dashboard · POS · Orders · My Custody.

## 4.5 DRIVER

- 🏠 Landing: `/pos`.
- **Sidebar** (`driver/nav-config.ts`):
  - **Main**: POS · My Deposits · My Daily Sales · Driver Pending Invoices.
  - **Field Costs**: My Field Expenses.
- **Mobile bottom nav**: ⛔ driver has no executive shell; full-screen POS
  with in-page actions.

## 4.6 CALL_CENTER

- 🏠 Landing: `/` → `DashboardPage` (CC-specific dashboard content).
- **Sidebar** (`call-center/nav-config.ts`):
  - **Main**: Customers · Collections · Subscribers · WhatsApp Tools.
  - **Driver Radar**: Driver Monitor (read-only).
- **Mobile bottom nav**: Customers · Collections · Subscribers · Subscriptions.

## 4.7 SUPERVISOR / VIEWER

- 🏠 Landing: `/` → `DashboardPage`.
- **Sidebar**: `defaultSidebarNavGroups` filtered by each item's `roles`
  list (most write-side items drop out naturally).
- **Mobile bottom nav**: Dashboard · Orders · Reports · Invoices Data.

---

# PART V — Technical Annexes

## Annex A — State machines

### A.1 `Shift.status` — `prisma/schema.prisma:45-48`

```
OPEN ──(manager approve-receipt OR Kuwait-midnight rollover)──▶ CLOSED
```

### A.2 `Order.cashStatus` — `prisma/schema.prisma:39-43`

```
UNPAID ──(POS checkout w/ payment)──▶ PAID_TO_DRIVER
PAID_TO_DRIVER ──(manager approve-receipt)──▶ HANDED_OVER_TO_OFFICE
```

### A.3 `ManagerCashCustodyStatus` — `prisma/schema.prisma:107-112`

```
PENDING_DEPOSIT ──(manager upload slip)──▶ AWAITING_VERIFICATION
AWAITING_VERIFICATION ──(accountant verify)──▶ VERIFIED     (terminal)
AWAITING_VERIFICATION ──(accountant reject)──▶ REJECTED
REJECTED ──(manager re-upload slip)──▶ AWAITING_VERIFICATION
```

### A.4 `ExpenseStatus` — `prisma/schema.prisma:176-181`

```
PENDING_ACCOUNTANT ──(approve)──▶ APPROVED      (enters net profit)
PENDING_ACCOUNTANT ──(reject)──▶  REJECTED
PENDING_ACCOUNTANT ──(park)──▶    AUDIT         (does NOT enter net profit)
```

### A.5 `DepositStatus` (`Deposit` table, driver self-service queue)

```
PENDING ──(accountant patch)──▶ APPROVED | REJECTED
```

## Annex B — Money-bearing tables

| Table | Primary money column(s) | Status column | Audit fields |
|---|---|---|---|
| `Order` | `totalPrice` | `status`, `cashStatus` | `completedAt`, `driverId`, `posPaymentMethod` |
| `OrderLineItem` | `unitPrice`, `quantity`, `subtotal` | — | — |
| `Shift` | `totals` struct | `status` | `openedAt`, `closedAt`, `bankDepositReceiptUrl` |
| `ManagerCashCustody` | `amountKd`, `settledOrderCount` | `status` | `verifiedBy*`, `rejectedBy*`, `slipUploadedAt` |
| `BankDepositLog` | `amountKd` | (implied by `verifiedAt`) | `verifiedByAccountantId` |
| `Deposit` | `amount` | `status` | `receiptImage` |
| `BranchExpense` | `amount` | `status` | `recordedById`, `receiptUrl`, `category`, `expenseMethod` |
| `Payroll` | `grossSalary`, `paidAmount` | implicit | `periodStart`, `periodEnd`, `paidAt` |
| `FixedExpenseSchedule` | `monthlyAmount` | implicit | `activeFrom`, `activeTo` |
| `Wallet` | branch-level cash/bank pool | — | — |
| `CustomerWallet` | `balance` | — | `updatedAt` |
| `TransactionHistory` | `amount` | — | `performedById`, `kind` |
| `DebtLedgerEntry` | `amount` | implicit by kind | `actorId` |
| `GeneralLedgerEntry` | `amount` | (append-only) | `kind`, `actorId`, `createdAt` |
| `PaymentMethodFeeConfig` | parameters (not a ledger) | — | — |

## Annex C — Known anomalies & suggested follow-ups

(Cross-reference of §1.3 with recommended actions. Severity High > Medium > Low.)

1. **Anomaly A** (Medium) — Apply `canSeeReceipt` to
   `ExpensesService.listPendingApproval` so ACCOUNTANT does not receive
   the raw receipt string on that endpoint. Mitigation: ACCOUNTANT still
   needs *some* view of the photo to do their job; consider returning a
   short-lived signed URL instead of the full data URL.
2. **Anomaly B** (Low) — Add a server-side guard in
   `ExpensesService.updateStatus`: if `category IN {SOAP, FUEL}` and
   `receiptUrl` is null, reject the transition to `APPROVED`.
3. **Anomaly C + D** (Medium) — Update `canView` on
   `manager-custody-aging-page.tsx:83` and `bank-deposits-page.tsx:53` to
   include `GENERAL_MANAGER` so UI reflects the backend grant.
4. **Anomaly E** (Medium) — Either (a) treat `AUDIT` as a pending state
   in the financials drill so totals reconcile, or (b) include `AUDIT` in
   `sumInRangeByCategories` if the Owner's intent is that `AUDIT` just
   means "approved but flagged for review". Decision required.
5. **Anomaly F** (Low) — Return the stored `receiptUrl` on
   `ExpensesService.create` response so the driver's UI can confirm the
   upload landed.
6. **Anomaly G** (design debt, Low) — Migrate
   `BranchExpense.receiptUrl` from in-DB data URL to object storage
   (same pattern as manager-custody slips: `/uploads/expense-receipts/<uuid>.jpg`).
7. **Anomaly H** (Documentation, resolved here) — This Constitution is the
   canonical explanation of the two deposit concepts. No code change.

---

# خاتمة / Closing Note

This Constitution is a **living document**. It is versioned with the code
(V19.2 at time of writing). Any change to a `@Roles` decorator, a sidebar
nav-config, a cash-flow state machine, or the `netProfitExecutive` formula
must be reflected here in the same commit.

The Owner's guiding principle — "العين الثانية" (the Second Eye) — is
codified in:
- `src/expenses/expenses.service.ts:184-192` (receipt photo visibility),
- `src/reports/reports.controller.ts:116-129` (executive summary access),
- `web/src/modules/general-manager/nav-config.ts` (Red-Line sidebar),
- `web/src/App.tsx:55-60` (landing redirect).

When the audit finds a new anomaly, add it to §1.3 / Annex C before
patching — so the forensic trail lives alongside the fix.

— **End of Constitution** —
