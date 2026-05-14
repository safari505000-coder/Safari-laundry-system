import { Prisma } from '@prisma/client';

export function assertDecimalEqual(
  actual: Prisma.Decimal | string,
  expected: string,
): void {
  const actualDecimal =
    typeof actual === 'string' ? new Prisma.Decimal(actual) : actual;
  const actualFixed = actualDecimal.toFixed(4);

  if (actualFixed !== expected) {
    throw new Error(`Decimal mismatch: expected=${expected} actual=${actualFixed}`);
  }
}

export function assertNoFloat(value: unknown): void {
  if (typeof value === 'number') {
    throw new Error(
      `Expected Prisma.Decimal or string money value, received JS number=${value}`,
    );
  }
}

export function toKwd(amount: string): Prisma.Decimal {
  return new Prisma.Decimal(amount);
}
