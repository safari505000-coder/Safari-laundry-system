import { DebtSource, Prisma } from '@prisma/client';
import {
  assertDebtLedgerPaymentWrite,
  isRealDebtLedgerPayment,
} from './debt-ledger-payment-origin.util';

describe('debt ledger payment origin guard', () => {
  it('rejects PAYMENT without origin/sourceRef', () => {
    expect(() =>
      assertDebtLedgerPaymentWrite({
        source: DebtSource.PAYMENT,
        actorUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toThrow('PAYMENT_ORIGIN_REQUIRED');
  });

  it('rejects PAYMENT without actor', () => {
    expect(() =>
      assertDebtLedgerPaymentWrite({
        source: DebtSource.PAYMENT,
        sourceRef: 'PAYMENT:CASH:test',
      }),
    ).toThrow('PAYMENT_ACTOR_REQUIRED');
  });

  it('rejects invalid payment sources', () => {
    expect(() =>
      assertDebtLedgerPaymentWrite({
        source: DebtSource.PAYMENT,
        actorUserId: '11111111-1111-4111-8111-111111111111',
        sourceRef: 'ADJUSTMENT:VOID:test',
      }),
    ).toThrow('INVALID_PAYMENT_SOURCE');
  });

  it('marks real money PAYMENT rows as FIFO-eligible', () => {
    expect(
      isRealDebtLedgerPayment({
        source: DebtSource.PAYMENT,
        amount: new Prisma.Decimal('0.5000'),
        actorUserId: '11111111-1111-4111-8111-111111111111',
        sourceRef: 'PAYMENT:CASH:test',
      }),
    ).toBe(true);
  });

  it('prevents fake PAYMENT rows from affecting FIFO invoicePaid', () => {
    expect(
      isRealDebtLedgerPayment({
        source: DebtSource.PAYMENT,
        amount: new Prisma.Decimal('0.5000'),
        actorUserId: null,
        sourceRef: null,
        note: 'Debt reversed by invoice void / edit (supervisor)',
      }),
    ).toBe(false);
  });
});
