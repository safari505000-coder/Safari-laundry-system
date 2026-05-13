import { Prisma } from '@prisma/client';
import { round4Kd } from './round4kd.util';

/**
 * Unit tests for round4Kd — canonical 4dp banker-rounded KWD formatter.
 *
 * Banker's rounding (ROUND_HALF_EVEN): when the digit to be dropped is
 * exactly 5 (with nothing after it), round to whichever direction makes
 * the last kept digit EVEN.
 *
 *   10.12345 → last kept digit would be 4 (even) → round DOWN → 10.1234
 *   10.12355 → last kept digit would be 5 (odd)  → round UP  → 10.1236
 *
 * This differs from the more common ROUND_HALF_UP where both would
 * round up (10.1235 and 10.1236 respectively).
 */
describe('round4Kd', () => {
  // ─── Normal amounts ────────────────────────────────────────────────────────

  it('formats a value that needs no rounding as 4dp string', () => {
    expect(round4Kd(new Prisma.Decimal('3.2500'))).toBe('3.2500');
    expect(round4Kd(new Prisma.Decimal('1.0000'))).toBe('1.0000');
    expect(round4Kd(new Prisma.Decimal('100'))).toBe('100.0000');
  });

  it('zero → 0.0000', () => {
    expect(round4Kd(new Prisma.Decimal(0))).toBe('0.0000');
    expect(round4Kd(new Prisma.Decimal('0.0000'))).toBe('0.0000');
  });

  it('always returns exactly 4 decimal places (trailing zeros preserved)', () => {
    expect(round4Kd(new Prisma.Decimal('5'))).toBe('5.0000');
    expect(round4Kd(new Prisma.Decimal('5.1'))).toBe('5.1000');
    expect(round4Kd(new Prisma.Decimal('5.12'))).toBe('5.1200');
    expect(round4Kd(new Prisma.Decimal('5.123'))).toBe('5.1230');
  });

  // ─── Negative values ───────────────────────────────────────────────────────

  it('handles negative values (should not occur in normal AR but must not crash)', () => {
    expect(round4Kd(new Prisma.Decimal('-5.5'))).toBe('-5.5000');
    expect(round4Kd(new Prisma.Decimal('-0.0001'))).toBe('-0.0001');
  });

  // ─── Large numbers ─────────────────────────────────────────────────────────

  it('rounds a large value correctly when 5th decimal forces carry', () => {
    // 99999.9999|9 → digit after 4th place = 9 (> 5) → round up
    // 99999.9999 + 0.0001 = 100000.0000
    expect(round4Kd(new Prisma.Decimal('99999.99999'))).toBe('100000.0000');
  });

  it('handles values with many decimal places beyond 4', () => {
    expect(round4Kd(new Prisma.Decimal('1.23456789'))).toBe('1.2346');
  });

  // ─── Banker's rounding (ROUND_HALF_EVEN) ──────────────────────────────────

  it('10.12345 → 10.1234 (4 is even → round DOWN at tie)', () => {
    // Standard rounding (ROUND_HALF_UP) would give 10.1235.
    // Banker's rounding keeps 4 because it's already even.
    expect(round4Kd(new Prisma.Decimal('10.12345'))).toBe('10.1234');
  });

  it('10.12355 → 10.1236 (5 is odd → round UP at tie to reach 6)', () => {
    // 5 is odd → round up to 6 (even).
    expect(round4Kd(new Prisma.Decimal('10.12355'))).toBe('10.1236');
  });

  it('banker rounding does not apply when digit is clearly above 5', () => {
    // 5th decimal > 5 → always round up regardless of 4th decimal parity.
    expect(round4Kd(new Prisma.Decimal('10.12346'))).toBe('10.1235');
    expect(round4Kd(new Prisma.Decimal('10.12356'))).toBe('10.1236');
  });

  it('banker rounding does not apply when digit is clearly below 5', () => {
    // 5th decimal < 5 → always round down regardless of 4th decimal parity.
    expect(round4Kd(new Prisma.Decimal('10.12344'))).toBe('10.1234');
    expect(round4Kd(new Prisma.Decimal('10.12354'))).toBe('10.1235');
  });

  it('distinguishes ROUND_HALF_EVEN from ROUND_HALF_UP on multiple ties', () => {
    // Additional pairs: (last-kept digit even → down) vs (last-kept digit odd → up)
    expect(round4Kd(new Prisma.Decimal('0.00025'))).toBe('0.0002'); // 2 even → down
    expect(round4Kd(new Prisma.Decimal('0.00035'))).toBe('0.0004'); // 3 odd  → up
    expect(round4Kd(new Prisma.Decimal('0.00045'))).toBe('0.0004'); // 4 even → down
    expect(round4Kd(new Prisma.Decimal('0.00055'))).toBe('0.0006'); // 5 odd  → up
  });

  // ─── Typical ERP amounts ───────────────────────────────────────────────────

  it('typical KWD subscription amount rounds correctly', () => {
    expect(round4Kd(new Prisma.Decimal('12.5000'))).toBe('12.5000');
    expect(round4Kd(new Prisma.Decimal('12.50005'))).toBe('12.5000'); // tie, 0 is even → round down
    expect(round4Kd(new Prisma.Decimal('12.50015'))).toBe('12.5002'); // tie, 1 is odd  → round up
    expect(round4Kd(new Prisma.Decimal('0.250'))).toBe('0.2500');
  });
});
