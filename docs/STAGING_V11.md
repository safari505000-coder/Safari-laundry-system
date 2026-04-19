# Staging / demo deployment (V11.0)

This document supports a **prototype staging** rollout: financial reporting (V8.5 bank commission), seeded catalog + fee config, and verification of the Executive Summary **Bank fees** card.

## What is already in the application

- **V8.5 bank commission** — `computeOrderBankFeeKd` feeds `ReportsService.netProfitExecutive` / `aggregateBankFeesForCompletedOrders`. Executive Summary exposes `bankFeesTotalKd`; the UI shows the violet **Bank fees** / **عمولات البنك** card on **Reports** (not Owner-only; it appears for all roles that can open Reports).
- **Payment fee defaults** — Canonical values live in `src/payment-method-fees/canonical-payment-fee-config.ts` (KNET flat 0.100 KD, 1.5% higher-of rule, card/link 2.5%). Seeds and `PaymentMethodFeesService.ensureDefaultRow()` use the same numbers on **create**.

## Pause Cloud Storage on staging

Set **`STORAGE_DRIVER=local`** (see `deploy/staging.env.example`). Receipt uploads and optional local backup files stay under `./uploads`. Do not set `GOOGLE_APPLICATION_CREDENTIALS` on staging unless you are explicitly testing GCS.

## Build and database

From the repo root (with `DATABASE_URL` pointing at the **staging** database):

```bash
npm ci
npx prisma migrate deploy
npx prisma db seed
```

- Seed applies **roles/users**, **canonical payment fees** (unless the row already exists and you did not force reset), and the **full master laundry tariff** (`prisma/price-list-seed.ts`). The seed log prints how many **price-list rows** were synchronized (currently the full `ROWS` array length).

### Wipe all data and re-seed (destructive)

Use only on a **disposable** staging database:

```bash
npx prisma migrate reset --force
```

That drops all tables, reapplies migrations (including the default `PaymentMethodFeeConfig` row), then runs `prisma db seed`.

### Re-align payment fees without full reset

If staging already has a `default` fee row with wrong numbers:

```bash
# POSIX
SEED_FORCE_CANONICAL_FEES=true npx prisma db seed
```

```powershell
# Windows PowerShell
$env:SEED_FORCE_CANONICAL_FEES="true"; npx prisma db seed; Remove-Item Env:SEED_FORCE_CANONICAL_FEES
```

Then unset the variable for normal runs so Owner-tuned fees on production are not overwritten by routine seeds (your production `update: {}` path remains the default when this env is unset).

## Web build

```bash
npm run web:build
```

Serve `web/dist` and the API per your host (same origin is typical; see `web/.env.example` for `VITE_API_URL` if split).

## Staging URL for the Owner

The **live staging URL is not stored in git** — it depends on your host (e.g. Render **Service URL**, custom subdomain, or VPS IP/DNS). After deploy, copy the HTTPS origin you assigned into `CORS_ORIGIN`, `PUBLIC_WEB_APP_URL`, and related vars, redeploy if needed, then give Abu Mohammed:

`https://<your-staging-host>/`  
(Login defaults from `prisma/seed.ts`: username `admin`, password `admin` unless you changed them.)

## Reports check — Bank fees card

1. Sign in as a role that can open **Reports** (e.g. OWNER, ACCOUNTANT, MANAGER).
2. Open **Reports** and ensure the date range includes **today** (default usually does).
3. In the **Executive summary** strip, confirm the second card title **Bank fees** (EN) or **عمولات البنك** (AR) and a KD amount (often **0.000** if there are no completed KNET/link orders in range).

To see a non-zero value, complete a test order with **KNET** or **payment link** in the selected window.
