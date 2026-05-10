import { PosPaymentMethod } from '@prisma/client';
import {
  fromDbPosPaymentMethod,
  toDbPosPaymentMethod,
} from './canonical-payment-method';

describe('canonical payment method adapter', () => {
  it('accepts SUBSCRIPTION as the public method and maps it to the audited DB enum', () => {
    expect(toDbPosPaymentMethod('SUBSCRIPTION')).toBe(
      PosPaymentMethod.SUBSCRIPTION_WALLET,
    );
  });

  it('keeps legacy SUBSCRIPTION_WALLET readable as public SUBSCRIPTION', () => {
    expect(fromDbPosPaymentMethod(PosPaymentMethod.SUBSCRIPTION_WALLET)).toBe(
      'SUBSCRIPTION',
    );
  });

  it('normalizes on-account aliases to DEBT_ON_ACCOUNT', () => {
    expect(toDbPosPaymentMethod('Debt / On Account')).toBe(
      PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
    expect(toDbPosPaymentMethod('on-account')).toBe(
      PosPaymentMethod.DEBT_ON_ACCOUNT,
    );
  });
});
