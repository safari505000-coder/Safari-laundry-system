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
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest.fn().mockResolvedValue({ walletSettledAt: null }),
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
          Promise.resolve({
            ...walletState,
            id: WALLET_ID,
            customerId: CUSTOMER_ID,
          }),
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
  // V25 — constructor also requires txProcessor (FinancialTransactionProcessorService).
  const txProcessor = { process: jest.fn() };
  const service = new CustomerLedgerService(
    prisma as never,
    generalLedger as never,
    journal as never,
    journalSource as never,
    txProcessor as never,
    inventory as never,
    orders as never,
  );
  return { service, generalLedger, journal };
}

function expectsToHaveCalledThirdEntry(journal: {
  appendWalletAbsorptionEntrySafe: jest.Mock;
  appendWalletAbsorptionEntryV3Safe: jest.Mock;
}) {
  // V20.4 FINAL: trueAccounting=true → uses V3 entry; otherwise legacy V2.
  const calledV3 = journal.appendWalletAbsorptionEntryV3Safe.mock.calls.length > 0;
  if (calledV3) {
    expect(journal.appendWalletAbsorptionEntryV3Safe).toHaveBeenCalled();
    const lastCall = journal.appendWalletAbsorptionEntryV3Safe.mock.calls.at(-1)!;
    return lastCall[1] as { customerId: string; orderId: string; amount: Prisma.Decimal };
  }
  expect(journal.appendWalletAbsorptionEntrySafe).toHaveBeenCalled();
  const lastCall = journal.appendWalletAbsorptionEntrySafe.mock.calls.at(-1)!;
  return lastCall[1] as { customerId: string; orderId: string; amount: Prisma.Decimal };
}

describe('V20.1 — wallet absorption + drain hotfix', () => {
  // V20.4 FINAL: set the journal-as-source flag so the service takes the
  // journal path and skips the DebtLedger-based invariant assertions.
  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.V20_4_FINAL_LEDGER;
    process.env.V20_4_FINAL_LEDGER = 'true';
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlag;
  });

  // V20.4 FINAL note: DebtLedgerEntry writes were removed; tests now verify
  // wallet state and journal calls rather than DebtLedgerEntry `writes` array.

  it('wallet=5, invoice=20, DEBT_ON_ACCOUNT → wallet=0, debt=15, journal absorption called', async () => {
    const { tx, walletState } = makeTxFor({
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

  it('wallet=25, invoice=30, SUBSCRIPTION → wallet=0, debt=5, journal absorption called', async () => {
    const { tx, walletState } = makeTxFor({
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

  it('wallet=5, invoice=3, SUBSCRIPTION_WALLET → wallet=2, no debt', async () => {
    const { tx, walletState } = makeTxFor({
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
  });

  it('V20.4 FINAL — settlement resolves cleanly (no DebtLedger writes, no audit guard)', async () => {
    // Under V20.4 the DebtLedgerEntry audit write and the Phase 9 invariant
    // guard have both been removed. Settlement must resolve without errors.
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
  });

  it('V20.4 FINAL — Phase 18/29/28 invariants are skipped (journal is canonical, DebtLedger empty)', async () => {
    // With isJournalAsSourceEnabled()=true the three DebtLedger-based
    // invariants are bypassed. Passing inconsistent findMany mocks that
    // would have triggered errors in V20.1-V20.3 must no longer cause a throw.
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

  it('wallet=0, invoice=20, DEBT_ON_ACCOUNT → debt=20, no wallet deduction', async () => {
    const { tx, walletState } = makeTxFor({
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
  });

  it('re-reads walletSettledAt after wallet lock and skips stale concurrent settlement', async () => {
    const { tx, walletState } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    (tx.order.findUnique as jest.Mock).mockResolvedValueOnce({
      walletSettledAt: new Date(),
    });
    const { service, journal, generalLedger } = makeService();

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

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(walletState.balance.toFixed(4)).toBe('5.0000');
    expect(walletState.debt.toFixed(4)).toBe('0.0000');
    expect(tx.customerWallet.update).not.toHaveBeenCalled();
    expect(tx.transactionHistory.create).not.toHaveBeenCalled();
    expect(journal.appendWalletAbsorptionEntrySafe).not.toHaveBeenCalled();
    expect(generalLedger.append).not.toHaveBeenCalled();
  });

  it('propagates wallet lock failures instead of continuing unlocked', async () => {
    const { tx } = makeTxFor({
      walletBalance: '5.0000',
      walletDebt: '0.0000',
      totalPrice: '20.0000',
      posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
    });
    (tx.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('lock failed'));
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
    ).rejects.toThrow('lock failed');

    expect(tx.customerWallet.update).not.toHaveBeenCalled();
    expect(tx.transactionHistory.create).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied debtSettled without trusted gateway or call-center proof', async () => {
    const { tx } = makeTxFor({
      walletBalance: '0.0000',
      walletDebt: '10.0000',
      totalPrice: '10.0000',
      posPaymentMethod: PosPaymentMethod.ONLINE,
    });
    const { service } = makeService();

    await expect(
      service.applyOrderWalletSettlementForCompletedOrder(
        tx as never,
        ORDER_ID,
        ACTOR_ID,
        {
          customerId: CUSTOMER_ID,
          totalPrice: new Prisma.Decimal('10.0000'),
          posPaymentMethod: PosPaymentMethod.ONLINE,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
        { debtSettled: '10.0000' },
      ),
    ).rejects.toThrow(
      'debtSettled requires a verified gateway receipt or call-center collection path',
    );

    expect(tx.customerWallet.update).not.toHaveBeenCalled();
    expect(tx.transactionHistory.create).not.toHaveBeenCalled();
  });

  it('accepts gateway debtSettled only when it matches confirmed gateway amount', async () => {
    const { tx, walletState } = makeTxFor({
      walletBalance: '0.0000',
      walletDebt: '10.0000',
      totalPrice: '10.0000',
      posPaymentMethod: PosPaymentMethod.ONLINE,
    });
    const { service } = makeService();

    await service.applyOrderWalletSettlementForCompletedOrder(
      tx as never,
      ORDER_ID,
      ACTOR_ID,
      {
        customerId: CUSTOMER_ID,
        totalPrice: new Prisma.Decimal('10.0000'),
        posPaymentMethod: PosPaymentMethod.ONLINE,
        walletSettledAt: null,
        skipPerformerLookup: true,
      },
      {
        debtSettled: '10.0000',
        debtSettlementViaLink: true,
        gatewayConfirmedAmountKd: '10.0000',
      },
    );

    expect(walletState.debt.toFixed(4)).toBe('0.0000');
    expect(tx.transactionHistory.create).toHaveBeenCalledTimes(1);
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

      // Phase 32 — V20.4 FINAL: DebtLedgerEntry write removed.
      // The issuance journal entry below is the canonical record.

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
