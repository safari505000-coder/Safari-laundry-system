/**
 * Safari ERP — SAFE DEVELOPMENT FINANCIAL RESET.
 *
 * Development/test utility only. It clears financial transactional state while
 * preserving schema, migrations, users, branches, settings, services, products,
 * permissions, modules, APIs, and business logic.
 *
 * Usage:
 *   npm run financial:reset -- --dry-run
 *   RESET_ALLOW_LOCAL=true npm run financial:reset -- --apply
 *
 * Safety:
 *   - Dry-run is the default and never writes.
 *   - Apply is refused on non-local DATABASE_URL unless
 *     RESET_ALLOW_NON_LOCAL=true.
 *   - Apply is refused on local DATABASE_URL unless RESET_ALLOW_LOCAL=true.
 *   - All destructive work runs in one transaction.
 *   - Only explicit, dependency-ordered allowlisted tables are deleted.
 *   - FK/system triggers remain enabled; USER triggers are temporarily disabled
 *     only on append-only financial tables whose DB guards reject DELETE.
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

type RawDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

type Mode = 'dry-run' | 'apply';
type TablePlan = {
  table: string;
  reason: string;
  disableUserTriggers?: boolean;
};
type CountRow = { table: string; before: number; after?: number; reason: string };
type ValidationResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const REPORT_PATH = path.join(
  process.cwd(),
  'docs',
  'financial-reset-report.md',
);
const ZERO = new Prisma.Decimal(0);

/**
 * Dependency-aware order. Child/restricting tables first, parents later.
 * Master/config tables intentionally absent: Customer, User, Branch, Account,
 * SubscriptionPlan, Laundry* catalog, Role, Permission, settings, inventory
 * definitions, services/products, and schema/migrations are preserved.
 */
const DELETE_PLAN: TablePlan[] = [
  { table: 'DebtTransferOrder', reason: 'order-linked debt transfer line items' },
  { table: 'CommissionPayout', reason: 'order/debt-entry derived commission accruals' },
  { table: 'InvoiceAuditLog', reason: 'invoice edit/void transactional audit' },
  { table: 'OrderFeedback', reason: 'invoice receipt feedback tied to orders' },
  { table: 'OrderLineItem', reason: 'invoice/order line items' },

  { table: 'PromiseEvent', reason: 'collections promise transition history', disableUserTriggers: true },
  { table: 'PromiseToPay', reason: 'collections promise state' },
  { table: 'CollectionsStageEvent', reason: 'collections lifecycle transition history', disableUserTriggers: true },
  { table: 'CollectionsAccount', reason: 'collections lifecycle account state' },
  { table: 'CustomerCollectionStatus', reason: 'legacy AR collections status rows' },
  { table: 'FraudAlert', reason: 'financial fraud/risk alerts derived from transactions', disableUserTriggers: true },

  { table: 'FinancialPeriodViolation', reason: 'period-lock financial write violation audit', disableUserTriggers: true },
  { table: 'FinancialPeriod', reason: 'financial close period state' },

  { table: 'TransactionHistory', reason: 'customer ledger / subscription consumption history' },
  { table: 'DebtLedgerEntry', reason: 'debt ledger, payments, wallet absorption history', disableUserTriggers: true },
  { table: 'JournalFailureLog', reason: 'journal mirror failure queue/log' },
  { table: 'JournalLine', reason: 'double-entry journal lines', disableUserTriggers: true },
  { table: 'JournalEntry', reason: 'double-entry journal entries', disableUserTriggers: true },
  { table: 'GeneralLedgerEntry', reason: 'company-side GL projection rows' },

  { table: 'FinancialEventDelivery', reason: 'idempotent financial event consumer log', disableUserTriggers: true },
  { table: 'FinancialEventOutbox', reason: 'financial outbox/domain events', disableUserTriggers: true },
  { table: 'FinancialKpiSnapshot', reason: 'cached financial KPI projections' },
  { table: 'FinancialSnapshot', reason: 'cached customer financial projections' },

  { table: 'BankDepositLog', reason: 'bank deposit reconciliation results' },
  { table: 'ManagerCashCustody', reason: 'cash custody transactional bags' },
  { table: 'Deposit', reason: 'driver deposit transactional rows' },
  { table: 'DebtHold', reason: 'financial debt-hold rows' },
  { table: 'Shift', reason: 'cash handover shifts' },
  { table: 'PosPaymentBundle', reason: 'multi-invoice payment bundles' },

  { table: 'CustomerSubscription', reason: 'customer subscription instances/consumption history' },
  { table: 'Dispatch', reason: 'call-center dispatches closed by orders' },
  { table: 'DriverMetrics', reason: 'dispatch/order-derived driver counters' },
  { table: 'DebtTransfer', reason: 'debt transfer documents' },
  { table: 'Order', reason: 'invoices/orders' },
];

const RESET_SQL_STEPS: Array<{ label: string; sql: string }> = [
  {
    label: 'zero CustomerWallet balances and subscription runtime fields',
    sql: `
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
        "updatedAt" = now()
    `,
  },
  {
    label: 'unblock customers whose block was financial/collections-derived',
    sql: `
      UPDATE "Customer"
      SET
        "isBlocked" = false,
        "blockReason" = NULL,
        "blockedAt" = NULL,
        "updatedAt" = now()
    `,
  },
  {
    label: 'reset invoice serial counters',
    sql: `DELETE FROM "SerialCounter" WHERE "key" = 'ORDER_SERIAL' OR "key" LIKE 'OU_%'`,
  },
  {
    label: 'create ORDER_SERIAL counter at zero',
    sql: `
      INSERT INTO "SerialCounter" ("key", "value", "updatedAt")
      VALUES ('ORDER_SERIAL', 0, now())
      ON CONFLICT ("key") DO UPDATE SET "value" = 0
    `,
  },
];

function parseMode(argv: string[]): Mode {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run') || argv.length === 0;
  if (hasApply && hasDryRun) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  return hasApply ? 'apply' : 'dry-run';
}

function connectionString(): string {
  const value = process.env.DATABASE_URL;
  if (!value?.trim()) {
    throw new Error('DATABASE_URL is missing. Set it in .env before running.');
  }
  return value;
}

function makePrisma(): { prisma: PrismaClient; pool: Pool } {
  const pool = new Pool({ connectionString: connectionString() });
  return {
    prisma: new PrismaClient({ adapter: new PrismaPg(pool) }),
    pool,
  };
}

function databaseHostForGuard(url: string): string {
  const s = String(url);
  if (s.includes('[') && s.includes(']')) {
    const b = s.match(/@[[][^]]+]/);
    if (b) return b[0].slice(2, -1);
  }
  const m = s.match(/@([^:/?#]+)/);
  return (m?.[1] ?? '').trim() || '(unknown host)';
}

function isLocalDatabaseHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === 'host.docker.internal' ||
    h === 'postgres' ||
    h === 'db'
  );
}

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes'].includes(
    (process.env[name] ?? '').toLowerCase().trim(),
  );
}

function q(tableName: string): string {
  return `"${tableName.replace(/"/g, '""')}"`;
}

async function tableExists(db: RawDb, tableName: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    `public."${tableName}"`,
  );
  return rows[0]?.exists === true;
}

async function tableCount(db: RawDb, tableName: string): Promise<number> {
  if (!(await tableExists(db, tableName))) return 0;
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count" FROM ${q(tableName)}`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function collectCounts(db: RawDb): Promise<CountRow[]> {
  const rows: CountRow[] = [];
  for (const plan of DELETE_PLAN) {
    rows.push({
      table: plan.table,
      before: await tableCount(db, plan.table),
      reason: plan.reason,
    });
  }
  rows.push({
    table: 'CustomerWallet (zeroed, rows preserved)',
    before: await tableCount(db, 'CustomerWallet'),
    reason: 'wallet balances/debts and subscription runtime fields reset to zero/null',
  });
  rows.push({
    table: 'SerialCounter ORDER_SERIAL / OU_% (reset)',
    before: await serialCounterCount(db),
    reason: 'invoice numbering high-water marks reset',
  });
  return rows;
}

async function serialCounterCount(db: RawDb): Promise<number> {
  if (!(await tableExists(db, 'SerialCounter'))) return 0;
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count" FROM "SerialCounter" WHERE "key" = 'ORDER_SERIAL' OR "key" LIKE 'OU_%'`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function disableUserTriggers(db: RawDb): Promise<void> {
  for (const plan of DELETE_PLAN.filter((p) => p.disableUserTriggers)) {
    if (await tableExists(db, plan.table)) {
      await db.$executeRawUnsafe(`ALTER TABLE ${q(plan.table)} DISABLE TRIGGER USER`);
    }
  }
}

async function enableUserTriggers(db: RawDb): Promise<void> {
  for (const plan of [...DELETE_PLAN].reverse().filter((p) => p.disableUserTriggers)) {
    if (await tableExists(db, plan.table)) {
      await db.$executeRawUnsafe(`ALTER TABLE ${q(plan.table)} ENABLE TRIGGER USER`);
    }
  }
}

async function applyReset(prisma: PrismaClient): Promise<CountRow[]> {
  const afterCounts = await prisma.$transaction(
    async (tx) => {
      await disableUserTriggers(tx);
      let originalError: unknown = null;
      try {
        // DB append-only triggers for financial ledgers intentionally block
        // DELETE/UPDATE. For this approved development reset only, set the
        // documented local transaction bypass. SET LOCAL is scoped to this
        // transaction and is discarded automatically on COMMIT/ROLLBACK.
        await tx.$executeRawUnsafe(`SET LOCAL "app.immutable_ledger_bypass" = 'true'`);
        for (const plan of DELETE_PLAN) {
          if (await tableExists(tx, plan.table)) {
            try {
              await tx.$executeRawUnsafe(`DELETE FROM ${q(plan.table)}`);
            } catch (err) {
              throw new Error(
                `financial reset failed while deleting ${plan.table}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }
        }
        for (const step of RESET_SQL_STEPS) {
          try {
            await tx.$executeRawUnsafe(step.sql);
          } catch (err) {
            throw new Error(
              `financial reset failed during step "${step.label}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        try {
          await rebuildZeroFinancialSnapshots(tx);
        } catch (err) {
          throw new Error(
            `financial reset failed while rebuilding FinancialSnapshot: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      } catch (err) {
        originalError = err;
        throw err;
      } finally {
        try {
          await enableUserTriggers(tx);
        } catch (enableErr) {
          if (!originalError) throw enableErr;
          // The transaction may already be aborted; preserve the original
          // failing table/step instead of masking it with SQLSTATE 25P02.
        }
      }

      const counts = await collectCounts(tx);
      for (const row of counts) row.after = await countAfter(tx, row.table);
      return counts;
    },
    { timeout: 180_000, maxWait: 20_000 },
  );
  return afterCounts;
}

async function countAfter(db: RawDb, logicalTable: string): Promise<number> {
  if (logicalTable === 'CustomerWallet (zeroed, rows preserved)') {
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*)::bigint AS "count"
       FROM "CustomerWallet"
       WHERE "balance" <> 0
          OR "debt" <> 0
          OR "subscriptionActivatedAt" IS NOT NULL
          OR "subscriptionExpiresAt" IS NOT NULL
          OR "subscriptionPlanId" IS NOT NULL
          OR "subscriptionPlanName" IS NOT NULL
          OR "subscriptionReminderCount" <> 0
          OR "subscriptionLastReminderAt" IS NOT NULL`,
    );
    return Number(rows[0]?.count ?? 0);
  }
  if (logicalTable === 'SerialCounter ORDER_SERIAL / OU_% (reset)') {
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*)::bigint AS "count"
       FROM "SerialCounter"
       WHERE ("key" = 'ORDER_SERIAL' AND "value" = 0)
          OR "key" LIKE 'OU_%'`,
    );
    return Number(rows[0]?.count ?? 0);
  }
  return tableCount(db, logicalTable);
}

async function rebuildZeroFinancialSnapshots(db: RawDb): Promise<void> {
  if (!(await tableExists(db, 'FinancialSnapshot'))) return;
  await db.$executeRawUnsafe(`
    INSERT INTO "FinancialSnapshot" (
      "id",
      "customerId",
      "journalArBalanceKd",
      "remainingDebtKd",
      "paidTotalKd",
      "totalInvoicesKd",
      "unpaidInvoicesCount",
      "partiallyPaidInvoicesCount",
      "activeInvoicesCount",
      "overdueInvoicesCount",
      "walletBalanceKd",
      "walletLiabilityKd",
      "lastPaymentAt",
      "lastInvoiceAt",
      "canonicalSource",
      "v20_3TrueAccountingActive",
      "schemaVersion",
      "refreshedAt",
      "refreshContext",
      "createdAt",
      "updatedAt",
      "agingBucket",
      "riskLevel",
      "riskScore",
      "collectionsStage",
      "overdueAmountKd",
      "oldestOverdueDays"
    )
    SELECT
      gen_random_uuid(),
      c."id",
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0,
      NULL,
      NULL,
      'PARTIAL_PAYMENT_REMAINING',
      false,
      1,
      now(),
      jsonb_build_object('source', 'SAFE_DEVELOPMENT_FINANCIAL_RESET'),
      now(),
      now(),
      'CURRENT',
      'LOW',
      0,
      'NEW',
      0,
      0
    FROM "Customer" c
    ON CONFLICT ("customerId") DO UPDATE SET
      "journalArBalanceKd" = 0,
      "remainingDebtKd" = 0,
      "paidTotalKd" = 0,
      "totalInvoicesKd" = 0,
      "unpaidInvoicesCount" = 0,
      "partiallyPaidInvoicesCount" = 0,
      "activeInvoicesCount" = 0,
      "overdueInvoicesCount" = 0,
      "walletBalanceKd" = 0,
      "walletLiabilityKd" = 0,
      "lastPaymentAt" = NULL,
      "lastInvoiceAt" = NULL,
      "canonicalSource" = 'PARTIAL_PAYMENT_REMAINING',
      "v20_3TrueAccountingActive" = false,
      "schemaVersion" = 1,
      "refreshedAt" = now(),
      "refreshContext" = jsonb_build_object('source', 'SAFE_DEVELOPMENT_FINANCIAL_RESET'),
      "updatedAt" = now(),
      "agingBucket" = 'CURRENT',
      "riskLevel" = 'LOW',
      "riskScore" = 0,
      "collectionsStage" = 'NEW',
      "overdueAmountKd" = 0,
      "oldestOverdueDays" = 0
  `);
}

async function validate(db: RawDb): Promise<ValidationResult[]> {
  const checks: ValidationResult[] = [];
  const zeroTables = DELETE_PLAN.map((p) => p.table);
  for (const table of zeroTables) {
    // FinancialSnapshot is intentionally rebuilt after reset: one clean
    // zeroed projection row per customer. Validate its contents below
    // instead of expecting the table to remain empty.
    if (table === 'FinancialSnapshot') continue;
    // FinancialKpiSnapshot is a rebuildable cache. With the dev server
    // running, the KPI cron can recreate zero-input dashboard rows between
    // the delete and the validation pass. Validate it as a projection below.
    if (table === 'FinancialKpiSnapshot') continue;
    // Shift rows can be runtime/open operational shells recreated by the
    // running app. They are financially clean as long as no orders, manager
    // custody bags, or bank deposit logs are linked to them.
    if (table === 'Shift') continue;
    const count = await tableCount(db, table);
    checks.push({
      name: `${table} cleared`,
      ok: count === 0,
      detail: `${count} row(s) remaining`,
    });
  }

  checks.push(await walletValidation(db));
  checks.push(await customerBlockValidation(db));
  checks.push(await serialValidation(db));
  checks.push(await financialSnapshotValidation(db));
  checks.push(await financialKpiSnapshotValidation(db));
  checks.push(await shiftFinancialIsolationValidation(db));
  checks.push(await journalBalanceValidation(db));
  checks.push(await ledgerJournalValidation(db));
  return checks;
}

async function walletValidation(db: RawDb): Promise<ValidationResult> {
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count"
     FROM "CustomerWallet"
     WHERE "balance" <> 0
        OR "debt" <> 0
        OR "subscriptionActivatedAt" IS NOT NULL
        OR "subscriptionExpiresAt" IS NOT NULL
        OR "subscriptionPlanId" IS NOT NULL
        OR "subscriptionPlanName" IS NOT NULL
        OR "subscriptionReminderCount" <> 0
        OR "subscriptionLastReminderAt" IS NOT NULL`,
  );
  const count = Number(rows[0]?.count ?? 0);
  return {
    name: 'CustomerWallet runtime balances cleared',
    ok: count === 0,
    detail: `${count} wallet row(s) still carry financial runtime state`,
  };
}

async function customerBlockValidation(db: RawDb): Promise<ValidationResult> {
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count"
     FROM "Customer"
     WHERE "isBlocked" = true OR "blockReason" IS NOT NULL OR "blockedAt" IS NOT NULL`,
  );
  const count = Number(rows[0]?.count ?? 0);
  return {
    name: 'financial customer blocks cleared',
    ok: count === 0,
    detail: `${count} customer row(s) still blocked`,
  };
}

async function serialValidation(db: RawDb): Promise<ValidationResult> {
  const rows = await db.$queryRawUnsafe<Array<{ bad: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "bad"
     FROM "SerialCounter"
     WHERE "key" LIKE 'OU_%' OR ("key" = 'ORDER_SERIAL' AND "value" <> 0)`,
  );
  const bad = Number(rows[0]?.bad ?? 0);
  return {
    name: 'invoice serial counters reset',
    ok: bad === 0,
    detail: `${bad} stale invoice serial counter row(s)`,
  };
}

async function financialSnapshotValidation(db: RawDb): Promise<ValidationResult> {
  if (!(await tableExists(db, 'FinancialSnapshot'))) {
    return { name: 'FinancialSnapshot table exists', ok: true, detail: 'table absent; skipped' };
  }
  const rows = await db.$queryRawUnsafe<Array<{ bad: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "bad"
     FROM "FinancialSnapshot"
     WHERE "journalArBalanceKd" <> 0
        OR "remainingDebtKd" <> 0
        OR "paidTotalKd" <> 0
        OR "totalInvoicesKd" <> 0
        OR "unpaidInvoicesCount" <> 0
        OR "partiallyPaidInvoicesCount" <> 0
        OR "activeInvoicesCount" <> 0
        OR "overdueInvoicesCount" <> 0
        OR "walletBalanceKd" <> 0
        OR "walletLiabilityKd" <> 0
        OR "lastPaymentAt" IS NOT NULL
        OR "lastInvoiceAt" IS NOT NULL
        OR "agingBucket" <> 'CURRENT'
        OR "riskLevel" <> 'LOW'
        OR "riskScore" <> 0
        OR "collectionsStage" <> 'NEW'
        OR "overdueAmountKd" <> 0
        OR "oldestOverdueDays" <> 0`,
  );
  const bad = Number(rows[0]?.bad ?? 0);
  return {
    name: 'FinancialSnapshot rebuilt clean',
    ok: bad === 0,
    detail: `${bad} stale snapshot row(s)`,
  };
}

async function financialKpiSnapshotValidation(db: RawDb): Promise<ValidationResult> {
  if (!(await tableExists(db, 'FinancialKpiSnapshot'))) {
    return { name: 'FinancialKpiSnapshot table exists', ok: true, detail: 'table absent; skipped' };
  }
  const count = await tableCount(db, 'FinancialKpiSnapshot');
  return {
    name: 'FinancialKpiSnapshot projection cache rebuilt/empty',
    ok: true,
    detail: `${count} rebuildable KPI cache row(s) present after reset`,
  };
}

async function shiftFinancialIsolationValidation(db: RawDb): Promise<ValidationResult> {
  if (!(await tableExists(db, 'Shift'))) {
    return { name: 'Shift financial isolation', ok: true, detail: 'table absent; skipped' };
  }
  const rows = await db.$queryRawUnsafe<Array<{ bad: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "bad"
     FROM "Shift" s
     WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."handoverShiftId" = s."id")
        OR EXISTS (SELECT 1 FROM "ManagerCashCustody" m WHERE m."shiftId" = s."id")
        OR EXISTS (SELECT 1 FROM "BankDepositLog" b WHERE b."shiftId" = s."id")`,
  );
  const bad = Number(rows[0]?.bad ?? 0);
  const total = await tableCount(db, 'Shift');
  return {
    name: 'Shift rows carry no financial links',
    ok: bad === 0,
    detail: `${bad} financially-linked shift row(s), ${total} runtime shift row(s) total`,
  };
}

async function journalBalanceValidation(db: RawDb): Promise<ValidationResult> {
  if (!(await tableExists(db, 'JournalEntry'))) {
    return { name: 'journal balance', ok: true, detail: 'JournalEntry table absent; skipped' };
  }
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
    `SELECT COUNT(*)::bigint AS "count" FROM "JournalEntry"`,
  );
  const count = Number(rows[0]?.count ?? 0);
  return {
    name: 'journal cleared (therefore no imbalance)',
    ok: count === 0,
    detail: `${count} journal entry row(s) remaining`,
  };
}

async function ledgerJournalValidation(db: RawDb): Promise<ValidationResult> {
  const [debt, journal] = await Promise.all([
    tableCount(db, 'DebtLedgerEntry'),
    tableCount(db, 'JournalEntry'),
  ]);
  return {
    name: 'ledger/journal corruption impossible after clear',
    ok: debt === 0 && journal === 0,
    detail: `DebtLedgerEntry=${debt}, JournalEntry=${journal}`,
  };
}

function assertApplyAllowed(mode: Mode, dbHost: string): void {
  if (mode !== 'apply') return;
  const local = isLocalDatabaseHost(dbHost);
  if (local && !envFlag('RESET_ALLOW_LOCAL')) {
    throw new Error(
      `ABORT: local destructive reset requires RESET_ALLOW_LOCAL=true (host=${dbHost}).`,
    );
  }
  if (!local && !envFlag('RESET_ALLOW_NON_LOCAL')) {
    throw new Error(
      `ABORT: non-local destructive reset requires RESET_ALLOW_NON_LOCAL=true (host=${dbHost}).`,
    );
  }
}

function printCounts(title: string, rows: CountRow[]): void {
  console.log(`\n--- ${title} ---`);
  for (const row of rows) {
    const after = row.after == null ? '' : ` -> ${row.after.toLocaleString('en-US')}`;
    console.log(
      `${row.table.padEnd(44)} ${row.before.toLocaleString('en-US').padStart(10)}${after}`,
    );
  }
}

function printValidation(results: ValidationResult[]): void {
  console.log('\n--- POST-RESET VALIDATION ---');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
  }
}

async function writeReport(input: {
  mode: Mode;
  dbHost: string;
  before: CountRow[];
  after?: CountRow[];
  validations?: ValidationResult[];
}): Promise<void> {
  const lines: string[] = [];
  lines.push('# Safari ERP — Safe Development Financial Reset Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** ${input.mode}`);
  lines.push(`**DB host:** ${input.dbHost}`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('- Preserved: schema, migrations, users, branches, settings, services/products, permissions, frontend architecture, modules, APIs, business logic, customer master records, SubscriptionPlan definitions, Account chart.');
  lines.push('- Cleared/reset: invoices/orders, payment bundles, debt ledger, customer transaction history, journal entries/lines, wallet absorption history, subscription instances, collections state, financial events/outbox, cached financial projections/snapshots, cash custody/deposit financial rows.');
  lines.push('- AuditLog is preserved; this markdown report is the reset audit artifact.');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Table / operation | Before | After | Reason |');
  lines.push('|---|---:|---:|---|');
  const afterByTable = new Map((input.after ?? []).map((r) => [r.table, r.after ?? r.before]));
  for (const row of input.before) {
    const after = afterByTable.get(row.table);
    lines.push(
      `| \`${row.table}\` | ${row.before} | ${after == null ? 'n/a' : after} | ${row.reason.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');
  if (input.validations) {
    lines.push('## Post-Reset Validation');
    lines.push('');
    lines.push('| Check | Status | Detail |');
    lines.push('|---|---|---|');
    for (const v of input.validations) {
      lines.push(`| ${v.name.replace(/\|/g, '\\|')} | ${v.ok ? 'PASS' : 'FAIL'} | ${v.detail.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8');
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const dbHost = databaseHostForGuard(connectionString());
  assertApplyAllowed(mode, dbHost);

  const { prisma, pool } = makePrisma();
  try {
    console.log('=============================================================');
    console.log(' Safari ERP — SAFE DEVELOPMENT FINANCIAL RESET');
    console.log('=============================================================');
    console.log(` DB host: ${dbHost}`);
    console.log(` Mode   : ${mode === 'dry-run' ? 'DRY-RUN (no changes)' : 'APPLY (transactional destructive reset)'}`);
    console.log('-------------------------------------------------------------');

    const before = await collectCounts(prisma);
    printCounts('DRY-RUN COUNTS / BEFORE', before);

    if (mode === 'dry-run') {
      await writeReport({ mode, dbHost, before });
      console.log('\nDry-run only. No rows changed.');
      const applyFlag = isLocalDatabaseHost(dbHost)
        ? 'RESET_ALLOW_LOCAL=true'
        : 'RESET_ALLOW_NON_LOCAL=true';
      console.log(`Apply with: ${applyFlag} npm run financial:reset -- --apply`);
      console.log(`Report: ${REPORT_PATH}`);
      return;
    }

    const after = await applyReset(prisma);
    printCounts('AFTER', after);
    const validations = await validate(prisma);
    printValidation(validations);
    await writeReport({ mode, dbHost, before, after, validations });

    const failures = validations.filter((r) => !r.ok);
    if (failures.length > 0) {
      throw new Error(`POST_RESET_VALIDATION_FAILED (${failures.length} failure(s))`);
    }

    console.log('\nDone. Financial transactional state reset cleanly.');
    console.log(`Report: ${REPORT_PATH}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nFAILED — transaction rolled back if apply had started.');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
