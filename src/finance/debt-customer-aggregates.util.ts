/**
 * Stateless debt aggregations reused by Finance (DebtService) and Orders —
 * avoids importing FinanceModule into OrdersModule (Payments → Ledger → Orders cycle).
 */
import { OrderStatus, Prisma } from '@prisma/client';

type Db = {
  customerWallet: Prisma.CustomerWalletDelegate;
  /**
   * V20.2 — Phase 30. Optional journal access so the read switch can
   * upgrade `getCustomerNetDebtFromDebtLedgerAgg` to journal-derived AR.
   */
  journalLine?: Prisma.JournalLineDelegate;
};

type OrderDb = {
  order: Prisma.OrderDelegate;
  /**
   * V20.4 — When provided and `isJournalAsSourceEnabled()` is on,
   * `computeOrderRemainingBalancesBatch` reads per-order AR balance
   * from JournalLine account 1300 instead of the DebtLedger waterfall.
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
 * Customer net open debt from journal AR (account 1300).
 *
 * Journal is always the canonical source. Both breakdown fields
 * collapse into `netOpenDebtKd` because the journal does not
 * separately track invoice vs subscription overuse.
 */
export async function getCustomerNetDebtFromDebtLedgerAgg(
  db: Db,
  customerId: string,
): Promise<{
  outstandingInvoiceDebtKd: Prisma.Decimal;
  outstandingSubscriptionDebtKd: Prisma.Decimal;
  netOpenDebtKd: Prisma.Decimal;
}> {
  if (db.journalLine) {
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
  return {
    outstandingInvoiceDebtKd: Z(),
    outstandingSubscriptionDebtKd: Z(),
    netOpenDebtKd: Z(),
  };
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

    // Step 5: pre-backfill orders have no journal history — treat as paid/cleared.
    for (const oid of preBackfillIds) {
      out.set(oid, Z());
    }

    return out;
  }

  // ── No journal delegate — all orders treated as cleared. ─────────────
  for (const oid of activeOrderIds) {
    out.set(oid, Z());
  }
  return out;
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
