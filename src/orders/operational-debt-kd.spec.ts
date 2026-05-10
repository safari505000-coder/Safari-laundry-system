import { Prisma } from '@prisma/client';
import { resolveOperationalDebtKd } from './orders.service';

const D = (value: string) => new Prisma.Decimal(value);

describe('resolveOperationalDebtKd', () => {
  it('does not double-count wallet debt plus the same open debt-on-account invoice by default', () => {
    const result = resolveOperationalDebtKd({
      ledgerNetKd: D('30.2500'),
      snapshotFromWalletKd: D('30.2500'),
      orderMarketScopeKd: D('60.5000'),
    });

    expect(result.toFixed(4)).toBe('30.2500');
  });

  it('does not expose the retired inflated comparator', () => {
    const result = resolveOperationalDebtKd({
      ledgerNetKd: D('30.2500'),
      snapshotFromWalletKd: D('30.2500'),
      orderMarketScopeKd: D('60.5000'),
    });

    expect(result.toFixed(4)).toBe('30.2500');
  });

  it('ignores open-order gross receivable in the canonical debt resolver', () => {
    const result = resolveOperationalDebtKd({
      ledgerNetKd: D('12.0000'),
      snapshotFromWalletKd: D('15.0000'),
      orderMarketScopeKd: D('99.0000'),
    });

    expect(result.toFixed(4)).toBe('15.0000');
  });
});
