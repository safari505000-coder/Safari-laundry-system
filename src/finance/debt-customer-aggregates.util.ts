/**
 * Stateless debt aggregations reused by Finance (DebtService) and Orders —
 * avoids importing FinanceModule into OrdersModule (Payments → Ledger → Orders cycle).
 */
import { DebtSource, OrderStatus, Prisma } from '@prisma/client';
import {
  isRealDebtLedgerPayment,
  isWalletAbsorptionLedgerEntry,
} from './debt-ledger-payment-origin.util';

type Db = {
  debtLedgerEntry: Prisma.DebtLedgerEntryDelegate;
  customerWallet: Prisma.CustomerWalletDelegate;
  /**
   * V20.2 — Phase 30. Optional journal access so the read switch can
   * upgrade `getCustomerNetDebtFromDebtLedgerAgg` to journal-derived AR.
   * The aggregator falls back to the DebtLedger waterfall when not
   * provided OR when the flag is off, preserving every existing caller.
   */
  journalLine?: Prisma.JournalLineDelegate;
};

type OrderDb = {
  order: Prisma.OrderDelegate;
  debtLedgerEntry: Prisma.DebtLedgerEntryDelegate;
  /**
   * V20.4 — When provided and `isJournalAsSourceEnabled()` is on,
   * `computeOrderRemainingBalancesBatch` reads per-order AR balance
   * from JournalLine account 1300 instead of the DebtLedger waterfall.
   * Orders with no journal entries fall back to DebtLedger automatically.
   */
  journalLine?: Prisma.JournalLineDelegate;
};

type RemainingOrderRow = {
  id: string;
  customerId?: string | null;
  totalPrice: Prisma.Decimal;
  status: OrderStatus;
};

/**
 * V20.3.1 — tolerance under which an invoice is considered fully
 * paid. Keeps trailing 4-dp arithmetic from leaving a 0.0001 KD
 * residual "open" forever. Lives in the util file (and not in
 * `invoice-payment-status.service.ts`) so customer-ledger /
 * orders / outstanding can import it without pulling in the
 * service class and creating module cycles.
 */
export const INVOICE_REMAINING_TOLERANCE_KD = '0.001';

const Z = () => new Prisma.Decimal(0);

/**
 * V20.2 — Phase 30 read-switch helper.
 *
 * Returns true only when the operator explicitly opts in via
 * `USE_JOURNAL_AS_SOURCE=true`. Re-read on every call so flipping
 * the env (e.g. via `kubectl set env`) takes effect without a
 * deploy. This is the single function downstream code consults
 * before deciding whether to treat the journal as authoritative.
 */
export function isJournalAsSourceEnabled(): boolean {
  // V20.4 — Phase 4/7 master switch overrides the per-feature flag.
  // V20.4 final mode = journal is canonical, period.
  if (isV20_4FinalLedgerEnabledNoCycle()) return true;
  const v = (process.env.USE_JOURNAL_AS_SOURCE ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * Inlined V20.4 master-flag check (no forward-call to
 * {@link isV20_4FinalLedgerEnabled}) so the two switches don't
 * accidentally form a cycle if a future refactor adds extra
 * resolution.
 */
function isV20_4FinalLedgerEnabledNoCycle(): boolean {
  const v = (process.env.V20_4_FINAL_LEDGER ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * V20.3 — true-accounting write-switch helper.
 *
 * Returns true only when the operator explicitly opts in via
 * `V20_3_TRUE_ACCOUNTING=true`. When ON, the wallet-settlement and
 * payment paths:
 *   • emit a full-invoice issuance journal entry on order creation
 *     (`appendInvoiceIssuanceEntry` — Phase 31);
 *   • write `INVOICE_SHORTFALL.amount` as the FULL invoice amount
 *     instead of the post-wallet remainder (Phase 32);
 *   • use the V3 wallet absorption journal entry
 *     (`appendWalletAbsorptionEntryV3` — DR WALLET_LIABILITY /
 *     CR ACCOUNTS_RECEIVABLE — Phase 33);
 *   • emit `appendExternalPaymentEntry` for every external payment
 *     (CASH / KNET / ONLINE / PAYMENT_LINK — Phase 34);
 *   • derive customer debt from journal AR balance instead of the
 *     legacy `wallet.debt` snapshot (Phase 35).
 *
 * Default OFF. Operators are expected to:
 *   1. Run `scripts/backfill-v20-3-true-accounting.ts` to backfill
 *      historical invoice-issuance journal entries first.
 *   2. Verify via `GET /api/finance/audit/reconcile` that the
 *      journal AR matches `wallet.debt` for every customer.
 *   3. Flip the flag.
 *
 * Re-read on every call so the env can be flipped without a
 * process restart.
 */
export function isV20_3TrueAccountingEnabled(): boolean {
  // V20.4 — Phase 7 master switch. Setting V20_4_FINAL_LEDGER=true
  // implicitly forces V20_3_TRUE_ACCOUNTING + USE_JOURNAL_AS_SOURCE
  // on, so operators only flip one flag to land on the canonical
  // banking core. The individual flags remain available for
  // gradual rollout / canary deployments.
  if (isV20_4FinalLedgerEnabled()) return true;
  const v = (process.env.V20_3_TRUE_ACCOUNTING ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * V20.4 — FINAL CANONICAL BANKING CORE master switch.
 *
 * When set, the system commits to:
 *   • V20.3 true accounting (gross invoice issuance + AR-only debt).
 *   • Journal as the single source of truth for every read.
 *   • DebtLedgerEntry demoted to audit-only (no read-driven UI).
 *   • Strict global invariant (Σ Assets = Σ Liabilities + Equity)
 *     enforced post-write.
 *
 * Default OFF so existing deployments keep their current behaviour
 * until operators explicitly flip the flag after running the
 * V20.4 reconciliation engine.
 */
export function isV20_4FinalLedgerEnabled(): boolean {
  const v = (process.env.V20_4_FINAL_LEDGER ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * V20.2 — Phase 30 read-source for the DebtLedger waterfall.
 *
 * Always reads from `DebtLedgerEntry`, never from the journal. Use
 * this when you specifically need the legacy waterfall: drift
 * detection, audit reconciliation, post-write invariant assertions.
 * Consumers that should *follow* the read switch must call
 * {@link getCustomerNetDebtFromDebtLedgerAgg} instead.
 */
export async function getCustomerNetDebtFromDebtLedgerOnly(
  db: Db,
  customerId: string,
): Promise<{
  outstandingInvoiceDebtKd: Prisma.Decimal;
  outstandingSubscriptionDebtKd: Prisma.Decimal;
  netOpenDebtKd: Prisma.Decimal;
}> {
  const z = Z();
  const rows = await db.debtLedgerEntry.findMany({
    where: { customerId },
    select: {
      source: true,
      amount: true,
      actorUserId: true,
      sourceRef: true,
      note: true,
    },
  });
  let inv = z;
  let sub = z;
  let pay = z;
  for (const r of rows) {
    const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
    if (r.source === DebtSource.INVOICE_SHORTFALL) inv = inv.add(amt);
    else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE)
      sub = sub.add(amt);
    else if (r.source === DebtSource.PAYMENT && isRealDebtLedgerPayment(r))
      pay = pay.add(amt);
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

/**
 * Same waterfall as `DebtLedgerEntry` global rollup, one customer.
 *
 * V20.2 — Phase 30. When `USE_JOURNAL_AS_SOURCE=true` AND the caller
 * passed a `journalLine` delegate, the net is computed from
 * JournalEntry/JournalLine on account 1300 (ACCOUNTS_RECEIVABLE)
 * instead of the DebtLedger waterfall. The breakdown
 * (`outstandingInvoiceDebtKd` vs `outstandingSubscriptionDebtKd`) is
 * not separately tracked in the journal, so under the read switch
 * both fields collapse into `netOpenDebtKd` (subscription overuse
 * lives in the same AR balance there). Consumers that need the
 * pre-v4 breakdown should keep using the DebtLedger waterfall via
 * {@link getCustomerNetDebtFromDebtLedgerOnly}.
 *
 * Audit / drift / invariant code MUST call
 * {@link getCustomerNetDebtFromDebtLedgerOnly} so the comparison
 * sides stay independent.
 */
export async function getCustomerNetDebtFromDebtLedgerAgg(
  db: Db,
  customerId: string,
): Promise<{
  outstandingInvoiceDebtKd: Prisma.Decimal;
  outstandingSubscriptionDebtKd: Prisma.Decimal;
  netOpenDebtKd: Prisma.Decimal;
}> {
  if (db.journalLine && isJournalAsSourceEnabled()) {
    const lines = await db.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: '1300' },
      },
      select: { debit: true, credit: true },
    });
    let bal = Z();
    for (const line of lines) {
      bal = bal
        .add(new Prisma.Decimal(line.debit.toString()))
        .sub(new Prisma.Decimal(line.credit.toString()));
    }
    if (bal.lessThan(0)) bal = Z();
    return {
      outstandingInvoiceDebtKd: bal,
      outstandingSubscriptionDebtKd: Z(),
      netOpenDebtKd: bal,
    };
  }

  return getCustomerNetDebtFromDebtLedgerOnly(db, customerId);
}

/**
 * V20.3.1 — canonical per-order remaining balance.
 *
 * Pure function shared by Finance (`InvoicePaymentStatusService`)
 * and CustomerLedger (FIFO close paths) so both paths agree on
 * "what does this invoice still owe?". Avoids a circular dep
 * between `FinanceModule` and `CustomerLedgerModule`.
 *
 * V20.4 — When `isJournalAsSourceEnabled()` is true and `db.journalLine`
 * is present, the function reads per-order AR balance from JournalLine
 * (account 1300) instead of the DebtLedger waterfall. Orders with no
 * journal entries (pre-backfill data) fall back to DebtLedger automatically.
 *
 * Formula (DebtLedger path):
 *   remaining = max(0, Order.totalPrice − Σ realPayments − Σ walletAbsorption)
 *
 * Formula (Journal path):
 *   remaining = max(0, Σ debit_1300(orderId) − Σ credit_1300(orderId))
 *   + FIFO allocation of customer-level orderId=null credits (residual CC payments)
 *
 * Returns `0` for canceled orders and unknown order ids — never negative.
 */
export async function computeOrderRemainingBalancesBatch(
  db: OrderDb,
  orderIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>();
  if (orderIds.length === 0) return out;

  const orders = (await db.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, customerId: true, totalPrice: true, status: true },
  })) as RemainingOrderRow[];

  const totalById = new Map<string, Prisma.Decimal>();
  const customerByOrderId = new Map<string, string>();
  for (const o of orders) {
    if (o.status === OrderStatus.CANCELED) {
      out.set(o.id, Z());
      continue;
    }
    totalById.set(o.id, new Prisma.Decimal(o.totalPrice.toString()));
    if (o.customerId) customerByOrderId.set(o.id, o.customerId);
  }
  if (totalById.size === 0) return out;

  const activeOrderIds = Array.from(totalById.keys());
  const activeOrders = orders.filter((o) => o.status !== OrderStatus.CANCELED);

  // ── V20.4 JOURNAL PATH ────────────────────────────────────────────────
  // Used when the operator has enabled the banking-core flags AND the caller
  // passes a db object that exposes journalLine (PrismaClient / tx always do).
  if (db.journalLine && isJournalAsSourceEnabled()) {
    // Step 1: per-order net on account 1300.
    const perOrderLines = await (db.journalLine as Prisma.JournalLineDelegate).findMany({
      where: {
        entry: { orderId: { in: activeOrderIds } },
        account: { code: '1300' },
      },
      select: {
        debit: true,
        credit: true,
        entry: { select: { orderId: true } },
      },
    });

    const journalNetByOrder = new Map<string, Prisma.Decimal>();
    for (const line of perOrderLines) {
      const oid = (line.entry as { orderId: string | null }).orderId;
      if (!oid) continue;
      journalNetByOrder.set(
        oid,
        (journalNetByOrder.get(oid) ?? Z())
          .add(new Prisma.Decimal(line.debit.toString()))
          .sub(new Prisma.Decimal(line.credit.toString())),
      );
    }

    // Orders that have no journal lines yet (pre-backfill) — fall back to
    // DebtLedger for those specific orders so we never silently show the
    // gross totalPrice as "still owed".
    const preBackfillIds = activeOrderIds.filter(
      (id) => !journalNetByOrder.has(id),
    );

    // Step 2: customer-level orderId=null credits on 1300 (residual CC
    // partial-payments recorded as a single credit without a per-order link).
    const customerIds = Array.from(new Set(customerByOrderId.values()));
    if (customerIds.length > 0) {
      const customerCreditLines = await (db.journalLine as Prisma.JournalLineDelegate).findMany({
        where: {
          entry: { customerId: { in: customerIds }, orderId: null },
          account: { code: '1300' },
          credit: { gt: new Prisma.Decimal(0) },
        },
        select: {
          credit: true,
          entry: { select: { customerId: true } },
        },
      });

      const creditByCustomer = new Map<string, Prisma.Decimal>();
      for (const line of customerCreditLines) {
        const cid = (line.entry as { customerId: string | null }).customerId;
        if (!cid) continue;
        creditByCustomer.set(
          cid,
          (creditByCustomer.get(cid) ?? Z()).add(
            new Prisma.Decimal(line.credit.toString()),
          ),
        );
      }

      // Step 3: FIFO — apply residual credits only to journal-tracked orders
      // (pre-backfill orders are excluded; their credits come via DebtLedger).
      for (const customerId of customerIds) {
        let budget = creditByCustomer.get(customerId) ?? Z();
        if (budget.lessThanOrEqualTo(0)) continue;
        const invoicesForCustomer = activeOrders
          .filter(
            (o) =>
              customerByOrderId.get(o.id) === customerId &&
              journalNetByOrder.has(o.id),
          )
          .map((o) => o.id);
        for (const oid of invoicesForCustomer) {
          if (budget.lessThanOrEqualTo(0)) break;
          const net = journalNetByOrder.get(oid) ?? Z();
          if (net.lessThanOrEqualTo(0)) continue;
          const applied = Prisma.Decimal.min(budget, net);
          journalNetByOrder.set(oid, net.sub(applied));
          budget = budget.sub(applied);
        }
      }
    }

    // Step 4: write journal-based results.
    for (const oid of activeOrderIds) {
      if (preBackfillIds.includes(oid)) continue;
      const net = journalNetByOrder.get(oid) ?? Z();
      out.set(oid, net.lessThan(0) ? Z() : net);
    }

    // Step 5: DebtLedger fallback for pre-backfill orders.
    if (preBackfillIds.length > 0) {
      const preBackfillTotalById = new Map<string, Prisma.Decimal>();
      for (const id of preBackfillIds) preBackfillTotalById.set(id, totalById.get(id)!);
      await computeRemainingFromLedger(
        db,
        preBackfillIds,
        preBackfillTotalById,
        customerByOrderId,
        activeOrders,
        out,
      );
    }

    return out;
  }

  // ── DEBT LEDGER PATH (legacy / fallback) ─────────────────────────────
  await computeRemainingFromLedger(
    db,
    activeOrderIds,
    totalById,
    customerByOrderId,
    activeOrders,
    out,
  );
  return out;
}

/**
 * Internal: compute per-order remaining from the DebtLedger waterfall for
 * a subset of orders. Extracted so the journal path can call it as a
 * targeted fallback for pre-backfill orders without re-querying the whole
 * order set.
 */
async function computeRemainingFromLedger(
  db: OrderDb,
  subsetOrderIds: string[],
  totalById: Map<string, Prisma.Decimal>,
  customerByOrderId: Map<string, string>,
  allActiveOrders: RemainingOrderRow[],
  out: Map<string, Prisma.Decimal>,
): Promise<void> {
  if (subsetOrderIds.length === 0) return;

  const ledgerRows = await db.debtLedgerEntry.findMany({
    where: { orderId: { in: subsetOrderIds } },
    select: {
      orderId: true,
      source: true,
      amount: true,
      actorUserId: true,
      sourceRef: true,
      note: true,
    },
  });

  const paidById = new Map<string, Prisma.Decimal>();
  const walletById = new Map<string, Prisma.Decimal>();
  for (const r of ledgerRows) {
    if (!r.orderId) continue;
    if (r.source !== DebtSource.PAYMENT) continue;
    const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
    if (isRealDebtLedgerPayment(r)) {
      paidById.set(r.orderId, (paidById.get(r.orderId) ?? Z()).add(amt));
    } else if (isWalletAbsorptionLedgerEntry(r)) {
      walletById.set(r.orderId, (walletById.get(r.orderId) ?? Z()).add(amt));
    }
  }

  // V22 — customer-level payment allocation (FIFO).
  //
  // Historical CC partial-payment and subscription-conversion rows may
  // be recorded with `orderId = null` (e.g. `...:RESIDUAL`) even though
  // the customer had open invoice rows.
  const subsetCustomerIds = Array.from(
    new Set(
      subsetOrderIds
        .map((id) => customerByOrderId.get(id))
        .filter((c): c is string => !!c),
    ),
  );
  if (subsetCustomerIds.length > 0) {
    const customerLevelRows = await db.debtLedgerEntry.findMany({
      where: { customerId: { in: subsetCustomerIds }, orderId: null },
      select: {
        customerId: true,
        orderId: true,
        source: true,
        amount: true,
        actorUserId: true,
        sourceRef: true,
        note: true,
      },
    });
    const customerPaymentById = new Map<string, Prisma.Decimal>();
    for (const r of customerLevelRows) {
      if (!isRealDebtLedgerPayment(r)) continue;
      const customerId = r.customerId;
      if (!customerId) continue;
      const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
      customerPaymentById.set(
        customerId,
        (customerPaymentById.get(customerId) ?? Z()).add(amt),
      );
    }
    for (const customerId of subsetCustomerIds) {
      let budget = customerPaymentById.get(customerId) ?? Z();
      if (budget.lessThanOrEqualTo(0)) continue;
      const invoiceIds = allActiveOrders
        .filter(
          (o) =>
            o.status !== OrderStatus.CANCELED &&
            customerByOrderId.get(o.id) === customerId &&
            subsetOrderIds.includes(o.id),
        )
        .map((o) => o.id);
      for (const orderId of invoiceIds) {
        if (budget.lessThanOrEqualTo(0)) break;
        const alreadyPaid = (paidById.get(orderId) ?? Z()).add(
          walletById.get(orderId) ?? Z(),
        );
        const remainingBeforeCustomerLevel = totalById.get(orderId)!.sub(alreadyPaid);
        if (remainingBeforeCustomerLevel.lessThanOrEqualTo(0)) continue;
        const applied = Prisma.Decimal.min(budget, remainingBeforeCustomerLevel);
        paidById.set(orderId, (paidById.get(orderId) ?? Z()).add(applied));
        budget = budget.sub(applied);
      }
    }
  }

  for (const orderId of subsetOrderIds) {
    const total = totalById.get(orderId)!;
    const paid = paidById.get(orderId) ?? Z();
    const wallet = walletById.get(orderId) ?? Z();
    let remaining = total.sub(paid).sub(wallet);
    if (remaining.lessThan(0)) remaining = Z();
    out.set(orderId, remaining);
  }
}

/** Single-order convenience wrapper around the batch helper. */
export async function computeOrderRemainingBalance(
  db: OrderDb,
  orderId: string,
): Promise<Prisma.Decimal> {
  const m = await computeOrderRemainingBalancesBatch(db, [orderId]);
  return m.get(orderId) ?? Z();
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
