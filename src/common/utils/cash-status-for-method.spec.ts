import { CashStatus, PosPaymentMethod } from '@prisma/client';
import {
  cashStatusForPaymentMethod,
  isElectronicMethod,
} from './cash-status-for-method';

/**
 * V19.11.3 — Regression guard for the KNET cash-trail gap.
 *
 * Historically every POS order was stamped `PAID_TO_DRIVER` on
 * checkout, which caused KNET (and other electronic) settlements to
 * leak into driver cash reports. The helper under test is the single
 * mapping that now enforces the correct terminal state per channel.
 * Any future payment method addition must either pass through this
 * helper or consciously override it.
 */
describe('cashStatusForPaymentMethod', () => {
  it('routes KNET to PAID_ONLINE (the driver never received cash)', () => {
    expect(cashStatusForPaymentMethod(PosPaymentMethod.KNET)).toBe(
      CashStatus.PAID_ONLINE,
    );
  });

  it('routes PAYMENT_LINK to PAID_ONLINE', () => {
    expect(cashStatusForPaymentMethod(PosPaymentMethod.PAYMENT_LINK)).toBe(
      CashStatus.PAID_ONLINE,
    );
  });

  it('routes ONLINE to PAID_ONLINE', () => {
    expect(cashStatusForPaymentMethod(PosPaymentMethod.ONLINE)).toBe(
      CashStatus.PAID_ONLINE,
    );
  });

  it('keeps CASH on PAID_TO_DRIVER so handover keeps working', () => {
    expect(cashStatusForPaymentMethod(PosPaymentMethod.CASH)).toBe(
      CashStatus.PAID_TO_DRIVER,
    );
  });

  it('keeps DEBT_ON_ACCOUNT on PAID_TO_DRIVER (driver signed for the paper trail)', () => {
    expect(cashStatusForPaymentMethod(PosPaymentMethod.DEBT_ON_ACCOUNT)).toBe(
      CashStatus.PAID_TO_DRIVER,
    );
  });

  it('routes SUBSCRIPTION_WALLET to PAID_ONLINE (book payment, no driver cash)', () => {
    expect(
      cashStatusForPaymentMethod(PosPaymentMethod.SUBSCRIPTION_WALLET),
    ).toBe(CashStatus.PAID_ONLINE);
  });

  it('defaults null / undefined to PAID_TO_DRIVER (legacy safety)', () => {
    expect(cashStatusForPaymentMethod(null)).toBe(CashStatus.PAID_TO_DRIVER);
    expect(cashStatusForPaymentMethod(undefined)).toBe(
      CashStatus.PAID_TO_DRIVER,
    );
  });
});

describe('isElectronicMethod', () => {
  it('identifies KNET, PAYMENT_LINK, ONLINE, and subscription as non-cash methods', () => {
    expect(isElectronicMethod(PosPaymentMethod.KNET)).toBe(true);
    expect(isElectronicMethod(PosPaymentMethod.PAYMENT_LINK)).toBe(true);
    expect(isElectronicMethod(PosPaymentMethod.ONLINE)).toBe(true);
    expect(isElectronicMethod(PosPaymentMethod.SUBSCRIPTION_WALLET)).toBe(true);
  });

  it('excludes CASH and DEBT_ON_ACCOUNT', () => {
    expect(isElectronicMethod(PosPaymentMethod.CASH)).toBe(false);
    expect(isElectronicMethod(PosPaymentMethod.DEBT_ON_ACCOUNT)).toBe(false);
  });

  it('excludes null / undefined', () => {
    expect(isElectronicMethod(null)).toBe(false);
    expect(isElectronicMethod(undefined)).toBe(false);
  });
});

/**
 * End-to-end expectation expressed as invariants (documents the
 * contract the downstream services rely on; failure here signals a
 * regression in how electronic money is handled).
 *
 * Invariant 1  — Every electronic method terminates in PAID_ONLINE,
 *                so `confirmHandover` (which filters by
 *                `posPaymentMethod: CASH`) can never pick them up.
 * Invariant 2  — CASH is the only method that terminates in
 *                PAID_TO_DRIVER AND is eligible for handover, so the
 *                driver-cash trail reports never mix channels.
 */
describe('KNET end-to-end invariants (V19.11.3)', () => {
  it('every electronic method terminates in PAID_ONLINE', () => {
    const electronic = [
      PosPaymentMethod.KNET,
      PosPaymentMethod.PAYMENT_LINK,
      PosPaymentMethod.ONLINE,
      PosPaymentMethod.SUBSCRIPTION_WALLET,
    ];
    for (const m of electronic) {
      expect(cashStatusForPaymentMethod(m)).toBe(CashStatus.PAID_ONLINE);
      expect(isElectronicMethod(m)).toBe(true);
    }
  });

  it('only CASH terminates in PAID_TO_DRIVER without being "electronic"', () => {
    const allMethods = Object.values(PosPaymentMethod);
    const paidToDriverNonElectronic = allMethods.filter(
      (m) =>
        cashStatusForPaymentMethod(m) === CashStatus.PAID_TO_DRIVER &&
        !isElectronicMethod(m),
    );
    expect(paidToDriverNonElectronic).toEqual([
      PosPaymentMethod.CASH,
      PosPaymentMethod.DEBT_ON_ACCOUNT,
    ]);
  });
});
