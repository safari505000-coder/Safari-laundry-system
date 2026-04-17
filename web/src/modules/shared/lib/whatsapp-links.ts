import type { CollectionUnpaidOnlineRow, CustomerDirectoryRow } from '@/lib/api';

/** Normalize Kuwait-style numbers for wa.me links. */
export function whatsappChatNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 8) return `965${d}`;
  if (d.startsWith('965') && d.length >= 11) return d.slice(0, 12);
  if (d.startsWith('0') && d.length === 9) return `965${d.slice(1)}`;
  if (d.length >= 8) return d;
  return null;
}

export function buildCollectionsUnpaidWhatsAppText(row: CollectionUnpaidOnlineRow): string {
  return `Hello ${row.customerName}, your current laundry balance is ${row.amountKd} KWD. You can pay here: ${row.paymentUrl}`;
}

export function collectionsUnpaidWhatsAppHref(row: CollectionUnpaidOnlineRow): string | null {
  const n = whatsappChatNumber(row.customerPhone);
  if (!n) return null;
  const text = buildCollectionsUnpaidWhatsAppText(row);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

function customerPayPortalUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_WEB_APP_URL as string | undefined;
  const base = env ? env.replace(/\/$/, '') : window.location.origin;
  return `${base}/collections`;
}

/** Pre-filled balance / payment link for directory rows (call center & owner). */
export function customerDirectoryBalanceWhatsAppHref(row: CustomerDirectoryRow): string | null {
  const n = whatsappChatNumber(row.customer.phone);
  if (!n) return null;
  const name = row.customer.displayName?.trim() || row.customer.phone;
  const debt = Number.parseFloat(row.debt.totalDebt ?? '0');
  const amount =
    Number.isFinite(debt) && debt > 0 ? row.debt.totalDebt : row.subscription.walletBalance;
  const link = customerPayPortalUrl();
  const text = `Hello ${name}, your current laundry balance is ${amount} KWD. You can pay here: ${link}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
