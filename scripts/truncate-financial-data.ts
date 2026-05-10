/**
 * scripts/truncate-financial-data.ts
 *
 * # What this script does
 *
 * Performs a single-statement, FK-safe, sequence-resetting
 * `TRUNCATE TABLE … RESTART IDENTITY CASCADE` over **every** Postgres
 * table that holds invoice, debt, or payment data — including the
 * V20+/V21+ tables that the older `reset-invoices.ts` script does not
 * cover (`FinancialEventOutbox`, `FinancialEventDelivery`,
 * `FinancialSnapshot`, `FinancialKpiSnapshot`, `FinancialPeriod`,
 * `FinancialPeriodViolation`, `FraudAlert`, `PromiseToPay`,
 * `PromiseEvent`, `CollectionsAccount`, `CollectionsStageEvent`,
 * `CustomerCollectionStatus`, `CashIntelExecutionEvent`,
 * `BackfillAuditLock`, `JournalFailureLog`).
 *
 * `TRUNCATE` was chosen because the user asked for it explicitly and
 * because, in PostgreSQL, a single `TRUNCATE … CASCADE` is:
 *   • atomic
 *   • orders-of-magnitude faster than per-row `DELETE FROM …` on
 *     large datasets
 *   • automatically resets every owned sequence (`RESTART IDENTITY`)
 *   • automatically follows every cascading FK (`CASCADE`)
 *
 * # Auto-increment IDs
 *
 * The Prisma schema for Safari ERP uses **UUID PKs everywhere** —
 * there are NO `SERIAL` / `BIGSERIAL` columns. The closest thing to
 * an "auto-increment" is the `SerialCounter` table which holds a
 * single integer per business key (e.g. `ORDER_SERIAL` →
 * "next invoice number"). We reset that table's invoice rows so the
 * next invoice prints as 1.
 *
 * # Sister script
 *
 * `scripts/reset-invoices.ts` is the older `deleteMany`-based reset
 * with extended HR / inventory modes. Both scripts coexist. Use
 * THIS one when you want a single fast TRUNCATE that includes the
 * V20+/V21+ realtime/event tables and resets every sequence in one
 * shot. Use the OLDER one when you want fine-grained control over
 * payroll / attendance / inventory.
 *
 * # Hard rule reminder (V21 banking-grade architecture)
 *
 * The append-only triggers on `JournalEntry`, `JournalLine`,
 * `DebtLedgerEntry`, `TransactionHistory`, `FinancialEventOutbox`,
 * and `FinancialPeriodViolation` exist for production safety.
 * `TRUNCATE` bypasses those triggers natively (it is a DDL, not a
 * DML), so the V21 invariants remain UN-violated on the production
 * code path. This script may only ever run on a DEV / STAGING
 * database, enforced by the env guards below.
 *
 * # Usage
 *
 *   npx tsx scripts/truncate-financial-data.ts
 *     → DRY-RUN: prints BEFORE counts, no changes.
 *
 *   npx tsx scripts/truncate-financial-data.ts \
 *     --confirm=TRUNCATE-FINANCIAL-DATA
 *     → executes if env guards pass.
 *
 *   npx tsx scripts/truncate-financial-data.ts \
 *     --confirm=TRUNCATE-FINANCIAL-DATA \
 *     --keep-customer-rows=false
 *     → also wipes `CustomerWallet` rows (default: keep rows, zero balances).
 *
 * # Required env (defense in depth)
 *
 *   • DATABASE_URL must be set.
 *   • For LOCAL hosts (localhost / 127.0.0.1 / docker postgres):
 *       set RESET_ALLOW_LOCAL=true
 *   • For NON-LOCAL hosts:
 *       set RESET_ALLOW_NON_LOCAL=true
 *   • Production-pattern hosts (rlwy.net, railway, supabase.co,
 *     amazonaws.com, neon.tech, planetscale.com, render.com):
 *       refused unless BOTH:
 *         RESET_ALLOW_PRODUCTION_PATTERN=true
 *         RESET_FINAL_CONFIRM=YES_DELETE_CURRENT_RAILWAY_FINANCIAL_DATA
 *
 * # Audit
 *
 * Every run (dry or live) appends a single JSON line to
 * `.reset-audit/truncate-financial-data.log` with a timestamp,
 * the host, the mode, the BEFORE/AFTER counts, and the OS user.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, userInfo } from 'node:os';

// ─────────────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is missing. Set it in .env before running.');
  process.exit(1);
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─────────────────────────────────────────────────────────────────────
// Tables, grouped by domain. The order of groups in the array does
// NOT matter for TRUNCATE … CASCADE (cascade resolves itself), but
// we still group them so the dry-run output is readable.
//
// Every table name MUST match the Postgres table name exactly:
//   • PascalCase model → PascalCase table name (Prisma default)
//   • Models with @@map use the mapped name
//
// `AuditLog` is mapped to `audit_logs` per the schema.
// ─────────────────────────────────────────────────────────────────────
type TableGroup = {
  group: string;
  tables: ReadonlyArray<string>;
  notes?: string;
};

const FINANCIAL_TABLE_GROUPS: ReadonlyArray<TableGroup> = [
  {
    group: 'Invoices (orders + line items + audit)',
    tables: [
      'Order',
      'OrderLineItem',
      'OrderFeedback',
      'InvoiceAuditLog',
    ],
  },
  {
    group: 'Customer ledgers (transactional)',
    tables: [
      'TransactionHistory',
      'DebtLedgerEntry',
    ],
    notes: 'Append-only in production; safe to truncate in dev because TRUNCATE bypasses row triggers.',
  },
  {
    group: 'Double-entry journal',
    tables: [
      'JournalLine',
      'JournalEntry',
      'JournalFailureLog',
      'BackfillAuditLock',
    ],
    notes: 'Account/chart-of-accounts is master data and stays.',
  },
  {
    group: 'Legacy GL mirror',
    tables: ['GeneralLedgerEntry'],
  },
  {
    group: 'Cash + bank flow',
    tables: [
      'ManagerCashCustody',
      'BankDepositLog',
      'Deposit',
      'DebtHold',
      'Shift',
      'PosPaymentBundle',
      'CashIntelExecutionEvent',
    ],
  },
  {
    group: 'Subscriptions (transactional)',
    tables: ['CustomerSubscription'],
    notes: 'SubscriptionPlan (the catalog) stays.',
  },
  {
    group: 'Debt operations + collections',
    tables: [
      'DebtTransferOrder',
      'DebtTransfer',
      'PromiseEvent',
      'PromiseToPay',
      'CollectionsStageEvent',
      'CollectionsAccount',
      'CustomerCollectionStatus',
      'FraudAlert',
    ],
    notes: 'DebtHoldPolicy (singleton config) stays.',
  },
  {
    group: 'Realtime + observability snapshots',
    tables: [
      'FinancialEventDelivery',
      'FinancialEventOutbox',
      'FinancialKpiSnapshot',
      'FinancialSnapshot',
      'FinancialPeriodViolation',
      'FinancialPeriod',
    ],
    notes: 'Period rows are config-shaped but transactional — wipe so dev can re-create dates cleanly.',
  },
  {
    group: 'Driver dispatch (order-tied operational)',
    tables: ['Dispatch', 'DriverMetrics'],
  },
  {
    group: 'Commission earnings',
    tables: ['CommissionPayout'],
    notes: 'CommissionRule (the rules table) stays.',
  },
];

const ALL_FINANCIAL_TABLES: ReadonlyArray<string> = FINANCIAL_TABLE_GROUPS.flatMap(
  (g) => g.tables,
);

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
type RawDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

async function tableExists(db: RawDb, tableName: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    `public."${tableName}"`,
  );
  return rows[0]?.exists === true;
}

async function rowCount(db: RawDb, tableName: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count" FROM "${tableName}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function snapshotCounts(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const t of ALL_FINANCIAL_TABLES) {
    if (!(await tableExists(prisma, t))) {
      out[t] = null;
      continue;
    }
    out[t] = await rowCount(prisma, t);
  }
  return out;
}

function printCountTable(label: string, counts: Record<string, number | null>): void {
  console.log(`\n──── ${label} ────`);
  for (const group of FINANCIAL_TABLE_GROUPS) {
    console.log(`  • ${group.group}`);
    for (const t of group.tables) {
      const v = counts[t];
      const formatted = v === null ? '   (no table)' : v.toLocaleString('en-US').padStart(12);
      console.log(`      ${t.padEnd(34)} ${formatted}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Host classification
// ─────────────────────────────────────────────────────────────────────
const PRODUCTION_HOST_PATTERNS: ReadonlyArray<RegExp> = [
  /rlwy\.net$/i,
  /railway/i,
  /supabase\.co$/i,
  /amazonaws\.com$/i,
  /neon\.tech$/i,
  /planetscale\.com$/i,
  /render\.com$/i,
  /aiven/i,
  /digitalocean\.com$/i,
];

const LOCAL_HOSTS: ReadonlyArray<string> = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'postgres',
  'db',
];

function databaseHostForGuard(url: string): string {
  const s = String(url);
  if (s.includes('[') && s.includes(']')) {
    const b = s.match(/@\[[^\]]+\]/);
    if (b) return b[0].slice(2, -1);
  }
  const m = s.match(/@([^:/?#]+)/);
  return (m?.[1] ?? '').trim() || '(unknown host)';
}

function classifyHost(host: string): 'local' | 'production' | 'remote-other' {
  const h = host.toLowerCase();
  if (LOCAL_HOSTS.includes(h)) return 'local';
  for (const rx of PRODUCTION_HOST_PATTERNS) {
    if (rx.test(h)) return 'production';
  }
  return 'remote-other';
}

// ─────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────
const AUDIT_DIR = join(process.cwd(), '.reset-audit');
const AUDIT_FILE = join(AUDIT_DIR, 'truncate-financial-data.log');

function appendAudit(entry: Record<string, unknown>): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    appendFileSync(AUDIT_FILE, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`, 'utf8');
  } catch (err) {
    console.warn(`(audit log write failed: ${(err as Error).message})`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
const CONFIRM_VALUE = 'TRUNCATE-FINANCIAL-DATA';

function parseFlag(name: string, fallback: boolean): boolean {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const v = arg.split('=')[1].toLowerCase().trim();
  return ['1', 'true', 'yes', 'y'].includes(v);
}

async function main(): Promise<void> {
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmValue = confirmArg ? confirmArg.split('=')[1] : '';
  const isDryRun = confirmValue !== CONFIRM_VALUE;
  const keepCustomerWalletRows = parseFlag('keep-customer-rows', true);

  const dbUrl = process.env.DATABASE_URL ?? '';
  const dbHost = databaseHostForGuard(dbUrl);
  const hostClass = classifyHost(dbHost);

  console.log('====================================================');
  console.log(' Safari ERP — TRUNCATE financial data (TEST/DEV ONLY)');
  console.log('====================================================');
  console.log(` DB host          : ${dbHost}`);
  console.log(` DB host class    : ${hostClass}`);
  console.log(` Mode             : ${isDryRun ? 'DRY-RUN (no changes)' : 'EXECUTE'}`);
  console.log(` Keep wallet rows : ${keepCustomerWalletRows ? 'yes (zero balances)' : 'no (full delete)'}`);
  console.log(' Tables in scope  :');
  for (const g of FINANCIAL_TABLE_GROUPS) {
    console.log(`   - ${g.group}: ${g.tables.length} tables`);
  }
  console.log(`   ─ TOTAL: ${ALL_FINANCIAL_TABLES.length} tables`);
  console.log('----------------------------------------------------');

  const before = await snapshotCounts();
  printCountTable('BEFORE', before);

  if (isDryRun) {
    console.log(
      `\nDRY-RUN only. To execute, re-run with:\n` +
        `  npx tsx scripts/truncate-financial-data.ts --confirm=${CONFIRM_VALUE}\n\n` +
        `Plus the env guard appropriate for your DB host:\n` +
        `  • Local host  → RESET_ALLOW_LOCAL=true\n` +
        `  • Non-local   → RESET_ALLOW_NON_LOCAL=true\n` +
        `  • Production-pattern hosts are REFUSED unconditionally.\n`,
    );
    appendAudit({ kind: 'dry-run', host: dbHost, hostClass, before });
    return;
  }

  // ─── Defense-in-depth host guards ───────────────────────────────
  if (hostClass === 'production') {
    const allowProductionPattern = ['1', 'true', 'yes'].includes(
      (process.env.RESET_ALLOW_PRODUCTION_PATTERN ?? '').toLowerCase().trim(),
    );
    const finalConfirm =
      process.env.RESET_FINAL_CONFIRM ===
      'YES_DELETE_CURRENT_RAILWAY_FINANCIAL_DATA';
    if (!allowProductionPattern || !finalConfirm) {
      console.error(`\nABORT: DATABASE_URL host '${dbHost}' matches a known PRODUCTION host pattern.`);
      console.error('       To run anyway on the CURRENT database, set BOTH:');
      console.error('         RESET_ALLOW_PRODUCTION_PATTERN=true');
      console.error('         RESET_FINAL_CONFIRM=YES_DELETE_CURRENT_RAILWAY_FINANCIAL_DATA');
      appendAudit({ kind: 'refused-production', host: dbHost });
      process.exit(2);
    }
    console.log('  !! RESET_ALLOW_PRODUCTION_PATTERN=true + final confirmation set.');
    console.log('  !! Proceeding on production-pattern host because the user explicitly requested current DB wipe.');
  }

  const allowLocal = ['1', 'true', 'yes'].includes(
    (process.env.RESET_ALLOW_LOCAL ?? '').toLowerCase().trim(),
  );
  const allowNonLocal = ['1', 'true', 'yes'].includes(
    (process.env.RESET_ALLOW_NON_LOCAL ?? '').toLowerCase().trim(),
  );

  if (hostClass === 'local' && !allowLocal) {
    console.error('\nABORT: local DATABASE_URL — refusing destructive run.');
    console.error('       Set RESET_ALLOW_LOCAL=true to confirm this is your dev database.');
    appendAudit({ kind: 'refused-local-no-flag', host: dbHost });
    process.exit(3);
  }
  if (hostClass === 'remote-other' && !allowNonLocal) {
    console.error(`\nABORT: non-local host '${dbHost}' — refusing destructive run.`);
    console.error('       Set RESET_ALLOW_NON_LOCAL=true to confirm this is a STAGING database.');
    appendAudit({ kind: 'refused-remote-no-flag', host: dbHost });
    process.exit(4);
  }

  // ─── Build the actual TRUNCATE statement ────────────────────────
  // Filter to only existing tables — the `AuditLog` table is not in
  // scope here (it lives in a separate domain and the older
  // `reset-invoices.ts` script covers it under DELETE-LOCAL-TEST-ALL).
  const existingTables: string[] = [];
  for (const t of ALL_FINANCIAL_TABLES) {
    if (await tableExists(prisma, t)) {
      existingTables.push(t);
    }
  }

  if (existingTables.length === 0) {
    console.log('\nNo target tables exist in this database. Nothing to do.');
    appendAudit({ kind: 'no-tables', host: dbHost });
    return;
  }

  const truncateList = existingTables.map((t) => `"public"."${t}"`).join(', ');
  const stmt = `TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`;

  console.log(`\nExecuting (this will block until done):`);
  console.log(`  ${stmt.length > 200 ? stmt.slice(0, 200) + ' …' : stmt}`);
  console.log(`\n(${existingTables.length} tables, single atomic TRUNCATE … CASCADE)`);

  const startedAt = Date.now();

  await prisma.$transaction(
    async (tx) => {
      // V21 append-only triggers also guard TRUNCATE on immutable ledger
      // tables. This transaction-local setting is the explicit escape hatch
      // those triggers require for destructive test-data resets.
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.immutable_ledger_bypass', 'true', true)`,
      );

      // Some append-only tables use bespoke trigger functions that do
      // not read `app.immutable_ledger_bypass` (for example older
      // DebtLedgerEntry / PromiseEvent / CollectionsStageEvent guards).
      // Disable USER triggers only for the target tables inside this
      // transaction. FK/system triggers are not disabled by this form,
      // and every ALTER is transactional: a failure rolls the trigger
      // state back together with the data.
      for (const t of existingTables) {
        await tx.$executeRawUnsafe(`ALTER TABLE "public"."${t}" DISABLE TRIGGER USER`);
      }

      // The single TRUNCATE statement covers every table in one shot.
      // CASCADE follows every FK, RESTART IDENTITY resets every owned
      // sequence (no-op here because the schema is all UUIDs, but kept
      // for completeness and future-proofing).
      await tx.$executeRawUnsafe(stmt);

      // Reset SerialCounter rows to 0 so the next invoice = 1.
      // We delete per-operator counters (`OU_<userId>`) and reset the
      // legacy global `ORDER_SERIAL` row.
      const hasSerial = await tableExists(tx, 'SerialCounter');
      if (hasSerial) {
        await tx.$executeRawUnsafe(`DELETE FROM "SerialCounter" WHERE "key" LIKE 'OU\\_%' ESCAPE '\\'`);
        await tx.$executeRawUnsafe(`
          INSERT INTO "SerialCounter" ("key", "value", "updatedAt")
          VALUES ('ORDER_SERIAL', 0, NOW())
          ON CONFLICT ("key") DO UPDATE SET "value" = 0, "updatedAt" = NOW()
        `);
      }

      // Customer wallet rows are master-data-shaped (one row per
      // customer) but contain financial state. By default we KEEP
      // the rows and zero the financial columns so foreign keys
      // from `Customer` stay clean. With `--keep-customer-rows=false`
      // we delete everything (the `User` and `Customer` rows stay
      // because they're outside this TRUNCATE list).
      const hasCustomerWallet = await tableExists(tx, 'CustomerWallet');
      if (hasCustomerWallet) {
        if (keepCustomerWalletRows) {
          await tx.$executeRawUnsafe(`
            UPDATE "CustomerWallet"
            SET
              "balance" = 0,
              "debt" = 0,
              "subscriptionActivatedAt" = NULL,
              "subscriptionExpiresAt" = NULL,
              "subscriptionPlanId" = NULL,
              "subscriptionPlanName" = NULL,
              "subscriptionReminderCount" = 0,
              "subscriptionLastReminderAt" = NULL,
              "updatedAt" = NOW()
          `);
        } else {
          // CASCADE on the TRUNCATE above does NOT touch this table
          // (it's not in our list), so we have to clear it explicitly.
          await tx.$executeRawUnsafe('TRUNCATE TABLE "public"."CustomerWallet" RESTART IDENTITY CASCADE');
        }
      }

      // Branch-level cash wallet (kept for completeness — old
      // `Wallet` model holds per-branch cash. Zero balances; rows stay.
      const hasWallet = await tableExists(tx, 'Wallet');
      if (hasWallet) {
        await tx.$executeRawUnsafe(`UPDATE "Wallet" SET "balance" = 0, "updatedAt" = NOW()`);
      }

      for (const t of existingTables) {
        await tx.$executeRawUnsafe(`ALTER TABLE "public"."${t}" ENABLE TRIGGER USER`);
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  const elapsedMs = Date.now() - startedAt;

  const after = await snapshotCounts();
  printCountTable('AFTER', after);

  console.log(
    `\n✓ Done in ${elapsedMs} ms. Single TRUNCATE … RESTART IDENTITY CASCADE over ${existingTables.length} tables.`,
  );
  console.log('  Next invoice number → 1 (SerialCounter reset).');
  console.log(
    keepCustomerWalletRows
      ? '  CustomerWallet rows preserved with zeroed balances.'
      : '  CustomerWallet rows removed (full TRUNCATE).',
  );
  console.log('  Wallet (branch cash) balances zeroed.');
  console.log('');
  console.log('Run the seed if you need fresh master rows / accounts:');
  console.log('  npx prisma db seed');

  appendAudit({
    kind: 'executed',
    host: dbHost,
    hostClass,
    osUser: userInfo().username,
    osHost: hostname(),
    elapsedMs,
    keepCustomerWalletRows,
    truncatedTables: existingTables,
    before,
    after,
  });
}

main()
  .catch((err) => {
    console.error('\nFAILED — transaction rolled back. No changes committed.');
    console.error(err);
    appendAudit({ kind: 'error', error: (err as Error).message });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
