/**
 * Stateless debt aggregations reused by Finance (DebtService) and Orders —
 * avoids importing FinanceModule into OrdersModule (Payments → Ledger → Orders cycle).
 */
import { DebtSource, Prisma } from '@prisma/client';

type Db = {
  debtLedgerEntry: Prisma.DebtLedgerEntryDelegate;
  customerWallet: Prisma.CustomerWalletDelegate;
};

const Z = () => new Prisma.Decimal(0);

/** Same waterfall as `DebtLedgerEntry` global rollup, one customer. */
export async function getCustomerNetDebtFromDebtLedgerAgg(
  db: Db,
  customerId: string,
): Promise<{
  outstandingInvoiceDebtKd: Prisma.Decimal;
  outstandingSubscriptionDebtKd: Prisma.Decimal;
  netOpenDebtKd: Prisma.Decimal;
}> {
  const z = Z();
  const rows = await db.debtLedgerEntry.groupBy({
    by: ['source'],
    where: { customerId },
    _sum: { amount: true },
  });
  let inv = z;
  let sub = z;
  let pay = z;
  for (const r of rows) {
    const amt = new Prisma.Decimal(r._sum.amount?.toString() ?? '0');
    if (r.source === DebtSource.INVOICE_SHORTFALL) inv = inv.add(amt);
    else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE)
      sub = sub.add(amt);
    else if (r.source === DebtSource.PAYMENT) pay = pay.add(amt);
  }
  const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
  const payAfterInv = pay.sub(invPaid);
  const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
  const remInv = inv.sub(invPaid);
  const remSub = sub.sub(subPaid);
  return {
    outstandingInvoiceDebtKd: remInv,
    outstandingSubscriptionDebtKd: remSub,
    netOpenDebtKd: remInv.add(remSub),
  };
}

/** Mirrors `DebtService.getCustomerDebtSnapshot` totalDebt as Decimal. */
export async function getCustomerDebtSnapshotTotalKd(
  db: Db,
  customerId: string,
): Promise<Prisma.Decimal> {
  const wallet = await db.customerWallet.findUnique({
    where: { customerId },
    select: { balance: true, debt: true },
  });
  const walletDebt = wallet?.debt ?? new Prisma.Decimal(0);
  const balance = wallet?.balance ?? new Prisma.Decimal(0);
  const subscriptionOveruseDebt = balance.lessThan(Z())
    ? balance.abs()
    : Z();
  return walletDebt.plus(subscriptionOveruseDebt);
}
