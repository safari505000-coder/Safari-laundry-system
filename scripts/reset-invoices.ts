/**
 * scripts/reset-invoices.ts
 *
 * DESTRUCTIVE — wipes every invoice + invoice-tied financial record and
 * resets the invoice serial counter back to 0. KEEPS: Users, Customers
 * (wallet zeroed), Branches, PriceList, LaundryItems, Roles, HR records
 * (EmployeeLoan, Payroll, BranchExpense), catalog/config tables.
 *
 * What it deletes (in FK-safe order inside a single transaction):
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
 *   npx ts-node scripts/reset-invoices.ts --confirm=DELETE-ALL-INVOICES
 *
 * Without --confirm flag it runs in DRY-RUN mode and only prints counts.
 * Read .env for DATABASE_URL.
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
  ] = await Promise.all([
    prisma.order.count(),
    prisma.orderLineItem.count(),
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
  ]);

  return {
    orders,
    orderLineItems,
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
  };
}

function printCounts(label: string, c: Awaited<ReturnType<typeof countAll>>) {
  // Deliberately wide so 7-digit production counts still line up.
  const fmt = (n: number | null) => (n === null ? 'n/a' : n.toLocaleString('en-US').padStart(10));
  console.log(`\n--- ${label} ---`);
  console.log(`  Order                       : ${fmt(c.orders)}`);
  console.log(`  OrderLineItem               : ${fmt(c.orderLineItems)}`);
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
}

async function main() {
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmValue = confirmArg ? confirmArg.split('=')[1] : '';
  const isDryRun = confirmValue !== 'DELETE-ALL-INVOICES';

  const dbUrl = process.env.DATABASE_URL ?? '';
  const dbHost = dbUrl.match(/@([^/:]+)/)?.[1] ?? '(unknown host)';
  console.log('=============================================================');
  console.log(' Safari ERP — reset invoices + invoice-tied financial records');
  console.log('=============================================================');
  console.log(` DB host: ${dbHost}`);
  console.log(` Mode   : ${isDryRun ? 'DRY-RUN (no changes)' : 'EXECUTE (committing deletes)'}`);
  if (dbHost.includes('rlwy.net') || dbHost.includes('railway')) {
    console.log('  !! This is a Railway-hosted database.');
    console.log('  !! Take a snapshot from the Railway dashboard BEFORE running with --confirm.');
  }
  console.log('-------------------------------------------------------------');

  const before = await countAll();
  printCounts('BEFORE', before);

  if (isDryRun) {
    console.log('\nDry run only. Re-run with --confirm=DELETE-ALL-INVOICES to apply.');
    return;
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

      await tx.$executeRawUnsafe('ALTER TABLE "DebtLedgerEntry" ENABLE TRIGGER USER');
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  const after = await countAll();
  printCounts('AFTER', after);
  console.log('\nDone. Next invoice will be stamped as 1.');
}

main()
  .catch((err) => {
    console.error('\nFAILED — transaction rolled back. No changes committed.');
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
