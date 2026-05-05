import {
  kpiTrendDirection,
  reconciliationBadgeFromDiff,
  reconciliationDeltaKds,
} from './accountant-dashboard-math';

describe('reconciliationDeltaKds (operator status)', () => {
  it('GREEN when handed equals collected', () => {
    const r = reconciliationDeltaKds(300, 300);
    expect(r.deltaKd).toBe('0.0000');
    expect(r.shortfallKd).toBe('0.0000');
    expect(r.status).toBe('GREEN');
  });

  it('collected=300 handed=250 → shortfall 50 RED; delta −50', () => {
    const r = reconciliationDeltaKds(300, 250);
    expect(r.shortfallKd).toBe('50.0000');
    expect(r.deltaKd).toBe('-50.0000');
    expect(r.status).toBe('RED');
    expect(Number(r.shortfallKd)).toBe(300 - 250);
    expect(Number(r.deltaKd)).toBe(250 - 300);
    expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
  });

  it('collected=300 handed=350 → delta 50 YELLOW; shortfall −50', () => {
    const r = reconciliationDeltaKds(300, 350);
    expect(r.deltaKd).toBe('50.0000');
    expect(r.shortfallKd).toBe('-50.0000');
    expect(r.status).toBe('YELLOW');
    expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
  });

  it('invariant shortfall = −delta for arbitrary amounts', () => {
    for (const [c, h] of [
      [0, 0],
      [1.25, 3.5],
      [100, 0],
      [0, 0.0002],
    ] as const) {
      const r = reconciliationDeltaKds(c, h);
      expect(Number(r.shortfallKd)).toBeCloseTo(-Number(r.deltaKd), 4);
    }
  });
});

describe('reconciliationBadgeFromDiff', () => {
  it('returns green when handed equals collected', () => {
    expect(reconciliationBadgeFromDiff(0)).toBe('green');
    expect(reconciliationBadgeFromDiff(0.00005)).toBe('green');
    expect(reconciliationBadgeFromDiff(-0.00005)).toBe('green');
  });

  it('returns red when handed exceeds collected (timing gap)', () => {
    expect(reconciliationBadgeFromDiff(0.0002)).toBe('red');
    expect(reconciliationBadgeFromDiff(10)).toBe('red');
  });

  it('returns yellow when handed is below collected', () => {
    expect(reconciliationBadgeFromDiff(-0.0002)).toBe('yellow');
    expect(reconciliationBadgeFromDiff(-5)).toBe('yellow');
  });
});

describe('kpiTrendDirection', () => {
  it('is flat when previous was zero and current is zero', () => {
    expect(kpiTrendDirection(0, 0)).toEqual({
      direction: 'flat',
      pctVsPrevious: 0,
    });
  });

  it('treats prior zero with positive current as up', () => {
    expect(kpiTrendDirection(100, 0)).toEqual({
      direction: 'up',
      pctVsPrevious: 100,
    });
  });

  it('computes rounded percent vs previous', () => {
    expect(kpiTrendDirection(110, 100)).toEqual({
      direction: 'up',
      pctVsPrevious: 10,
    });
    expect(kpiTrendDirection(90, 100)).toEqual({
      direction: 'down',
      pctVsPrevious: -10,
    });
  });

  it('treats tiny moves as flat', () => {
    expect(kpiTrendDirection(100.2, 100).direction).toBe('flat');
    expect(kpiTrendDirection(99.8, 100).direction).toBe('flat');
  });
});
