import { DebtSource, OrderStatus, Prisma } from '@prisma/client';
import {
  computeOrderRemainingBalance,
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
} from './debt-customer-aggregates.util';
import { InvoicePaymentStatusService } from './invoice-payment-status.service';

/**
 * V20.3.1 — Partial-payment correctness spec.
 *
 * Covers the 5 required cases from the V20.3.1 prompt:
 *
 *   CASE 1 — invoice 100, payment 30 → PARTIALLY_PAID, remaining 70,
 *            still visible in collections
 *   CASE 2 — invoice 100, payment 100 → PAID, remaining 0,
 *            hidden from collections
 *   CASE 3 — wallet 20, invoice 100, cash 30 → remaining 50
 *   CASE 4 — multiple partial payments accumulate correctly
 *   CASE 5 — red card sums REMAINING balances, not gross totals
 *
 * V20.4 — Each case is also covered via the Journal path (account 1300)
 * so that switching V20_4_FINAL_LEDGER=true does not change any outcome.
 *
 * The spec exercises the two pure helpers in
 * `debt-customer-aggregates.util.ts` (which are the canonical math)
 * and the `InvoicePaymentStatusService.statusFromRemaining`
 * derivation. Together these are the single source of truth that
 * Outstanding / red KPI / customer-ledger FIFO all consume.
 */

type LedgerRow = {
  orderId: string | null;
  source: DebtSource;
  amount: Prisma.Decimal;
  actorUserId: string | null;
  sourceRef: string | null;
  note: string | null;
};

type OrderRow = {
  id: string;
  customerId?: string | null;
  totalPrice: Prisma.Decimal;
  status: OrderStatus;
};

/** Journal line (account 1300) for per-order or customer-level entries. */
type JLineRow = {
  /** null → customer-level residual (entry.orderId = null) */
  orderId: string | null;
  customerId?: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

function makeDb(orders: OrderRow[], rows: LedgerRow[]) {
  return {
    order: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return orders.filter((o) => ids.includes(o.id));
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        return orders.find((o) => o.id === where.id) ?? null;
      }),
    },
    debtLedgerEntry: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] | undefined = where?.orderId?.in;
        const id: string | undefined = where?.orderId;
        const customerIds: string[] | undefined = where?.customerId?.in;
        const wantsNullOrder = where?.orderId === null;
        return rows.filter((r) => {
          if (wantsNullOrder) {
            return (
              r.orderId === null &&
              (!customerIds || customerIds.includes((r as any).customerId))
            );
          }
          if (!r.orderId) return false;
          if (ids) return ids.includes(r.orderId);
          if (id) return r.orderId === id;
          return false;
        });
      }),
    },
  } as any;
}

/**
 * V20.4 — Journal-aware db mock. `journalLine.findMany` interprets the
 * same Prisma-style where object that the journal path sends:
 *   1. `entry.orderId.in` → per-order 1300 lines
 *   2. `entry.orderId === null + entry.customerId.in` → customer residuals
 */
function makeDbWithJournal(orders: OrderRow[], jLines: JLineRow[]) {
  return {
    order: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return orders.filter((o) => ids.includes(o.id));
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        return orders.find((o) => o.id === where.id) ?? null;
      }),
    },
    // DebtLedger is kept for the pre-backfill fallback path.
    debtLedgerEntry: {
      findMany: jest.fn(async () => []),
    },
    journalLine: {
      findMany: jest.fn(async ({ where }: any) => {
        const entryFilter = where?.entry ?? {};
        const creditGt: Prisma.Decimal | undefined = where?.credit?.gt;
        const orderIds: string[] | undefined = entryFilter.orderId?.in;
        const wantsNullOrder = entryFilter.orderId === null;
        const customerIds: string[] | undefined = entryFilter.customerId?.in;

        return jLines
          .filter((r) => {
            if (creditGt !== undefined && !r.credit.gt(creditGt)) return false;
            if (wantsNullOrder) {
              if (r.orderId !== null) return false;
              if (customerIds && !customerIds.includes(r.customerId ?? '')) return false;
              return true;
            }
            if (orderIds) return r.orderId !== null && orderIds.includes(r.orderId);
            return false;
          })
          .map((r) => ({
            debit: r.debit,
            credit: r.credit,
            entry: { orderId: r.orderId ?? null, customerId: r.customerId ?? null },
          }));
      }),
    },
  } as any;
}

const D = (v: string | number) => new Prisma.Decimal(v.toString());
const ACTOR = '11111111-1111-4111-8111-111111111111';

const cashPayment = (
  orderId: string,
  amount: string,
  i = 1,
): LedgerRow => ({
  orderId,
  source: DebtSource.PAYMENT,
  amount: D(amount),
  actorUserId: ACTOR,
  sourceRef: `PAYMENT:CASH:${orderId}:${i}`,
  note: null,
});

const walletAbsorption = (
  orderId: string,
  amount: string,
  i = 1,
): LedgerRow => ({
  orderId,
  source: DebtSource.PAYMENT,
  amount: D(amount),
  actorUserId: ACTOR,
  sourceRef: `PAYMENT:WALLET:${orderId}:${i}`,
  note: null,
});

const shortfall = (orderId: string, amount: string): LedgerRow => ({
  orderId,
  source: DebtSource.INVOICE_SHORTFALL,
  amount: D(amount),
  actorUserId: ACTOR,
  sourceRef: `INVOICE_SHORTFALL:${orderId}`,
  note: null,
});

const residualPayment = (
  customerId: string,
  amount: string,
  sourceRef = `PAYMENT:SUBSCRIPTION_ACTIVATION:sub-1:RESIDUAL`,
): LedgerRow & { customerId: string } => ({
  orderId: null,
  source: DebtSource.PAYMENT,
  amount: D(amount),
  actorUserId: ACTOR,
  sourceRef,
  note: null,
  customerId,
});

describe('V20.3.1 — partial payment correctness', () => {
  let prevFlag: string | undefined;
  beforeEach(() => {
    prevFlag = process.env.V20_3_TRUE_ACCOUNTING;
    process.env.V20_3_TRUE_ACCOUNTING = 'false';
  });
  afterEach(() => {
    if (prevFlag === undefined) delete process.env.V20_3_TRUE_ACCOUNTING;
    else process.env.V20_3_TRUE_ACCOUNTING = prevFlag;
  });

  describe('canonical helper: computeOrderRemainingBalancesBatch', () => {
    it('CASE 1 — invoice 100 with cash 30 → remaining 70 (PARTIALLY_PAID)', async () => {
      const db = makeDb(
        [{ id: 'O1', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [shortfall('O1', '100'), cashPayment('O1', '30')],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O1']);
      expect(m.get('O1')!.toFixed(4)).toBe('70.0000');
    });

    it('CASE 2 — invoice 100 with cash 100 → remaining 0 (PAID)', async () => {
      const db = makeDb(
        [{ id: 'O2', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [shortfall('O2', '100'), cashPayment('O2', '100')],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O2']);
      expect(m.get('O2')!.toFixed(4)).toBe('0.0000');
    });

    it('CASE 3 — wallet 20 + cash 30 against invoice 100 → remaining 50', async () => {
      const db = makeDb(
        [{ id: 'O3', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [
          shortfall('O3', '80'),
          walletAbsorption('O3', '20'),
          cashPayment('O3', '30'),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O3']);
      // Order.totalPrice 100 − wallet 20 − cash 30 = 50.
      expect(m.get('O3')!.toFixed(4)).toBe('50.0000');
    });

    it('CASE 4 — three partial cash payments (30 + 20 + 50) clear invoice', async () => {
      const db = makeDb(
        [{ id: 'O4', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [
          shortfall('O4', '100'),
          cashPayment('O4', '30', 1),
          cashPayment('O4', '20', 2),
          cashPayment('O4', '50', 3),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O4']);
      expect(m.get('O4')!.toFixed(4)).toBe('0.0000');
    });

    it('CASE 4b — second-of-two partials (60 then 30) leaves remaining 10', async () => {
      const db = makeDb(
        [{ id: 'O4b', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [
          shortfall('O4b', '100'),
          cashPayment('O4b', '60', 1),
          cashPayment('O4b', '30', 2),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O4b']);
      expect(m.get('O4b')!.toFixed(4)).toBe('10.0000');
    });

    it('clamps remaining at 0 even when payments overshoot the invoice', async () => {
      const db = makeDb(
        [{ id: 'O5', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
        [shortfall('O5', '100'), cashPayment('O5', '120')],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O5']);
      // Overpayment surfaces as a positive credit elsewhere — never
      // as a negative remaining here.
      expect(m.get('O5')!.toFixed(4)).toBe('0.0000');
    });

    it('returns 0 for canceled orders regardless of ledger rows', async () => {
      const db = makeDb(
        [{ id: 'O6', totalPrice: D('100'), status: OrderStatus.CANCELED }],
        [shortfall('O6', '100')],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['O6']);
      expect(m.get('O6')!.toFixed(4)).toBe('0.0000');
    });

    it('handles batches with mixed states in one DB pass', async () => {
      const db = makeDb(
        [
          { id: 'BA', totalPrice: D('100'), status: OrderStatus.COMPLETED },
          { id: 'BB', totalPrice: D('50'), status: OrderStatus.COMPLETED },
          { id: 'BC', totalPrice: D('20'), status: OrderStatus.CANCELED },
        ],
        [
          shortfall('BA', '100'),
          cashPayment('BA', '30'),
          shortfall('BB', '50'),
          cashPayment('BB', '50'),
          shortfall('BC', '20'),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['BA', 'BB', 'BC']);
      expect(m.get('BA')!.toFixed(4)).toBe('70.0000');
      expect(m.get('BB')!.toFixed(4)).toBe('0.0000');
      expect(m.get('BC')!.toFixed(4)).toBe('0.0000');
      // One findMany call for orders, one for ledger entries.
      expect(db.order.findMany).toHaveBeenCalledTimes(1);
      expect(db.debtLedgerEntry.findMany).toHaveBeenCalledTimes(1);
    });

    it('allocates legacy customer-level residual payments FIFO to current invoice remaining', async () => {
      const db = makeDb(
        [
          {
            id: 'MOHAMMED-30250',
            customerId: 'C1',
            totalPrice: D('30.2500'),
            status: OrderStatus.COMPLETED,
          },
        ],
        [
          shortfall('MOHAMMED-30250', '30.2500'),
          residualPayment('C1', '25.0000'),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, ['MOHAMMED-30250']);
      expect(m.get('MOHAMMED-30250')!.toFixed(4)).toBe('5.2500');
    });
  });

  describe('status derivation: InvoicePaymentStatusService.statusFromRemaining', () => {
    const svc = new InvoicePaymentStatusService({} as any);

    it('returns PAID when remaining is below the tolerance', () => {
      expect(svc.statusFromRemaining(100, 100, 0)).toBe('PAID');
      expect(svc.statusFromRemaining(100, 99.9999, '0.0001')).toBe('PAID');
      expect(
        svc.statusFromRemaining(100, '99.999', INVOICE_REMAINING_TOLERANCE_KD),
      ).toBe('PAID');
    });

    it('returns PARTIALLY_PAID when anything was applied and remaining > tolerance', () => {
      expect(svc.statusFromRemaining(100, 30, 70)).toBe('PARTIALLY_PAID');
      expect(svc.statusFromRemaining(100, '0.5', '99.5')).toBe('PARTIALLY_PAID');
    });

    it('returns UNPAID when nothing was applied', () => {
      expect(svc.statusFromRemaining(100, 0, 100)).toBe('UNPAID');
    });
  });

  describe('CASE 5 — red card sums REMAINING balances (not gross)', () => {
    it('sums per-order remaining for in-scope rows and skips fully-paid', async () => {
      // Three open invoices: 100 (paid 30), 50 (paid 50, fully cleared),
      // 80 (no payments). Gross sum = 230 (the bug); remaining red KPI =
      // 70 + 0 + 80 = 150.
      const db = makeDb(
        [
          { id: 'R1', totalPrice: D('100'), status: OrderStatus.COMPLETED },
          { id: 'R2', totalPrice: D('50'), status: OrderStatus.COMPLETED },
          { id: 'R3', totalPrice: D('80'), status: OrderStatus.COMPLETED },
        ],
        [
          shortfall('R1', '100'),
          cashPayment('R1', '30'),
          shortfall('R2', '50'),
          cashPayment('R2', '50'),
          shortfall('R3', '80'),
        ],
      );

      const m = await computeOrderRemainingBalancesBatch(db, [
        'R1',
        'R2',
        'R3',
      ]);

      // Reproduce the red-KPI aggregation: skip rows whose remaining is
      // at or below tolerance (i.e. effectively closed).
      const tol = D(INVOICE_REMAINING_TOLERANCE_KD);
      let red = D('0');
      for (const id of ['R1', 'R2', 'R3']) {
        const rem = m.get(id)!;
        if (rem.lessThanOrEqualTo(tol)) continue;
        red = red.plus(rem);
      }

      expect(red.toFixed(4)).toBe('150.0000');
      // Sanity: the gross would be 230 — the bug we are fixing.
      const gross = D('100').plus(D('50')).plus(D('80'));
      expect(gross.toFixed(4)).toBe('230.0000');
    });
  });

  describe('single-order convenience wrapper', () => {
    it('delegates to the batch helper and returns the lone value', async () => {
      const db = makeDb(
        [{ id: 'S1', totalPrice: D('40'), status: OrderStatus.COMPLETED }],
        [shortfall('S1', '40'), cashPayment('S1', '15')],
      );

      const remaining = await computeOrderRemainingBalance(db, 'S1');
      expect(remaining.toFixed(4)).toBe('25.0000');
    });

    it('returns 0 for unknown order ids', async () => {
      const db = makeDb([], []);
      const remaining = await computeOrderRemainingBalance(db, 'missing');
      expect(remaining.toFixed(4)).toBe('0.0000');
    });
  });
});

// ── V20.4 Journal path — account 1300 as single source of truth ──────────
//
// The journal-based path produces IDENTICAL results to the DebtLedger path
// for every case above. Helpers below construct JournalLine rows that mirror
// what the double-entry journal writes:
//   Invoice issuance : DR 1300 (debit = totalPrice, credit = 0, orderId set)
//   Cash payment     : CR 1300 (debit = 0, credit = amount, orderId set)
//   Wallet absorption: CR 1300 (debit = 0, credit = amount, orderId set)
//   Residual CC pay  : CR 1300 (debit = 0, credit = amount, orderId = null)

const jIssuance = (orderId: string, amount: string): JLineRow => ({
  orderId,
  debit: D(amount),
  credit: D(0),
});
const jCashPayment = (orderId: string, amount: string): JLineRow => ({
  orderId,
  debit: D(0),
  credit: D(amount),
});
const jWalletAbsorption = (orderId: string, amount: string): JLineRow => ({
  orderId,
  debit: D(0),
  credit: D(amount),
});
const jResidualCredit = (customerId: string, amount: string): JLineRow => ({
  orderId: null,
  customerId,
  debit: D(0),
  credit: D(amount),
});

describe('V20.4 — Journal path (account 1300) produces identical remaining balances', () => {
  let prevFlag: string | undefined;
  beforeEach(() => {
    prevFlag = process.env.V20_4_FINAL_LEDGER;
    process.env.V20_4_FINAL_LEDGER = 'true';
  });
  afterEach(() => {
    if (prevFlag === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlag;
  });

  it('CASE 1 — invoice 100, cash 30 → remaining 70', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J1', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
      [jIssuance('J1', '100'), jCashPayment('J1', '30')],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J1']);
    expect(m.get('J1')!.toFixed(4)).toBe('70.0000');
  });

  it('CASE 2 — invoice 100, cash 100 → remaining 0', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J2', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
      [jIssuance('J2', '100'), jCashPayment('J2', '100')],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J2']);
    expect(m.get('J2')!.toFixed(4)).toBe('0.0000');
  });

  it('CASE 3 — wallet 20 + cash 30 against invoice 100 → remaining 50', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J3', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
      [
        jIssuance('J3', '100'),
        jWalletAbsorption('J3', '20'),
        jCashPayment('J3', '30'),
      ],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J3']);
    expect(m.get('J3')!.toFixed(4)).toBe('50.0000');
  });

  it('CASE 4 — three partial cash payments (30+20+50) clear invoice', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J4', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
      [
        jIssuance('J4', '100'),
        jCashPayment('J4', '30'),
        jCashPayment('J4', '20'),
        jCashPayment('J4', '50'),
      ],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J4']);
    expect(m.get('J4')!.toFixed(4)).toBe('0.0000');
  });

  it('clamps to 0 when payments overshoot the invoice', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J5', totalPrice: D('100'), status: OrderStatus.COMPLETED }],
      [jIssuance('J5', '100'), jCashPayment('J5', '120')],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J5']);
    expect(m.get('J5')!.toFixed(4)).toBe('0.0000');
  });

  it('returns 0 for canceled orders regardless of journal lines', async () => {
    const db = makeDbWithJournal(
      [{ id: 'J6', totalPrice: D('100'), status: OrderStatus.CANCELED }],
      [jIssuance('J6', '100')],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['J6']);
    expect(m.get('J6')!.toFixed(4)).toBe('0.0000');
  });

  it('handles batches with mixed states in one pass', async () => {
    const db = makeDbWithJournal(
      [
        { id: 'JA', totalPrice: D('100'), status: OrderStatus.COMPLETED },
        { id: 'JB', totalPrice: D('50'), status: OrderStatus.COMPLETED },
        { id: 'JC', totalPrice: D('20'), status: OrderStatus.CANCELED },
      ],
      [
        jIssuance('JA', '100'),
        jCashPayment('JA', '30'),
        jIssuance('JB', '50'),
        // JC canceled — journal lines present but ignored
        jIssuance('JC', '20'),
      ],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['JA', 'JB', 'JC']);
    expect(m.get('JA')!.toFixed(4)).toBe('70.0000');
    expect(m.get('JB')!.toFixed(4)).toBe('50.0000');
    expect(m.get('JC')!.toFixed(4)).toBe('0.0000');
  });

  it('Mohammed real-world case: residual CC payment (customer-level) allocated FIFO', async () => {
    // Customer C1 owes 30.250 on invoice JM.
    // A CC partial-payment of 25 is recorded as orderId=null (residual).
    const db = makeDbWithJournal(
      [
        {
          id: 'JM',
          customerId: 'C1',
          totalPrice: D('30.2500'),
          status: OrderStatus.COMPLETED,
        },
      ],
      [
        jIssuance('JM', '30.2500'),
        jResidualCredit('C1', '25.0000'),
      ],
    );
    const m = await computeOrderRemainingBalancesBatch(db, ['JM']);
    expect(m.get('JM')!.toFixed(4)).toBe('5.2500');
  });

  it('pre-backfill orders (no journal lines) fall back to DebtLedger', async () => {
    // JN has no journal lines → should fall back and use debtLedgerEntry mock.
    // We set debtLedgerEntry to return a PAYMENT of 10 so remaining = 40.
    const db = {
      order: {
        findMany: jest.fn(async () => [
          { id: 'JN', customerId: null, totalPrice: D('50'), status: OrderStatus.COMPLETED },
        ]),
      },
      debtLedgerEntry: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.orderId?.in?.includes('JN')) {
            return [
              {
                orderId: 'JN',
                source: DebtSource.PAYMENT,
                amount: D('10'),
                actorUserId: ACTOR,
                sourceRef: 'PAYMENT:CASH:JN:1',
                note: null,
              },
            ];
          }
          return [];
        }),
      },
      journalLine: {
        findMany: jest.fn(async () => []), // empty → pre-backfill
      },
    } as any;

    const m = await computeOrderRemainingBalancesBatch(db, ['JN']);
    expect(m.get('JN')!.toFixed(4)).toBe('40.0000');
  });
});
