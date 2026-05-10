import { describe, expect, it } from 'vitest';
import {
  absKwdString,
  addKwdStrings,
  chartScalarFromKwdString,
  compareKwdStrings,
  formatKwdLabel,
  formatKwdLabelGrouped,
  formatSignedKwdLabel,
  isMaterialKd,
  isNegativeKd,
  isPositiveKd,
  isZeroKd,
  kwdToMicroFils,
  microFilsToKwd,
  subtractKwdStrings,
  sumKwdStrings,
  sumKwdStringsPrecise,
} from './kwd';

describe('frontend KWD formatting', () => {
  it('formats all amounts with exactly three decimals', () => {
    expect(formatKwdLabel('3.25')).toBe('3.250 د.ك');
    expect(formatKwdLabel('30.2500')).toBe('30.250 د.ك');
    expect(formatKwdLabel(0)).toBe('0.000 د.ك');
    expect(formatKwdLabel('25')).toBe('25.000 د.ك');
    expect(formatKwdLabel('11.25')).toBe('11.250 د.ك');
  });

  it('keeps arithmetic helpers aligned to display precision', () => {
    expect(sumKwdStrings(['1.1111', '2.2222'])).toBe('3.333');
    expect(subtractKwdStrings('5.0000', '1.7500')).toBe('3.250');
    expect(formatSignedKwdLabel('-3.25')).toBe('-3.250 د.ك');
  });

  it('formatKwdLabelGrouped preserves the canonical 3dp + suffix and adds locale grouping', () => {
    expect(formatKwdLabelGrouped('3.25')).toBe('3.250 د.ك');
    expect(formatKwdLabelGrouped(0)).toBe('0.000 د.ك');
    expect(formatKwdLabelGrouped('1234.5')).toBe('1,234.500 د.ك');
    expect(formatKwdLabelGrouped('1234567.891')).toBe('1,234,567.891 د.ك');
    expect(formatKwdLabelGrouped('not-a-number')).toBe('0.000 د.ك');
  });

  it('sign predicates classify KWD decimal strings without coercion drift', () => {
    expect(isPositiveKd('1.500')).toBe(true);
    expect(isPositiveKd('0.000')).toBe(false);
    expect(isPositiveKd('-1.500')).toBe(false);
    expect(isPositiveKd(null)).toBe(false);
    expect(isPositiveKd(undefined)).toBe(false);

    expect(isNegativeKd('-0.001')).toBe(true);
    expect(isNegativeKd('0.000')).toBe(false);
    expect(isNegativeKd('1.500')).toBe(false);
    expect(isNegativeKd(null)).toBe(false);

    expect(isZeroKd('0.000')).toBe(true);
    expect(isZeroKd('0')).toBe(true);
    expect(isZeroKd('')).toBe(true);
    expect(isZeroKd(null)).toBe(true);
    expect(isZeroKd(undefined)).toBe(true);
    expect(isZeroKd('1.500')).toBe(false);
  });

  it('compareKwdStrings is a stable comparator for Array.prototype.sort', () => {
    const rows = ['10.000', '0.500', '-1.250', '5.500'];
    const sorted = [...rows].sort(compareKwdStrings);
    expect(sorted).toEqual(['-1.250', '0.500', '5.500', '10.000']);
    expect(compareKwdStrings('1.000', '1.000')).toBe(0);
    expect(compareKwdStrings('NaN', 'NaN')).toBe(0);
  });

  it('isMaterialKd marks values below the 4dp boundary as immaterial', () => {
    expect(isMaterialKd('0.0001')).toBe(true);
    expect(isMaterialKd('0.0002')).toBe(true);
    expect(isMaterialKd('-0.0001')).toBe(true);
    expect(isMaterialKd('0.00009')).toBe(false);
    expect(isMaterialKd('0.0000')).toBe(false);
    expect(isMaterialKd('0')).toBe(false);
    expect(isMaterialKd(null)).toBe(false);
    expect(isMaterialKd(undefined)).toBe(false);
    expect(isMaterialKd('')).toBe(false);
    expect(isMaterialKd('NaN')).toBe(false);
  });
});

// V23.1 Phase 7 — BigInt-precise canonical math.
describe('BigInt-precise KWD arithmetic', () => {
  describe('kwdToMicroFils / microFilsToKwd', () => {
    it('round-trips canonical KWD strings without drift', () => {
      expect(microFilsToKwd(kwdToMicroFils('12.500'))).toBe('12.5000');
      expect(microFilsToKwd(kwdToMicroFils('0.0001'))).toBe('0.0001');
      expect(microFilsToKwd(kwdToMicroFils('-3.250'))).toBe('-3.2500');
      expect(microFilsToKwd(kwdToMicroFils('1234567.8901'))).toBe('1234567.8901');
    });

    it('treats null/undefined/empty as zero', () => {
      expect(kwdToMicroFils(null)).toBe(0n);
      expect(kwdToMicroFils(undefined)).toBe(0n);
      expect(kwdToMicroFils('')).toBe(0n);
      expect(kwdToMicroFils('   ')).toBe(0n);
    });

    it('treats malformed strings as zero (defensive)', () => {
      expect(kwdToMicroFils('abc')).toBe(0n);
      expect(kwdToMicroFils('12.5e3')).toBe(0n);
      expect(kwdToMicroFils('NaN')).toBe(0n);
    });

    it('truncates beyond 4dp (matches Prisma.Decimal scale)', () => {
      expect(microFilsToKwd(kwdToMicroFils('12.50005'))).toBe('12.5000');
    });
  });

  describe('addKwdStrings', () => {
    it('avoids the classic 0.1 + 0.2 float drift', () => {
      // Native JS:  0.1 + 0.2 === 0.30000000000000004
      expect(addKwdStrings('0.1', '0.2')).toBe('0.3000');
    });

    it('handles negative addends', () => {
      expect(addKwdStrings('5.000', '-2.500')).toBe('2.5000');
      expect(addKwdStrings('-5.000', '-2.500')).toBe('-7.5000');
    });
  });

  describe('sumKwdStringsPrecise', () => {
    it('sums an array of canonical KWD strings without drift', () => {
      expect(sumKwdStringsPrecise(['1.1111', '2.2222'])).toBe('3.3333');
      expect(sumKwdStringsPrecise(['0.1', '0.2', '0.3'])).toBe('0.6000');
    });

    it('handles empty iterables', () => {
      expect(sumKwdStringsPrecise([])).toBe('0.0000');
    });

    it('skips null/undefined/empty entries gracefully', () => {
      expect(sumKwdStringsPrecise(['1.0', null, '2.0', undefined, ''])).toBe('3.0000');
    });

    it('survives 1000-element arrays without floating-point drift', () => {
      const rows = Array.from({ length: 1000 }, () => '0.0001');
      expect(sumKwdStringsPrecise(rows)).toBe('0.1000');
    });
  });

  describe('absKwdString', () => {
    it('returns the absolute value as a 4dp string', () => {
      expect(absKwdString('-12.500')).toBe('12.5000');
      expect(absKwdString('12.500')).toBe('12.5000');
      expect(absKwdString('0.000')).toBe('0.0000');
      expect(absKwdString(null)).toBe('0.0000');
    });
  });

  describe('chartScalarFromKwdString', () => {
    it('returns a finite Number for SVG/chart positioning', () => {
      expect(chartScalarFromKwdString('12.500')).toBe(12.5);
      expect(chartScalarFromKwdString('0')).toBe(0);
      expect(chartScalarFromKwdString(null)).toBe(0);
      expect(chartScalarFromKwdString('not-a-number')).toBe(0);
    });
  });
});
