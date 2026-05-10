import {
  formatKwdAmount,
  formatKwdLabel,
  formatSignedKwdLabel,
} from './finance-money';

describe('canonical KWD formatting', () => {
  it('always displays exactly three decimals', () => {
    expect(formatKwdAmount('3.25')).toBe('3.250');
    expect(formatKwdAmount(0)).toBe('0.000');
    expect(formatKwdAmount('25')).toBe('25.000');
    expect(formatKwdAmount('11.25')).toBe('11.250');
  });

  it('formats labels with Kuwaiti Dinar suffix', () => {
    expect(formatKwdLabel('3.2500')).toBe('3.250 د.ك');
  });

  it('formats signed labels without changing the absolute precision', () => {
    expect(formatSignedKwdLabel('1')).toBe('+1.000 د.ك');
    expect(formatSignedKwdLabel('-1')).toBe('-1.000 د.ك');
    expect(formatSignedKwdLabel('0')).toBe('0.000 د.ك');
  });
});
