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

/**
 * V1.6.6 — Trim trailing zeros on a decimal-string quantity so the
 * WhatsApp line reads "2 x …" instead of "2.0000 x …", but still
 * preserves fractional values like "1.5 x …" when the driver entered
 * a half-kilo, half-piece, etc.
 */
function formatQty(q: string): string {
  const n = Number.parseFloat(q || '0');
  if (!Number.isFinite(n)) return q;
  if (Number.isInteger(n)) return String(n);
  // Up to 4dp (OrderLineItem.quantity is Decimal(12,4)), no trailing zeros.
  return n
    .toFixed(4)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/**
 * V1.6.6 — Static Arabic T&C block attached to every payment-link
 * reminder. Kept inline (not via i18n) because the WhatsApp message is
 * always customer-facing Arabic regardless of the agent's UI locale,
 * and we want the text byte-identical across every reminder so the
 * receipt and this template stay legally aligned.
 */
const SAFARI_WHATSAPP_TERMS_AR = [
  '⚠️ الشروط والأحكام:',
  '1. تسليم المستعجل: 4 ساعات (عادي) / 24 ساعة (أعياد).',
  '2. ملاحظات الخدمة مقبولة فقط خلال 24 ساعة من التسليم.',
  '3. استلام الملابس يبدأ بعد 5:00 مساءً.',
  '4. الماركات العالمية لها معاملة وأسعار خاصة.',
  '5. المحل غير مسئول عن المفقودات الشخصية أو التخزين بعد 30 يوم.',
  '6. التعويض عن التلف 25% من القيمة بشرط الفاتورة الأصلية.',
].join('\n');

/**
 * V1.6.6 — FINAL WhatsApp template for the Collections island. Renders
 * a full Arabic invoice summary + T&Cs + secure payment link, matching
 * the "فواتير مغاسل سفاري السريعة" brief. The `paymentUrl` argument is
 * explicit (instead of reading `row.paymentUrl`) so the caller can mint
 * a fresh link on demand before sending, guaranteeing the message
 * always carries a live URL.
 */
export function buildCollectionsUnpaidWhatsAppText(
  row: CollectionUnpaidOnlineRow,
  paymentUrl?: string | null,
): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const url = paymentUrl ?? row.paymentUrl ?? '';

  const header = [
    'فواتير مغاسل سفاري السريعة',
    `رقم الفاتورة: ${invoiceRef}`,
    `العميل: ${row.customerName}`,
  ].join('\n');

  const itemsHeader = '--- الأصناف ---';
  const itemLines =
    row.lineItems.length > 0
      ? row.lineItems.map((li) => {
          const name = li.label?.trim() || 'خدمة';
          const qty = formatQty(li.quantity);
          return `${qty} x ${name} : ${li.lineTotalKd} د.ك`;
        })
      : ['—'];
  const itemsBlock = [itemsHeader, ...itemLines, '---'].join('\n');

  const totalLine = `الإجمالي: ${row.amountKd} د.ك`;

  const actionBlock = url
    ? ['للدفع السريع عبر الرابط الآمن:', url].join('\n')
    : 'للدفع يرجى التواصل معنا.';

  return [
    header,
    '',
    itemsBlock,
    totalLine,
    '',
    SAFARI_WHATSAPP_TERMS_AR,
    '',
    actionBlock,
    '',
    'شكراً لاختياركم سفاري!',
  ].join('\n');
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
