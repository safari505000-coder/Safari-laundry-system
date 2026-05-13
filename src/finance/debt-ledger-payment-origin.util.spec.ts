import { Prisma } from '@prisma/client';
import { DebtSource } from './enums/debt-source.enum';
import {
  assertDebtLedgerPaymentWrite,
  isRealDebtLedgerPayment,
  isWalletAbsorptionLedgerEntry,
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

  describe('V20.1 — wallet absorption rows', () => {
    const actorUserId = '11111111-1111-4111-8111-111111111111';

    it('accepts PAYMENT:WALLET: at the write site', () => {
      expect(() =>
        assertDebtLedgerPaymentWrite({
          source: DebtSource.PAYMENT,
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:00000000-0000-4000-8000-000000000000:1700000000000',
        }),
      ).not.toThrow();
    });

    it('accepts PAYMENT:WALLET:BACKFILL: at the write site', () => {
      expect(() =>
        assertDebtLedgerPaymentWrite({
          source: DebtSource.PAYMENT,
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:BACKFILL:tx-abc',
        }),
      ).not.toThrow();
    });

    it('does NOT count PAYMENT:WALLET: as AR-reducing (would double-credit)', () => {
      expect(
        isRealDebtLedgerPayment({
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:order-id:1700000000000',
        }),
      ).toBe(false);
    });

    it('does NOT count PAYMENT:WALLET:BACKFILL: as AR-reducing', () => {
      expect(
        isRealDebtLedgerPayment({
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:BACKFILL:tx-abc',
        }),
      ).toBe(false);
    });

    it('flags PAYMENT:WALLET: as a wallet-absorption row', () => {
      expect(
        isWalletAbsorptionLedgerEntry({
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:order-id:1700000000000',
        }),
      ).toBe(true);
      expect(
        isWalletAbsorptionLedgerEntry({
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId,
          sourceRef: 'PAYMENT:WALLET:BACKFILL:tx-abc',
        }),
      ).toBe(true);
    });

    it('does not flag CASH PAYMENT as wallet absorption', () => {
      expect(
        isWalletAbsorptionLedgerEntry({
          source: DebtSource.PAYMENT,
          amount: new Prisma.Decimal('5.0000'),
          actorUserId,
          sourceRef: 'PAYMENT:CASH:order-id:1700000000000',
        }),
      ).toBe(false);
    });
  });
});
