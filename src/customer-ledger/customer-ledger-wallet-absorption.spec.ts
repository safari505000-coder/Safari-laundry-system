/**
 * V20.1 (v2) — Wallet absorption + drain hotfix verification.
 *
 * Reproduces the exact scenario in the V20.1 fix prompt:
 *   wallet.balance = 5 KD
 *   invoice        = 20 KD
 *   posPaymentMethod = DEBT_ON_ACCOUNT
 *
 * Expected post-V20.1 state:
 *   wallet.balance              0.0000
 *   wallet.debt                15.0000
 *   DebtLedgerEntry rows:
 *     INVOICE_SHORTFALL  amount=15  sourceRef=INVOICE:<orderId>:SHORTFALL:<ts>
 *     PAYMENT (wallet)   amount=5   sourceRef=PAYMENT:WALLET:<orderId>:APPLIED   (audit only, deterministic)
 *
 * And — the inverse case — for posPaymentMethod=CASH the wallet must
 * stay at 5 (Phase 2 drain hotfix).
 *
 * Plus a v2-specific idempotency test: re-running the settlement
 * on the same order (e.g. after a `walletSettledAt: null` reset)
 * must NOT create a duplicate `PAYMENT:WALLET:` row — the unique
 * constraint on `sourceRef` + the P2002 catch make the second
 * insert a no-op. Test simulates the constraint violation directly
 * because it can't actually round-trip through the live DB.
 */
import {
  CashStatus,
  DebtSource,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { CustomerLedgerService } from './customer-ledger.service';
import {
  isRealDebtLedgerPayment,
  isWalletAbsorptionLedgerEntry,
} from '../finance/debt-ledger-payment-origin.util';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WALLET_ID = '44444444-4444-4444-8444-444444444444';

type DebtRow = {
  source: DebtSource;
  amount: string;
  sourceRef: string;
  orderId: string | null;
  customerId: string;
  actorUserId: string | null;
  note: string | null;
};

function makeTxFor(opts: {
  walletBalance: string;
  walletDebt: string;
  totalPrice: string;
  posPaymentMethod: PosPaymentMethod;
}) {
  const writes: DebtRow[] = [];
  const walletState = {
    balance: new Prisma.Decimal(opts.walletBalance),
    debt: new Prisma.Decimal(opts.walletDebt),
  };

  return {
    writes,
    walletState,
    tx: {
      // V20.1-v2 — Phase 13 lock helper uses tx.$queryRaw FOR UPDATE.
      // Mock returns an empty result set; the helper swallows errors
      // anyway, but having this here keeps stderr clean.
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: ORDER_ID }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: ACTOR_ID,
          safariRole: SafariRole.DRIVER,
          branchId: null,
        }),
      },
      customer: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      customerWallet: {
        upsert: jest
          .fn()
          .mockResolvedValue({ ...walletState, id: WALLET_ID, customerId: CUSTOMER_ID }),
        update: jest.fn(({ data }: { data: { balance: Prisma.Decimal; debt: Prisma.Decimal } }) => {
          walletState.balance = data.balance;
          walletState.debt = data.debt;
          return Promise.resolve({ ...walletState, id: WALLET_ID });
        }),
        findUnique: jest.fn(() =>
          Promise.resolve({ ...walletState, id: WALLET_ID }),
        ),
      },
      customerSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      transactionHistory: {
        create: jest.fn().mockResolvedValue({ id: 'th-1' }),
      },
      debtLedgerEntry: {
        create: jest.fn(({ data }: { data: DebtRow }) => {
          writes.push(data);
          return Promise.resolve({ id: `dle-${writes.length}`, ...data });
        }),
        // V20.1-v3 — Phase 9 invariant re-reads the just-written
        // PAYMENT:WALLET:<orderId>:APPLIED row by sourceRef. Mock
        // returns truthy if any prior write matches.
        findUnique: jest.fn(({ where }: { where: { sourceRef: string } }) => {
          const match = writes.find((w) => w.sourceRef === where.sourceRef);
          return Promise.resolve(match ? { id: 'dle-existing' } : null);
        }),
        // V20.1-v4 — Phase 18 invariant aggregates all rows for the
        // customer at end of transaction. Mock returns the writes
        // array filtered by customerId (all writes here are for the
        // single test customer).
        findMany: jest.fn(() =>
          Promise.resolve(
            writes.map((w) => ({
              source: w.source,
              amount: new Prisma.Decimal(w.amount.toString()),
              actorUserId: w.actorUserId,
              sourceRef: w.sourceRef,
              note: w.note,
            })),
          ),
        ),
      },
      // V20.2 — Phase 29 lockstep reads journal AR directly.
      // Default mock: synthesise journal lines that mirror the
      // SHORTFALL writes (DR AR for the SHORTFALL amount) so the
      // happy-path tests stay in lockstep without per-test wiring.
      journalLine: {
        findMany: jest.fn(() =>
          Promise.resolve(
            writes
              .filter(
                (w) =>
                  w.source === DebtSource.INVOICE_SHORTFALL ||
                  w.source === DebtSource.SUBSCRIPTION_OVERUSE,
              )
              .map((w) => ({
                debit: new Prisma.Decimal(w.amount.toString()),
                credit: new Prisma.Decimal('0'),
              })),
          ),
        ),
      },
    },
  };
}

function makeService() {
  const generalLedger = { append: jest.fn().mockResolvedValue(undefined) };
  const journal = {
    mirrorDebtLedgerEntry: jest.fn().mockResolvedValue(null),
    mirrorDebtLedgerEntrySafe: jest.fn().mockResolvedValue(null),
    // V20.1-v4 — Phase 20 third-entry rule.
    appendWalletAbsorptionEntry: jest.fn().mockResolvedValue(null),
    appendWalletAbsorptionEntrySafe: jest.fn().mockResolvedValue(null),
    // V20.3 — Phase 31/33/34 true-accounting journal entries.
    appendInvoiceIssuanceEntry: jest.fn().mockResolvedValue(null),
    appendInvoiceIssuanceEntrySafe: jest.fn().mockResolvedValue(null),
    appendWalletAbsorptionEntryV3: jest.fn().mockResolvedValue(null),
    appendWalletAbsorptionEntryV3Safe: jest.fn().mockResolvedValue(null),
    appendExternalPaymentEntry: jest.fn().mockResolvedValue(null),
    appendExternalPaymentEntrySafe: jest.fn().mockResolvedValue(null),
  };
  const inventory = {
    applyOrderStockDecrement: jest.fn().mockResolvedValue(undefined),
  };
  const orders = {
    getOperationalDebtKdBreakdown: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(),
  };
  // V23.3 — `CustomerLedgerService` constructor gained
  // `JournalSourceService` between the (journal) and (inventory)
  // params. A no-op stub matches the legacy behaviour exactly.
  const journalSource = {
    classify: jest.fn(),
    label: jest.fn().mockReturnValue('TEST'),
  };
  const service = new CustomerLedgerService(
    prisma as never,
    generalLedger as never,
    journal as never,
    journalSource as never,
    inventory as never,
    orders as never,
  );
  return { service, generalLedger, journal };
}

function expectsToHaveCalledThirdEntry(journal: { appendWalletAbsorptionEntrySafe: jest.Mock }) {
  expect(journal.appendWalletAbsorptionEntrySafe).toHaveBeenCalled();
  const lastCall = journal.appendWalletAbsorptionEntrySafe.mock.calls.at(-1)!;
  return lastCall[1] as { customerId: string; orderId: string; amount: Prisma.Decimal };
}

describe('V20.1 — wallet absorption + drain hotfix', () => {
  it('wallet=5, invoice=20, DEBT_ON_ACCOUNT → SHORTFALL=15 + PAYMENT:WALLET:=5', async () => {
    const { tx, walletState, writes } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service, journal } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('20.0000'),
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
    );

    expect(walletState.balance.toFixed(4)).toBe('0.0000');
    expect(walletState.debt.toFixed(4)).toBe('15.0000');

    const shortfallRow = writes.find(
      (w) => w.source === DebtSource.INVOICE_SHORTFALL,
    );
    const walletPaymentRow = writes.find(
      (w) =>
        w.source === DebtSource.PAYMENT &&
        w.sourceRef.startsWith('PAYMENT:WALLET:'),
    );
    expect(shortfallRow).toBeDefined();
    expect(new Prisma.Decimal(shortfallRow!.amount.toString()).toFixed(4)).toBe(
      '15.0000',
    );
    expect(walletPaymentRow).toBeDefined();
    expect(
      new Prisma.Decimal(walletPaymentRow!.amount.toString()).toFixed(4),
    ).toBe('5.0000');
    expect(walletPaymentRow!.sourceRef).toBe(
      `PAYMENT:WALLET:${ORDER_ID}:APPLIED`,
    );

    expect(
      isRealDebtLedgerPayment({
        source: walletPaymentRow!.source,
        amount: walletPaymentRow!.amount,
        actorUserId: walletPaymentRow!.actorUserId,
        sourceRef: walletPaymentRow!.sourceRef,
      }),
    ).toBe(false);
    expect(
      isWalletAbsorptionLedgerEntry({
        source: walletPaymentRow!.source,
        amount: walletPaymentRow!.amount,
        sourceRef: walletPaymentRow!.sourceRef,
      }),
    ).toBe(true);

    // V20.1-v4 — Phase 20 third-entry rule: every wallet deduction
    // must produce a journal entry. The dedicated AR-neutral
    // wallet-absorption entry must have been called with the wallet
    // portion (5 KD) and the same orderId.
    const journalCall = expectsToHaveCalledThirdEntry(journal);
    expect(journalCall.customerId).toBe(CUSTOMER_ID);
    expect(journalCall.orderId).toBe(ORDER_ID);
    expect(new Prisma.Decimal(journalCall.amount.toString()).toFixed(4)).toBe(
      '5.0000',
    );
  });

  it('wallet=25, invoice=30, SUBSCRIPTION → consumes 25 and puts remaining 5 on invoice debt', async () => {
    const { tx, walletState, writes } = makeTxFor({
      walletBalance: '25.0000',
      walletDebt: '0.0000',
      totalPrice: '30.0000',
      posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
    });
    const { service, journal } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('30.0000'),
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
    );

    expect(walletState.balance.toFixed(4)).toBe('0.0000');
    expect(walletState.debt.toFixed(4)).toBe('5.0000');

    const walletPaymentRow = writes.find(
      (w) =>
        w.source === DebtSource.PAYMENT &&
        w.sourceRef.startsWith('PAYMENT:WALLET:'),
    );
    expect(walletPaymentRow).toBeDefined();
    expect(
      new Prisma.Decimal(walletPaymentRow!.amount.toString()).toFixed(4),
    ).toBe('25.0000');

    const shortfallRow = writes.find(
      (w) => w.source === DebtSource.INVOICE_SHORTFALL,
    );
    expect(shortfallRow).toBeDefined();
    expect(new Prisma.Decimal(shortfallRow!.amount.toString()).toFixed(4)).toBe(
      '5.0000',
    );
    expect(
      writes.find((w) => w.source === DebtSource.SUBSCRIPTION_OVERUSE),
    ).toBeUndefined();

    expectsToHaveCalledThirdEntry(journal);
  });

  it('wallet=5, invoice=20, CASH → wallet stays at 5 (drain hotfix), no DebtLedger rows', async () => {
    const { tx, walletState, writes } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.CASH,
    });
    const { service } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('20.0000'),
        posPaymentMethod: PosPaymentMethod.CASH,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
    );

    expect(walletState.balance.toFixed(4)).toBe('5.0000');
    expect(walletState.debt.toFixed(4)).toBe('0.0000');
    expect(writes).toHaveLength(0);
  });

  it('wallet=5, invoice=3, SUBSCRIPTION_WALLET → wallet=2, no debt, PAYMENT:WALLET:=3', async () => {
    const { tx, walletState, writes } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '3.0000',
      posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
    });
    const { service } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('3.0000'),
        posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
    );

    expect(walletState.balance.toFixed(4)).toBe('2.0000');
    expect(walletState.debt.toFixed(4)).toBe('0.0000');
    const walletRow = writes.find(
      (w) =>
        w.source === DebtSource.PAYMENT &&
        w.sourceRef.startsWith('PAYMENT:WALLET:'),
    );
    expect(walletRow).toBeDefined();
    expect(new Prisma.Decimal(walletRow!.amount.toString()).toFixed(4)).toBe(
      '3.0000',
    );
  });

  it('idempotency — duplicate PAYMENT:WALLET:<orderId>:APPLIED is silently absorbed', async () => {
    // Simulates the V20-FORENSIC §C-8 path: walletSettledAt was reset
    // to null by the call-centre manual-mark flow, then settlement is
    // re-run. The deterministic sourceRef + P2002 catch must turn the
    // second wallet PAYMENT insert into a no-op (no throw, no duplicate).
    // The Phase 9 invariant guard must still pass because the prior
    // row exists (we simulate it via the findUnique mock returning
    // truthy for the deterministic sourceRef).
    const { tx, walletState } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service } = makeService();

    // Override debtLedgerEntry.create to throw P2002 ONLY for the
    // wallet PAYMENT insert (deterministic sourceRef collision); other
    // writes (the SHORTFALL row) succeed normally.
    const realCreate = tx.debtLedgerEntry.create;
    (tx.debtLedgerEntry as { create: jest.Mock }).create = jest.fn(
      ({ data }: { data: { sourceRef: string } }) => {
        if (data.sourceRef.startsWith('PAYMENT:WALLET:')) {
          const err = new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`sourceRef`)',
            {
              code: 'P2002',
              clientVersion: 'test',
              meta: { target: ['sourceRef'] },
            },
          );
          throw err;
        }
        return realCreate({ data } as never);
      },
    );
    // Simulate the historical row: invariant findUnique must return
    // truthy for the deterministic sourceRef, otherwise Phase 9 throws.
    (tx.debtLedgerEntry as { findUnique: jest.Mock }).findUnique = jest.fn(
      ({ where }: { where: { sourceRef: string } }) =>
        where.sourceRef === `PAYMENT:WALLET:${ORDER_ID}:APPLIED`
          ? Promise.resolve({ id: 'dle-prior' })
          : Promise.resolve(null),
    );

    await expect(
      service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('20.0000'),
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
      ),
    ).resolves.toBeUndefined();

    // Wallet still got debited (the live update is the integrity gate).
    expect(walletState.balance.toFixed(4)).toBe('0.0000');
    expect(walletState.debt.toFixed(4)).toBe('15.0000');
  });

  it('Phase 9 invariant — wallet deduction WITHOUT a PAYMENT row throws and aborts', async () => {
    // Stress test: simulate the impossible (in current code) state
    // where the wallet PAYMENT insert silently produced no row AND
    // no prior row exists. The Phase 9 guard must throw so the
    // outer Prisma transaction rolls back the wallet update.
    const { tx } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service } = makeService();

    // Make create succeed for SHORTFALL but PAYMENT:WALLET silently
    // returns null (simulates a future bug that bypasses recording).
    (tx.debtLedgerEntry as { create: jest.Mock }).create = jest.fn(
      ({ data }: { data: { sourceRef: string } }) => {
        if (data.sourceRef.startsWith('PAYMENT:WALLET:')) {
          return Promise.resolve({ id: 'dle-fake' });
        }
        return Promise.resolve({ id: 'dle-shortfall' });
      },
    );
    // findUnique returns null for the wallet sourceRef → invariant fires.
    (tx.debtLedgerEntry as { findUnique: jest.Mock }).findUnique = jest.fn(
      () => Promise.resolve(null),
    );

    await expect(
      service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('20.0000'),
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
      ),
    ).rejects.toThrow('WALLET_DEDUCTION_WITHOUT_PAYMENT_RECORD');
  });

  it('Phase 18 — post-write drift assertion throws FINANCIAL_INCONSISTENCY_DETECTED', async () => {
    // Stress test: simulate a scenario where the wallet.debt that's
    // about to commit (15) does NOT match the ledger-net derived
    // from DebtLedgerEntry rows (e.g. only 10 due to a fictional
    // missing SHORTFALL row). The Phase 18 assertion must fire and
    // abort the entire transaction.
    const { tx, walletState } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service } = makeService();

    // Simulate ledger view: only the wallet PAYMENT exists, no SHORTFALL.
    // Wallet.debt will be 15, ledger-net = 0 - 0 = 0 (since wallet
    // payments are excluded from real payments). Drift = 15 ≠ 0 → throws.
    (tx.debtLedgerEntry as { findMany: jest.Mock }).findMany = jest.fn(() =>
      Promise.resolve([
        {
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId: ACTOR_ID,
          sourceRef: `PAYMENT:WALLET:${ORDER_ID}:APPLIED`,
          note: null,
        },
      ]),
    );

    await expect(
      service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('20.0000'),
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
      ),
    ).rejects.toThrow('FINANCIAL_INCONSISTENCY_DETECTED');
    // Wallet update was attempted but in a real DB the throw would
    // roll the transaction back — we just verify the assertion path.
    void walletState;
  });

  it('Phase 29 — journal AR diverging from ledger net throws LEDGER_JOURNAL_DIVERGENCE', async () => {
    // Stress test: keep ledger consistent (Phase 18 passes) but
    // simulate the journal mirror missing one SHORTFALL — e.g. the
    // mirrorDebtLedgerEntrySafe call silently dropped while the
    // breaker hadn't yet tripped. ledgerNet=15, journalAR=0 →
    // delta=15 ≠ 0 → Phase 29 must throw.
    const { tx } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service } = makeService();

    // Force journal AR to be empty for this customer regardless of
    // what was written. ledgerNet (computed from writes) will be 15;
    // journalAR will be 0; delta = 15 → throw.
    (tx.journalLine as { findMany: jest.Mock }).findMany = jest.fn(() =>
      Promise.resolve([]),
    );

    await expect(
      service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('20.0000'),
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
      ),
    ).rejects.toThrow('LEDGER_JOURNAL_DIVERGENCE');
  });

  it('Phase 28 — strict global invariant violation throws when STRICT_GLOBAL_INVARIANT=true', async () => {
    // Toggle the strict flag for this test only; default is LOG-only
    // (operators should clear historical drift before flipping the
    // strict flag in production).
    const original = process.env.STRICT_GLOBAL_INVARIANT;
    process.env.STRICT_GLOBAL_INVARIANT = 'true';
    try {
      const { tx } = makeTxFor({
        walletBalance: '5.0000',
        walletDebt: '0.0000',
        totalPrice: '20.0000',
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
      const { service } = makeService();

      // Happy-path Phase 18 + Phase 29 must still pass first; the
      // global invariant LHS = 0 + 5 + 15 = 20, RHS = 15 (SHORTFALL
      // only — wallet absorption sits on the payments side under our
      // current SHORTFALL-as-remainder semantic). delta = 5 → throws
      // under STRICT mode.
      await expect(
        service.applyOrderWalletSettlementForCompletedOrder(
          tx as never,
          ORDER_ID,
          ACTOR_ID,
          {
            customerId: CUSTOMER_ID,
            totalPrice: new Prisma.Decimal('20.0000'),
            posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
            walletSettledAt: null,
            skipPerformerLookup: true,
          },
        ),
      ).rejects.toThrow('GLOBAL_INVARIANT_VIOLATION');
    } finally {
      if (original === undefined) delete process.env.STRICT_GLOBAL_INVARIANT;
      else process.env.STRICT_GLOBAL_INVARIANT = original;
    }
  });

  it('Phase 28 — global invariant logs (no throw) by default', async () => {
    // With STRICT_GLOBAL_INVARIANT unset/false, the invariant must
    // only emit `[GLOBAL_INVARIANT_VIOLATION]` and continue, so the
    // settlement commits normally.
    const original = process.env.STRICT_GLOBAL_INVARIANT;
    delete process.env.STRICT_GLOBAL_INVARIANT;
    try {
      const { tx, walletState } = makeTxFor({
        walletBalance: '5.0000',
        walletDebt: '0.0000',
        totalPrice: '20.0000',
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
      const { service } = makeService();

      await expect(
        service.applyOrderWalletSettlementForCompletedOrder(
          tx as never,
          ORDER_ID,
          ACTOR_ID,
          {
            customerId: CUSTOMER_ID,
            totalPrice: new Prisma.Decimal('20.0000'),
            posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
            walletSettledAt: null,
            skipPerformerLookup: true,
          },
        ),
      ).resolves.toBeUndefined();
      expect(walletState.balance.toFixed(4)).toBe('0.0000');
      expect(walletState.debt.toFixed(4)).toBe('15.0000');
    } finally {
      if (original !== undefined) process.env.STRICT_GLOBAL_INVARIANT = original;
    }
  });

  it('wallet=0, invoice=20, DEBT_ON_ACCOUNT → SHORTFALL=20, NO PAYMENT:WALLET: row', async () => {
    const { tx, walletState, writes } = makeTxFor({
      walletBalance: '0.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    const { service } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('20.0000'),
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
    );

    expect(walletState.balance.toFixed(4)).toBe('0.0000');
    expect(walletState.debt.toFixed(4)).toBe('20.0000');
    const shortfallRow = writes.find(
      (w) => w.source === DebtSource.INVOICE_SHORTFALL,
    );
    expect(shortfallRow).toBeDefined();
    expect(new Prisma.Decimal(shortfallRow!.amount.toString()).toFixed(4)).toBe(
      '20.0000',
    );
    expect(
      writes.find((w) => w.sourceRef.startsWith('PAYMENT:WALLET:')),
    ).toBeUndefined();
  });
});

describe('V20.3 — true-accounting flag (V20_3_TRUE_ACCOUNTING=true)', () => {
  // wallet=5, invoice=20, DEBT_ON_ACCOUNT under V20.3:
  //   1. Issuance: DR AR 20 / CR REVENUE 20  → journalAR = 20
  //   2. SHORTFALL row: amount = 20 (FULL invoice), no journal mirror
  //   3. Wallet absorption: DR WALLET_LIAB 5 / CR AR 5  → journalAR = 15
  //   4. wallet.debt = 15
  //   5. Phase 18 invariant uses gross SHORTFALL=20 minus PAYMENT=5 = 15 ✓
  //   6. Phase 29 lockstep: ledgerNet=15, journalAR=15 ✓
  //
  // The mock's journalLine.findMany must reflect the V20.3 issuance
  // entry (DR AR for full invoice) plus the V3 wallet absorption
  // (CR AR for the wallet portion). We override it per test for
  // V20.3 because the default mock only knows the V20.2 shape.
  it('wallet=5, invoice=20, DEBT_ON_ACCOUNT → gross SHORTFALL=20 + issuance entry + V3 wallet absorption', async () => {
    const original = process.env.V20_3_TRUE_ACCOUNTING;
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    try {
      const { tx, walletState, writes } = makeTxFor({
        walletBalance: '5.0000',
        walletDebt: '0.0000',
        totalPrice: '20.0000',
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
      const { service, journal } = makeService();

      // Override journalLine.findMany so the lockstep sees the
      // V20.3 expected journal AR balance. Issuance(+20) + wallet
      // absorption v3 (-5) = 15.
      (tx.journalLine as { findMany: jest.Mock }).findMany = jest.fn(() =>
        Promise.resolve([
          { debit: new Prisma.Decimal('20'), credit: new Prisma.Decimal('0') },
          { debit: new Prisma.Decimal('0'), credit: new Prisma.Decimal('5') },
        ]),
      );

      await service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('20.0000'),
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
      );

      expect(walletState.balance.toFixed(4)).toBe('0.0000');
      expect(walletState.debt.toFixed(4)).toBe('15.0000');

      // Phase 32 — SHORTFALL.amount is now the FULL invoice (20), not
      // the post-wallet remainder (15).
      const shortfallRow = writes.find(
        (w) => w.source === DebtSource.INVOICE_SHORTFALL,
      );
      expect(shortfallRow).toBeDefined();
      expect(
        new Prisma.Decimal(shortfallRow!.amount.toString()).toFixed(4),
      ).toBe('20.0000');
      expect(shortfallRow!.note).toBe('Invoice issued (full receivable)');

      // Phase 31 — issuance entry was emitted with the FULL invoice.
      expect(journal.appendInvoiceIssuanceEntrySafe).toHaveBeenCalledTimes(1);
      const issuanceCall =
        journal.appendInvoiceIssuanceEntrySafe.mock.calls[0]![1];
      expect(issuanceCall.customerId).toBe(CUSTOMER_ID);
      expect(issuanceCall.orderId).toBe(ORDER_ID);
      expect(
        new Prisma.Decimal(issuanceCall.amount.toString()).toFixed(4),
      ).toBe('20.0000');

      // Phase 33 — V3 wallet absorption (DR WALLET_LIAB / CR AR), not V2.
      expect(journal.appendWalletAbsorptionEntryV3Safe).toHaveBeenCalledTimes(
        1,
      );
      expect(journal.appendWalletAbsorptionEntrySafe).not.toHaveBeenCalled();
      const walletV3Call =
        journal.appendWalletAbsorptionEntryV3Safe.mock.calls[0]![1];
      expect(walletV3Call.customerId).toBe(CUSTOMER_ID);
      expect(walletV3Call.orderId).toBe(ORDER_ID);
      expect(
        new Prisma.Decimal(walletV3Call.amount.toString()).toFixed(4),
      ).toBe('5.0000');

      // Phase 32 follow-up — the legacy DebtLedger mirror must NOT
      // have been called for the SHORTFALL row (would double-count
      // AR against the issuance entry).
      const mirrorCalls =
        journal.mirrorDebtLedgerEntrySafe.mock.calls.filter(
          (c) => c[1]?.source === DebtSource.INVOICE_SHORTFALL,
        );
      expect(mirrorCalls).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.V20_3_TRUE_ACCOUNTING;
      else process.env.V20_3_TRUE_ACCOUNTING = original;
    }
  });

  it('Phase 29 — V20.3 lockstep counts wallet PAYMENTs in deduction (15 vs 15 → OK)', async () => {
    // Under V20.3 the SHORTFALL is gross (20) and the wallet PAYMENT
    // row reduces AR (5). ledgerNet under the V20.3 path =
    //   inv(20) − pay(5) = 15
    // journalAR (issuance 20 − wallet absorption 5) = 15. Lockstep
    // passes, settlement commits.
    const original = process.env.V20_3_TRUE_ACCOUNTING;
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
    try {
      const { tx } = makeTxFor({
        walletBalance: '5.0000',
        walletDebt: '0.0000',
        totalPrice: '20.0000',
        posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
      });
      const { service } = makeService();

      (tx.journalLine as { findMany: jest.Mock }).findMany = jest.fn(() =>
        Promise.resolve([
          { debit: new Prisma.Decimal('20'), credit: new Prisma.Decimal('0') },
          { debit: new Prisma.Decimal('0'), credit: new Prisma.Decimal('5') },
        ]),
      );

      await expect(
        service.applyOrderWalletSettlementForCompletedOrder(
          tx as never,
          ORDER_ID,
          ACTOR_ID,
          {
            customerId: CUSTOMER_ID,
            totalPrice: new Prisma.Decimal('20.0000'),
            posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
            walletSettledAt: null,
            skipPerformerLookup: true,
          },
        ),
      ).resolves.toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.V20_3_TRUE_ACCOUNTING;
      else process.env.V20_3_TRUE_ACCOUNTING = original;
    }
  });
});
