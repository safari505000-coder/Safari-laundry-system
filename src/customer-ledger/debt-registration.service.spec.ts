import { Prisma } from '@prisma/client';
import { JOURNAL_ACCOUNTS } from '../general-ledger/double-entry-journal.service';
import { DebtRegistrationService } from './debt-registration.service';
import { WalletService } from './wallet.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const WALLET_ID = '44444444-4444-4444-8444-444444444444';

function makeTx(opts: {
  walletDebt: string;
  existingReceivable?: boolean;
  existingAfterLock?: boolean;
}) {
  const walletState = {
    balance: new Prisma.Decimal('0.0000'),
    debt: new Prisma.Decimal(opts.walletDebt),
  };
  const journalEntryFindUnique = jest
    .fn()
    .mockResolvedValueOnce(opts.existingReceivable ? { id: 'existing' } : null)
    .mockResolvedValueOnce(opts.existingAfterLock ? { id: 'existing' } : null)
    .mockResolvedValue(null);

  return {
    walletState,
    tx: {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customerWallet: {
        upsert: jest.fn().mockResolvedValue({
          ...walletState,
          id: WALLET_ID,
          customerId: CUSTOMER_ID,
        }),
        findUniqueOrThrow: jest.fn(() =>
          Promise.resolve({
            ...walletState,
            id: WALLET_ID,
            customerId: CUSTOMER_ID,
          }),
        ),
        update: jest.fn(({ data }: { data: { debt: Prisma.Decimal } }) => {
          walletState.debt = data.debt;
          return Promise.resolve({ ...walletState, id: WALLET_ID });
        }),
      },
      journalEntry: {
        findUnique: journalEntryFindUnique,
      },
      order: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    },
  };
}

function makeService() {
  const wallets = new WalletService();
  const journal = {
    appendBalanced: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DebtRegistrationService(
    {} as never,
    wallets,
    journal as never,
  );
  return { service, journal };
}

describe('DebtRegistrationService', () => {
  it('registers debt immediately for PAYMENT_LINK order', async () => {
    const { tx, walletState } = makeTx({ walletDebt: '0.0000' });
    const { service, journal } = makeService();

    await service.registerPendingPaymentLinkReceivableTx(
      tx as never,
      ORDER_ID,
      CUSTOMER_ID,
      new Prisma.Decimal('25.0000'),
    );

    expect(walletState.debt.toString()).toBe('25');
    expect(tx.customerWallet.update).toHaveBeenCalled();
    expect(journal.appendBalanced).toHaveBeenCalled();
  });

  it('is idempotent and does not register twice for same orderId', async () => {
    const { tx, walletState } = makeTx({
      walletDebt: '10.0000',
      existingReceivable: true,
    });
    const { service, journal } = makeService();

    await service.registerPendingPaymentLinkReceivableTx(
      tx as never,
      ORDER_ID,
      CUSTOMER_ID,
      '25.0000',
    );

    expect(walletState.debt.toString()).toBe('10');
    expect(tx.customerWallet.update).not.toHaveBeenCalled();
    expect(journal.appendBalanced).not.toHaveBeenCalled();
  });

  it('increases CustomerWallet.debt by correct amount', async () => {
    const { tx, walletState } = makeTx({ walletDebt: '7.1000' });
    const { service } = makeService();

    await service.registerPendingPaymentLinkReceivableTx(
      tx as never,
      ORDER_ID,
      CUSTOMER_ID,
      '2.9000',
    );

    expect(walletState.debt.toFixed(4)).toBe('10.0000');
    expect(tx.customerWallet.update).toHaveBeenCalledWith({
      where: { id: WALLET_ID },
      data: { debt: new Prisma.Decimal('10.0000') },
    });
  });

  it('writes Journal AR entry with correct sourceRef', async () => {
    const { tx } = makeTx({ walletDebt: '0.0000' });
    const { service, journal } = makeService();

    await service.registerPendingPaymentLinkReceivableTx(
      tx as never,
      ORDER_ID,
      CUSTOMER_ID,
      '25.0000',
    );

    expect(journal.appendBalanced).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        source: 'PAYMENT_LINK_RECEIVABLE',
        sourceRef: `PAYMENT_LINK_RECEIVABLE:${ORDER_ID}`,
        customerId: CUSTOMER_ID,
        orderId: ORDER_ID,
        lines: [
          expect.objectContaining({
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            debit: new Prisma.Decimal('25.0000'),
          }),
          expect.objectContaining({
            accountCode: JOURNAL_ACCOUNTS.REVENUE,
            credit: new Prisma.Decimal('25.0000'),
          }),
        ],
      }),
    );
  });

  it('does not touch walletSettledAt', async () => {
    const { tx } = makeTx({ walletDebt: '0.0000' });
    const { service } = makeService();

    await service.registerPendingPaymentLinkReceivableTx(
      tx as never,
      ORDER_ID,
      CUSTOMER_ID,
      '25.0000',
    );

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(tx.customerWallet.update.mock.calls)).not.toContain(
      'walletSettledAt',
    );
  });
});
