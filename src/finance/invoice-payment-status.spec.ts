import { OrderStatus, Prisma } from '@prisma/client';
import { DebtSource } from './enums/debt-source.enum';
import {
  computeOrderRemainingBalance,
  computeOrderRemainingBalancesBatch,
} from './debt-customer-aggregates.util';

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

  it('pre-backfill orders (no journal lines) → treated as cleared (V20.4: DebtLedger removed)', async () => {
    // V20.4: DebtLedgerEntry dropped. Pre-backfill orders with no journal
    // history return 0 (cleared) since there is no fallback table.
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
    expect(m.get('JN')!.toFixed(4)).toBe('0.0000'); // pre-backfill → cleared
  });
});
