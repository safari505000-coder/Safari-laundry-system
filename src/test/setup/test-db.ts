import './load-env-test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const missingDatabaseUrlMessage = [
  'DATABASE_URL is required for integration tests.',
  'CI: export DATABASE_URL before `npm run test:integration`.',
  'Local: set it in `.env.test` (loaded by `./load-env-test`).',
].join('\n');

function assertSafeIntegrationDatabaseUrl(url: string): void {
  if (!url.includes('safari_erp_test') && !url.includes('localhost')) {
    throw new Error(
      `SAFETY: refusing integration DB URL (must target safari_erp_test or localhost). Got: ${url.slice(0, 48)}`,
    );
  }
}

function maskDatabaseUrlDiagnostics(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.href;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Single source for env passed to subprocesses and the pooled client. */
function resolveIntegrationDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    if (process.env.CI) {
      console.error('[integration][test-db] CI=true but DATABASE_URL is empty or unset.');
    }
    throw new Error(missingDatabaseUrlMessage);
  }
  assertSafeIntegrationDatabaseUrl(raw);
  return raw;
}

function logCiDatabaseDiagnostics(databaseUrl: string): void {
  if (!process.env.CI) {
    return;
  }
  try {
    const u = new URL(databaseUrl);
    console.log('[integration][test-db] CI Postgres target:', `${u.hostname}:${u.port || '5432'}`);
    console.log('[integration][test-db] DATABASE_URL (masked):', maskDatabaseUrlDiagnostics(databaseUrl));
  } catch {
    console.warn('[integration][test-db] CI set but DATABASE_URL could not be parsed for logs.');
  }
}

const databaseUrl = resolveIntegrationDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
logCiDatabaseDiagnostics(databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 10_000,
});
let closed = false;

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

/**
 * Clears every table between tests using deleteMany() in FK-safe order.
 *
 * Append-only guarded tables (JournalEntry, TransactionHistory, DebtLedgerEntry, …)
 * block DELETE by default.  Setting the session flag
 * `app.immutable_ledger_bypass = 'true'` (migration 20260518150000) makes every
 * guard function allow the delete for the lifetime of this transaction only.
 *
 * Prerequisite: the schema must already be deployed
 * (`npx prisma migrate deploy`) before the test suite runs.
 */
export async function resetDb(prismaInst: PrismaClient): Promise<void> {
  await prismaInst.$transaction(
    async (tx) => {
      // Permit deleteMany() on all append-only guarded tables for this transaction.
      await tx.$executeRaw`SET LOCAL "app.immutable_ledger_bypass" = 'true'`;

      // -- RESTRICT -> User: all must precede User ------------------------------------
      await tx.bankDepositLog.deleteMany();
      await tx.managerCashCustody.deleteMany();
      await tx.promiseEvent.deleteMany();
      await tx.promiseToPay.deleteMany();

      // -- Append-only tables (bypass active) ----------------------------------------
      await tx.collectionsStageEvent.deleteMany();
      await tx.$executeRawUnsafe(
        'ALTER TABLE "FinancialPeriodViolation" DISABLE TRIGGER "FinancialPeriodViolation_no_delete"',
      );
      await tx.financialPeriodViolation.deleteMany();
      await tx.$executeRawUnsafe(
        'ALTER TABLE "FinancialPeriodViolation" ENABLE TRIGGER "FinancialPeriodViolation_no_delete"',
      );
      await tx.financialEventDelivery.deleteMany();
      await tx.financialEventOutbox.deleteMany();
      await tx.journalLine.deleteMany(); // also RESTRICT -> Account
      await tx.journalEntry.deleteMany();
      await tx.journalFailureLog.deleteMany();
      await tx.transactionHistory.deleteMany();
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" DISABLE TRIGGER audit_logs_no_delete',
      );
      await tx.auditLog.deleteMany();
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" ENABLE TRIGGER audit_logs_no_delete',
      );
      await tx.fraudAlert.deleteMany();
      await tx.generalLedgerEntry.deleteMany();

      // -- Account: safe now journalLine is cleared -----------------------------------
      await tx.account.deleteMany();

      // -- Financial -----------------------------------------------------------------
      await tx.financialSnapshot.deleteMany();
      await tx.financialKpiSnapshot.deleteMany();
      await tx.financialPeriod.deleteMany();

      // -- HR / Payroll --------------------------------------------------------------
      await tx.debtHold.deleteMany();
      await tx.commissionPayout.deleteMany();
      await tx.payrollAdHocLine.deleteMany();
      await tx.payroll.deleteMany();
      await tx.commissionRule.deleteMany();
      await tx.leaveRequest.deleteMany();
      await tx.employeeLoan.deleteMany();
      await tx.attendanceLog.deleteMany();

      // -- Order children then Order -------------------------------------------------
      await tx.debtTransferOrder.deleteMany(); // RESTRICT -> Order
      await tx.invoiceAuditLog.deleteMany();   // RESTRICT -> User
      await tx.orderFeedback.deleteMany();
      await tx.orderLineItem.deleteMany();
      await tx.order.deleteMany(); // cascades DebtLedgerEntry via Customer FK (bypass active)

      // -- Shifts / POS --------------------------------------------------------------
      await tx.shift.deleteMany();
      await tx.posPaymentBundle.deleteMany();

      // -- Customer-owned tables -----------------------------------------------------
      await tx.customerWallet.deleteMany();
      await tx.customerSubscription.deleteMany();
      await tx.subscriptionPlan.deleteMany(); // referenced by CustomerWallet + CustomerSubscription
      await tx.collectionsAccount.deleteMany();
      await tx.customerCollectionStatus.deleteMany();
      await tx.websiteOrderRequest.deleteMany();

      // -- Inventory / procurement ---------------------------------------------------
      await tx.purchaseOrderReceiptLine.deleteMany();
      await tx.purchaseOrderReceipt.deleteMany();
      await tx.purchaseOrderLine.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.branchStockLevel.deleteMany();
      await tx.stockItem.deleteMany();
      await tx.inventoryCategory.deleteMany();
      await tx.supplier.deleteMany();

      // -- Laundry pricing -----------------------------------------------------------
      await tx.laundryBranchItemPrice.deleteMany();
      await tx.laundryPriceListItem.deleteMany();
      await tx.laundryItemCategory.deleteMany();

      // -- Expenses ------------------------------------------------------------------
      await tx.branchExpense.deleteMany();
      await tx.vehicleExpense.deleteMany();

      // -- Dispatch / drivers --------------------------------------------------------
      await tx.driverMetrics.deleteMany();
      await tx.dispatch.deleteMany();

      // -- Miscellaneous singletons / leaf tables ------------------------------------
      await tx.debtTransfer.deleteMany();      // RESTRICT -> User
      await tx.deposit.deleteMany();           // Cascade from User
      await tx.refreshToken.deleteMany();
      await tx.serialCounter.deleteMany();
      await tx.backfillAuditLock.deleteMany();
      await tx.paymentMethodFeeConfig.deleteMany();
      await tx.cashIntelExecutionEvent.deleteMany();
      await tx.wallet.deleteMany();
      await tx.systemConfig.deleteMany();
      await tx.systemToggle.deleteMany();
      await tx.payrollSettings.deleteMany();
      await tx.debtHoldPolicy.deleteMany();

      // -- Core entities last --------------------------------------------------------
      // User first: has non-cascade FK to Role and Branch.
      await tx.user.deleteMany();
      await tx.fixedExpenseSchedule.deleteMany(); // RESTRICT -> Branch
      await tx.branch.deleteMany();
      await tx.customer.deleteMany();
      await tx.permission.deleteMany();
      await tx.role.deleteMany();
    },
    { timeout: 60_000 },
  );
}

export async function closeDb(): Promise<void> {
  if (closed) {
    return;
  }
  try {
    await prisma.$disconnect();
  } finally {
    await pool.end();
    closed = true;
  }
}

beforeEach(async () => {
  await resetDb(prisma);
});

afterAll(async () => {
  await closeDb();
});
