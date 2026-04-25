/**
 * scripts/reset-invoices.ts
 *
 * DESTRUCTIVE — wipes every invoice + invoice-tied financial record and
 * resets the invoice serial counter back to 0.
 *
 * `DELETE-ALL-INVOICES` KEEPS: Users, Customers (wallet zeroed), Branches,
 * PriceList, catalog, roles, HR (Payroll, loans, attendance), branch/fleet
 * expenses, PO/stock, audit logs, refresh tokens.
 *
 * `DELETE-INVOICES-AND-MONEY` (recommended for “تصفير فلوس” بدون لخبطة) —
 * all invoice/ledger work **plus** payroll, employee loans, branch + vehicle
 * + fixed overheads, zero branch `Wallet` and salary fields on `User`. Does
 * **not** remove attendance, leave, PO/stock, `AuditLog`, or `RefreshToken`.
 *
 * `DELETE-LOCAL-TEST-ALL` — full local nuke: everything in INVOICES-AND-MONEY
 * **plus** leave, attendance, purchase orders, stock movements, stock levels,
 * `AuditLog`, `RefreshToken` (everyone must re-login).
 *
 * What the core mode deletes (in FK-safe order inside a single transaction):
 *  - DebtTransferOrder + DebtTransfer          (Restrict blocker on Order)
 *  - CommissionPayout                          (order-derived earnings)
 *  - InvoiceAuditLog                           (cascade would work, explicit for safety)
 *  - OrderLineItem                             (cascade would work)
 *  - TransactionHistory                        (customer ledger)
 *  - DebtLedgerEntry                           (append-only trigger disabled for this txn)
 *  - GeneralLedgerEntry                        (invoice-related GL rows)
 *  - ManagerCashCustody + BankDepositLog + Deposit + DebtHold
 *  - Shift + PosPaymentBundle
 *  - CustomerSubscription                      (prepaid instances — financial)
 *  - Order                                     (finally)
 *
 * After delete:
 *  - SerialCounter.value = 0   (invoice numbering restarts at 1)
 *  - CustomerWallet: balance = 0, debt = 0, subscription fields cleared
 *
 * Usage:
 *   npx tsx scripts/reset-invoices.ts
 *   npx tsx scripts/reset-invoices.ts --confirm=DELETE-ALL-INVOICES
 *   npx tsx scripts/reset-invoices.ts --confirm=DELETE-INVOICES-AND-MONEY
 *   npx tsx scripts/reset-invoices.ts --confirm=DELETE-LOCAL-TEST-ALL
 *
 * Or: npm run db:reset-money  |  npm run db:reset-local
 *
 * Without a matching --confirm it runs in DRY-RUN mode and only prints counts.
 * Read .env for DATABASE_URL.
 *
 * Safety: destructive `--confirm=...` is **refused** unless the DB host is a
 * typical local dev target (localhost, 127.0.0.1, host.docker.internal, etc.)
 * to avoid accidentally wiping production. Override only if intentional:
 *   RESET_ALLOW_NON_LOCAL=true
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is missing. Set it in .env before running.');
  process.exit(1);
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function countAll() {
  const [
    orders,
    orderLineItems,
    orderFeedback,
    invoiceAudit,
    debtTransferOrders,
    debtTransfers,
    commissionPayouts,
    transactionHistory,
    debtLedger,
    generalLedger,
    managerCash,
    bankDeposits,
    deposits,
    debtHolds,
    shifts,
    posBundles,
    subscriptions,
    serialCounter,
    walletRows,
    payrolls,
    employeeLoans,
    leaveRequests,
    attendanceLogs,
    branchExpenses,
    vehicleExpenses,
    fixedExpenseSchedules,
    purchaseOrders,
    stockMovements,
    branchWallets,
    auditLogs,
    refreshTokens,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.orderLineItem.count(),
    prisma.orderFeedback.count(),
    prisma.invoiceAuditLog.count(),
    prisma.debtTransferOrder.count(),
    prisma.debtTransfer.count(),
    prisma.commissionPayout.count(),
    prisma.transactionHistory.count(),
    prisma.debtLedgerEntry.count(),
    prisma.generalLedgerEntry.count(),
    prisma.managerCashCustody.count(),
    prisma.bankDepositLog.count(),
    prisma.deposit.count(),
    prisma.debtHold.count(),
    prisma.shift.count(),
    prisma.posPaymentBundle.count(),
    prisma.customerSubscription.count(),
    prisma.serialCounter.findUnique({ where: { key: 'ORDER_SERIAL' } }),
    prisma.customerWallet.count(),
    prisma.payroll.count(),
    prisma.employeeLoan.count(),
    prisma.leaveRequest.count(),
    prisma.attendanceLog.count(),
    prisma.branchExpense.count(),
    prisma.vehicleExpense.count(),
    prisma.fixedExpenseSchedule.count(),
    prisma.purchaseOrder.count(),
    prisma.stockMovement.count(),
    prisma.wallet.count(),
    prisma.auditLog.count(),
    prisma.refreshToken.count(),
  ]);

  return {
    orders,
    orderLineItems,
    orderFeedback,
    invoiceAudit,
    debtTransferOrders,
    debtTransfers,
    commissionPayouts,
    transactionHistory,
    debtLedger,
    generalLedger,
    managerCash,
    bankDeposits,
    deposits,
    debtHolds,
    shifts,
    posBundles,
    subscriptions,
    serialCounterValue: serialCounter?.value ?? null,
    walletRows,
    payrolls,
    employeeLoans,
    leaveRequests,
    attendanceLogs,
    branchExpenses,
    vehicleExpenses,
    fixedExpenseSchedules,
    purchaseOrders,
    stockMovements,
    branchWallets,
    auditLogs,
    refreshTokens,
  };
}

function printCounts(label: string, c: Awaited<ReturnType<typeof countAll>>) {
  // Deliberately wide so 7-digit production counts still line up.
  const fmt = (n: number | null) => (n === null ? 'n/a' : n.toLocaleString('en-US').padStart(10));
  console.log(`\n--- ${label} ---`);
  console.log(`  Order                       : ${fmt(c.orders)}`);
  console.log(`  OrderLineItem               : ${fmt(c.orderLineItems)}`);
  console.log(`  OrderFeedback               : ${fmt(c.orderFeedback)}`);
  console.log(`  InvoiceAuditLog             : ${fmt(c.invoiceAudit)}`);
  console.log(`  DebtTransferOrder           : ${fmt(c.debtTransferOrders)}`);
  console.log(`  DebtTransfer                : ${fmt(c.debtTransfers)}`);
  console.log(`  CommissionPayout            : ${fmt(c.commissionPayouts)}`);
  console.log(`  TransactionHistory          : ${fmt(c.transactionHistory)}`);
  console.log(`  DebtLedgerEntry (append-only): ${fmt(c.debtLedger)}`);
  console.log(`  GeneralLedgerEntry          : ${fmt(c.generalLedger)}`);
  console.log(`  ManagerCashCustody          : ${fmt(c.managerCash)}`);
  console.log(`  BankDepositLog              : ${fmt(c.bankDeposits)}`);
  console.log(`  Deposit                     : ${fmt(c.deposits)}`);
  console.log(`  DebtHold                    : ${fmt(c.debtHolds)}`);
  console.log(`  Shift                       : ${fmt(c.shifts)}`);
  console.log(`  PosPaymentBundle            : ${fmt(c.posBundles)}`);
  console.log(`  CustomerSubscription        : ${fmt(c.subscriptions)}`);
  console.log(`  SerialCounter[ORDER_SERIAL] : ${fmt(c.serialCounterValue)}`);
  console.log(`  CustomerWallet rows (kept)  : ${fmt(c.walletRows)}`);
  console.log(`  -- extended (local-test only) --`);
  console.log(`  Payroll                     : ${fmt(c.payrolls)}`);
  console.log(`  EmployeeLoan                : ${fmt(c.employeeLoans)}`);
  console.log(`  LeaveRequest                : ${fmt(c.leaveRequests)}`);
  console.log(`  AttendanceLog               : ${fmt(c.attendanceLogs)}`);
  console.log(`  BranchExpense               : ${fmt(c.branchExpenses)}`);
  console.log(`  VehicleExpense              : ${fmt(c.vehicleExpenses)}`);
  console.log(`  FixedExpenseSchedule        : ${fmt(c.fixedExpenseSchedules)}`);
  console.log(`  PurchaseOrder               : ${fmt(c.purchaseOrders)}`);
  console.log(`  StockMovement               : ${fmt(c.stockMovements)}`);
  console.log(`  Wallet (branch cash)        : ${fmt(c.branchWallets)}`);
  console.log(`  AuditLog                    : ${fmt(c.auditLogs)}`);
  console.log(`  RefreshToken                : ${fmt(c.refreshTokens)}`);
}

const CONFIRM_INVOICES_ONLY = 'DELETE-ALL-INVOICES';
const CONFIRM_INVOICES_AND_MONEY = 'DELETE-INVOICES-AND-MONEY';
const CONFIRM_LOCAL_TEST_ALL = 'DELETE-LOCAL-TEST-ALL';

/**
 * Best-effort hostname from a Postgres connection URL (excludes userinfo).
 */
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
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h === 'host.docker.internal' || h === 'postgres' || h === 'db') return true;
  return false;
}

async function main() {
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmValue = confirmArg ? confirmArg.split('=')[1] : '';
  const localTestAll = confirmValue === CONFIRM_LOCAL_TEST_ALL;
  const moneyScope = confirmValue === CONFIRM_INVOICES_AND_MONEY;
  /** Payroll, loans, branch/vehicle/fixed expenses, branch Wallet, salary fields on User. */
  const clearingMoneyData = moneyScope || localTestAll;
  const isDryRun =
    confirmValue !== CONFIRM_INVOICES_ONLY && !localTestAll && !moneyScope;

  const dbUrl = process.env.DATABASE_URL ?? '';
  const dbHost = databaseHostForGuard(dbUrl);
  const executeLabel = isDryRun
    ? ''
    : localTestAll
      ? 'LOCAL TEST — full wipe (attendance, PO, stock, audit, sessions)'
      : moneyScope
        ? 'INVOICES + MONEY (payroll, loans, cash expenses, branch wallets, salary fields; keeps attendance, stock, audit, logins)'
        : 'invoices + ledgers only (keeps payroll & expense tables)';
  console.log('=============================================================');
  console.log(' Safari ERP — reset invoices + invoice-tied financial records');
  console.log('=============================================================');
  console.log(` DB host: ${dbHost}`);
  console.log(
    ` Mode   : ${isDryRun ? 'DRY-RUN (no changes)' : `EXECUTE (${executeLabel})`}`,
  );
  if (dbHost.includes('rlwy.net') || dbHost.includes('railway')) {
    console.log('  !! This is a Railway-hosted database.');
    console.log('  !! Take a snapshot from the Railway dashboard BEFORE running with --confirm.');
  }
  if (!isDryRun && localTestAll) {
    console.log('  !! DELETE-LOCAL-TEST-ALL: also attendance, leave, PO/stock, audit, sessions.');
  }
  if (!isDryRun && moneyScope) {
    console.log('  !! DELETE-INVOICES-AND-MONEY: financial-only; sessions & HR calendar preserved.');
  }
  console.log('-------------------------------------------------------------');

  const before = await countAll();
  printCounts('BEFORE', before);

  if (isDryRun) {
    console.log(
      `\nDry run only. Re-run with one of:\n` +
        `  --confirm=${CONFIRM_INVOICES_ONLY}            → orders/ledgers only (keeps Payroll, loans, expenses)\n` +
        `  --confirm=${CONFIRM_INVOICES_AND_MONEY}   → + payroll, loans, branch/vehicle/fixed expenses, branch Wallet, salary fields (keeps attendance, leave, PO/stock, AuditLog, RefreshToken)\n` +
        `  --confirm=${CONFIRM_LOCAL_TEST_ALL}       → full local wipe (+ stock, attendance, audit, sessions)`,
    );
    return;
  }

  const allowNonLocal = ['1', 'true', 'yes'].includes(
    (process.env.RESET_ALLOW_NON_LOCAL ?? '').toLowerCase().trim(),
  );
  if (!isLocalDatabaseHost(dbHost) && !allowNonLocal) {
    console.error('\nتوقف — لن نحذف على سيرفر بعيد (حماية من مسح بيانات الإنتاج/الـRailway).');
    console.error('ABORT: DATABASE_URL is not a local dev host. Refusing destructive run.');
    console.error(`  Host: ${dbHost}`);
    console.error('  Fix: set DATABASE_URL to 127.0.0.1 or localhost (e.g. Docker: docker compose up -d postgres), then re-run.');
    console.error('  If you really want this non-local host: set RESET_ALLOW_NON_LOCAL=true');
    process.exit(1);
  }
  if (!isLocalDatabaseHost(dbHost) && allowNonLocal) {
    console.log('  !! RESET_ALLOW_NON_LOCAL=true — running DELETE on NON-LOCAL host. Double-check you meant this.');
  }

  console.log('\nExecuting delete sequence inside a single transaction…');

  await prisma.$transaction(
    async (tx) => {
      // The append-only trigger on DebtLedgerEntry would RAISE EXCEPTION
      // on any DELETE. We disable USER triggers for the duration of this
      // transaction only — they're restored automatically at COMMIT end
      // because session_replication_role is session-scoped; however to be
      // explicit we also turn them back on at the end of this tx.
      // `DISABLE TRIGGER USER` keeps FK triggers intact (those are system
      // triggers), so cascades still work.
      await tx.$executeRawUnsafe('ALTER TABLE "DebtLedgerEntry" DISABLE TRIGGER USER');

      // 1. Tables that BLOCK Order deletion (FK Restrict).
      await tx.debtTransferOrder.deleteMany();
      await tx.debtTransfer.deleteMany();

      // 2. Order-derived earnings + audit trail.
      await tx.commissionPayout.deleteMany();
      await tx.invoiceAuditLog.deleteMany();

      // 3. Customer financial ledgers (both forms).
      await tx.transactionHistory.deleteMany();
      await tx.debtLedgerEntry.deleteMany();

      // 4. Company-side GL + cash-flow records.
      await tx.generalLedgerEntry.deleteMany();
      await tx.managerCashCustody.deleteMany();
      await tx.bankDepositLog.deleteMany();
      await tx.deposit.deleteMany();
      await tx.debtHold.deleteMany();

      if (clearingMoneyData) {
        // CommissionPayout + DebtHold already reference Payroll — must be clear first.
        await tx.payroll.deleteMany();
        await tx.employeeLoan.deleteMany();
        await tx.branchExpense.deleteMany();
        await tx.vehicleExpense.deleteMany();
        await tx.fixedExpenseSchedule.deleteMany();
        if (localTestAll) {
          await tx.leaveRequest.deleteMany();
          await tx.attendanceLog.deleteMany();
          await tx.purchaseOrder.deleteMany();
          await tx.stockMovement.deleteMany();
        }
      }

      // 5. Shift comes after BankDepositLog (FK SetNull, but explicit order
      // avoids unexpected NULLs on the now-orphaned rows we're about to drop).
      await tx.shift.deleteMany();
      await tx.posPaymentBundle.deleteMany();

      // 6. Subscriptions (prepaid history). CustomerWallet rows stay but
      // are zeroed below.
      await tx.customerSubscription.deleteMany();

      // 7. Finally, orders themselves + their line items (cascade would
      // catch the latter, but explicit keeps the plan readable).
      await tx.orderLineItem.deleteMany();
      await tx.order.deleteMany();

      // 8. Reset per-operator serial keys (V19.24: `OU_<userId>`) and the
      // legacy global row so no stale high-water remains after wipe.
      await tx.serialCounter.deleteMany({
        where: { key: { startsWith: 'OU_' } },
      });
      await tx.serialCounter.upsert({
        where: { key: 'ORDER_SERIAL' },
        update: { value: 0 },
        create: { key: 'ORDER_SERIAL', value: 0 },
      });

      // 9. Zero every wallet balance (keep rows so customers stay linked).
      await tx.customerWallet.updateMany({
        data: {
          balance: 0,
          debt: 0,
          subscriptionActivatedAt: null,
          subscriptionExpiresAt: null,
          subscriptionPlanId: null,
          subscriptionPlanName: null,
          subscriptionReminderCount: 0,
          subscriptionLastReminderAt: null,
        },
      });

      if (clearingMoneyData) {
        await tx.wallet.updateMany({ data: { balance: 0 } });
        await tx.user.updateMany({
          data: { basicMonthlySalary: null, monthlyAllowances: null },
        });
      }
      if (localTestAll) {
        await tx.branchStockLevel.updateMany({
          data: {
            quantityOnHand: 0,
            avgUnitCost: null,
            lastMovementAt: null,
          },
        });
        await tx.stockItem.updateMany({ data: { lastUnitCost: null } });
        await tx.auditLog.deleteMany();
        await tx.refreshToken.deleteMany();
      }

      await tx.$executeRawUnsafe('ALTER TABLE "DebtLedgerEntry" ENABLE TRIGGER USER');
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  const after = await countAll();
  printCounts('AFTER', after);
  if (localTestAll) {
    console.log(
      '\nDone. Full local wipe: invoices, ledgers, payroll, loans, expenses, PO/stock, attendance, audit, sessions; wallets at 0; re-login required.',
    );
  } else if (moneyScope) {
    console.log(
      '\nDone. Invoices, ledgers, payroll, loans, cash expenses cleared; customer + branch Wallets 0; salary fields cleared. Attendance, stock, audit, logins preserved.',
    );
  } else {
    console.log('\nDone. Next invoice will be stamped as 1.');
  }
}

main()
  .catch((err) => {
    console.error('\nFAILED — transaction rolled back. No changes committed.');
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
