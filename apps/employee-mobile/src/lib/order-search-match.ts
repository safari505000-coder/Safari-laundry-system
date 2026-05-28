import type { OrderDetailRow } from '@/api/orders-types';

function matchesOrderReference(row: OrderDetailRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  const serial = row.serialNumber?.trim().toLowerCase();
  const invoice = row.invoiceNumber?.trim().toLowerCase();
  const shortId = `#${row.id.slice(-6).toLowerCase()}`;
  return (
    serial === q ||
    invoice === q ||
    shortId === q ||
    row.id.toLowerCase() === q
  );
}

export function pickOrderIdFromSearchResults(
  rows: OrderDetailRow[],
  query: string,
): string {
  if (rows.length === 0) {
    throw new Error('لم يُعثر على فاتورة بهذا الرقم');
  }

  const exactMatches = rows.filter((row) => matchesOrderReference(row, query));
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  if (exactMatches.length > 1) {
    throw new Error('عدة فواتير مطابقة — أدخل رقم التسلسل كاملاً');
  }
  if (rows.length === 1) {
    return rows[0].id;
  }
  throw new Error(`عدة فواتير (${rows.length}) — أدخل رقم التسلسل كاملاً`);
}
