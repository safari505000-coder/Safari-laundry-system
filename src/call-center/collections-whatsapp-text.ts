/**
 * V20.x — Server-side copy for Collections "payment link" WhatsApp. Mirrors
 * `web/src/modules/shared/lib/whatsapp-links.ts` (byte-similar for customer
 * trust) so Moatmt/webhook can send the same text without `wa.me` manual send.
 */
import { BRAND_CUSTOMER_AR, BRAND_SYSTEM_AR } from '../common/constants/branding';

const WA_COLLECTIONS_MAX_ITEM_LINES = 15;

const GREETINGS_AR = ['حياك الله', 'نسعد بلقائك'] as const;

function pickGreeting(seed: string): (typeof GREETINGS_AR)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return GREETINGS_AR[Math.abs(h) % GREETINGS_AR.length];
}

function buildGreetingLine(name: string, seed: string): string {
  return `${pickGreeting(seed)} ${name} 🌿`;
}

const SAFARI_WHATSAPP_TERMS_AR = [
  '⚠️ الشروط والأحكام:',
  '1. تسليم المستعجل: 4 ساعات (عادي) / 24 ساعة (أعياد).',
  '2. ملاحظات الخدمة مقبولة فقط خلال 24 ساعة من التسليم.',
  '3. استلام الملابس يبدأ بعد 5:00 مساءً.',
  '4. الماركات العالمية لها معاملة وأسعار خاصة.',
  '5. المحل غير مسئول عن المفقودات الشخصية أو التخزين بعد 30 يوم.',
  '6. التعويض عن التلف 25% من القيمة بشرط الفاتورة الأصلية.',
].join('\n');

const SAFARI_REASSURANCE_AR =
  'ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.';

const SAFARI_WHATSAPP_TERMS_AR_COMPACT = [
  '⚠️ الشروط: تفاصيل الخدمة والتعويض كما في فاتورتكم المطبوعة أو كشف الحساب.',
  'للدعم: 22200299',
].join('\n');

function formatQty(q: string): string {
  const n = Number.parseFloat(q || '0');
  if (!Number.isFinite(n)) return q;
  if (Number.isInteger(n)) return String(n);
  return n
    .toFixed(4)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/** Same fields the browser template reads from `CollectionUnpaidOnlineRow`. */
export type CollectionsUnpaidTextRow = {
  orderId: string;
  readableId: string;
  invoiceNumber: string | null;
  customerName: string;
  amountKd: string;
  lineItems: {
    label: string | null;
    quantity: string;
    lineTotalKd: string;
  }[];
  branchName: string | null;
  driverName: string | null;
};

function buildInner(
  row: CollectionsUnpaidTextRow,
  url: string,
  termsMode: 'full' | 'compact',
): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const customerName = row.customerName?.trim() || 'عميلنا العزيز';

  const greet = buildGreetingLine(customerName, row.orderId);
  const intro = `نسعد بخدمتكم في ${BRAND_CUSTOMER_AR}، ونود تذكيركم بفاتورتكم التالية:`;

  const originLines: string[] = [];
  if (row.branchName && row.branchName.trim()) {
    originLines.push(`🏬 الفرع: ${row.branchName.trim()}`);
  }
  if (row.driverName && row.driverName.trim()) {
    originLines.push(`🚗 السائق: ${row.driverName.trim()}`);
  }
  const metaBlock = [`🏷️ رقم الفاتورة: ${invoiceRef}`, ...originLines].join('\n');

  const itemsHeader = '--- الأصناف ---';
  const rawItems = row.lineItems.length > 0 ? row.lineItems : null;
  const linesToShow =
    rawItems && rawItems.length > WA_COLLECTIONS_MAX_ITEM_LINES ?
      rawItems.slice(0, WA_COLLECTIONS_MAX_ITEM_LINES)
    : rawItems;
  const itemLines =
    linesToShow && linesToShow.length > 0 ?
      linesToShow.map((li) => {
        const name = li.label?.trim() || 'خدمة';
        const qty = formatQty(li.quantity);
        return `${qty} × ${name} : ${li.lineTotalKd} د.ك`;
      })
    : ['—'];
  const moreLines =
    rawItems && rawItems.length > WA_COLLECTIONS_MAX_ITEM_LINES ?
      [
        `… و${rawItems.length - WA_COLLECTIONS_MAX_ITEM_LINES} بند إضافي (راجع تفصيل الفاتورة في التطبيق).`,
      ]
    : [];
  const itemsBlock = [itemsHeader, ...itemLines, ...moreLines, '---'].join('\n');
  const totalLine = `💰 *الإجمالي: ${row.amountKd} د.ك*`;
  const actionBlock = url
    ? ['🔒 رابط الدفع (UPayments):', url].join('\n')
    : '📞 للدفع يرجى التواصل معنا.';

  const termsBlock =
    termsMode === 'full' ? SAFARI_WHATSAPP_TERMS_AR : SAFARI_WHATSAPP_TERMS_AR_COMPACT;

  return [
    greet,
    '',
    intro,
    '',
    metaBlock,
    '',
    itemsBlock,
    totalLine,
    '',
    actionBlock,
    '',
    SAFARI_REASSURANCE_AR,
    '',
    termsBlock,
    '',
    `فريق ${BRAND_SYSTEM_AR} 🇰🇼`,
  ].join('\n');
}

function buildMinimal(row: CollectionsUnpaidTextRow, url: string): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const name = row.customerName?.trim() || 'عميلنا العزيز';
  const greet = buildGreetingLine(name, row.orderId);
  const pay = url
    ? ['🔒 رابط الدفع (UPayments):', url].join('\n')
    : '📞 للدفع يرجى التواصل معنا.';
  return [
    greet,
    '',
    `🏷️ ${invoiceRef}`,
    `💰 *${row.amountKd} د.ك*`,
    '',
    pay,
    '',
    `فريق ${BRAND_SYSTEM_AR} 🇰🇼`,
  ].join('\n');
}

/**
 * Picks full → compact → minimal so Moatmt body stays within provider limits.
 */
export function buildCollectionsPaymentLinkTextAr(
  row: CollectionsUnpaidTextRow,
  paymentUrl: string,
): string {
  const full = buildInner(row, paymentUrl, 'full');
  if (full.length <= 4_000) {
    return full;
  }
  const compact = buildInner(row, paymentUrl, 'compact');
  if (compact.length <= 4_000) {
    return compact;
  }
  return buildMinimal(row, paymentUrl);
}

export type FullBalanceDebtLine = {
  readableId: string;
  amountKd: string;
  reasonAr: string;
};

export function buildFullBalancePaymentLinkTextAr(
  customerName: string,
  totalDebtKd: string,
  lines: FullBalanceDebtLine[],
  paymentUrl: string,
  seed: string,
): string {
  const name = customerName?.trim() || 'عميلنا العزيز';
  const greet = buildGreetingLine(name, seed);
  const detailBlock =
    lines.length > 0
      ? [
          'تفاصيل الرصيد المستحق:',
          ...lines.map(
            (line) => `${line.reasonAr}\n  💰 ${line.amountKd} د.ك`,
          ),
        ].join('\n')
      : '';

  const body = [
    greet,
    '',
    `نسعد بخدمتكم في ${BRAND_CUSTOMER_AR}.`,
    '',
    `💰 *إجمالي الرصيد المستحق: ${totalDebtKd} د.ك*`,
    '',
    detailBlock,
    '',
    '🔒 رابط الدفع الآمن (UPayments):',
    paymentUrl,
    '',
    'الرابط يُحدَّث تلقائياً إذا تغيّر الرصيد قبل الدفع.',
    '',
    SAFARI_WHATSAPP_TERMS_AR_COMPACT,
    '',
    `فريق ${BRAND_SYSTEM_AR} 🇰🇼`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  if (body.length <= 4_000) {
    return body;
  }
  return [
    greet,
    '',
    `💰 *إجمالي الرصيد: ${totalDebtKd} د.ك*`,
    lines.map((l) => `${l.readableId}: ${l.amountKd} د.ك`).join('\n'),
    '',
    paymentUrl,
    '',
    `فريق ${BRAND_SYSTEM_AR} 🇰🇼`,
  ].join('\n');
}
