import type { CartLine } from './order-cart';

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.serviceId === 'string' &&
    row.serviceId.length > 0 &&
    typeof row.label === 'string' &&
    typeof row.quantity === 'number' &&
    row.quantity > 0 &&
    row.quantity <= 99 &&
    typeof row.priceNormalKd === 'string' &&
    typeof row.priceExpressKd === 'string'
  );
}

export function parsePersistedCartLines(raw: string | null): CartLine[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function serializeCartLines(lines: CartLine[]): string {
  return JSON.stringify(lines);
}
