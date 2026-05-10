import type { CollectionUnpaidOnlineRow, CustomerDirectoryRow } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { isPositiveKd } from '@/lib/kwd';

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

// ──────────────────────────────────────────────────────────────────────────
// V7.1 — Gender-neutral, friendly Arabic templates.
//
// Every outbound message now uses professional plural-address Arabic
// (بخدمتكم / ملابسكم / ثقتكم) so the wording is warm and inclusive for
// male and female customers alike, and signs off as the Safari Omni team.
// ──────────────────────────────────────────────────────────────────────────

/** Two warm welcomes; picked deterministically per-customer (see below). */
const GREETINGS_AR = ['حياك الله', 'نسعد بلقائك'] as const;

/**
 * Deterministic greeting picker. Using a stable hash of a per-customer seed
 * (order id, customer id, or phone) guarantees the same customer always
 * receives the *same* opening phrase across reminders — avoiding the
 * "robotic churn" feeling — while different customers in a bulk blast
 * naturally rotate between the two options.
 */
function pickGreeting(seed: string): (typeof GREETINGS_AR)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return GREETINGS_AR[Math.abs(h) % GREETINGS_AR.length];
}

/** First line: "حياك الله {name}" / "نسعد بلقائك {name}" + Kuwait flourish. */
function buildGreetingLine(name: string, seed: string): string {
  return `${pickGreeting(seed)} ${name} 🌿`;
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

/** V7.1 — reassurance/trust line kept warm and gender-neutral. */
const SAFARI_REASSURANCE_AR =
  'ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.';

/** V7.1 — signature; pulls the system name from the central brand module. */
const SAFARI_TEAM_FOOTER_AR = `فريق ${BRAND.systemAr} 🇰🇼`;

/**
 * V7.1 — WhatsApp template for the Collections island. Renders a warm
 * greeting, gender-neutral invoice summary, legal T&Cs, and a secure
 * payment link, signed off by the Safari Omni team.
 *
 * The `paymentUrl` argument is explicit (instead of reading
 * `row.paymentUrl`) so the caller can mint a fresh link on demand before
 * sending, guaranteeing the message always carries a live URL.
 *
 * V19.23 — **Order matters for `wa.me?text=`.** Browsers and WhatsApp cap
 * the full URL length (~2k chars is a safe margin). The previous layout put
 * the UPayments link *after* a long T&C block, so the link was **truncated**
 * from the pre-filled text and customers never reached checkout. The hosted
 * payment URL is now placed **immediately after the total** (before
 * reassurance + terms), and line items are capped to keep the payload small.
 */
const WA_COLLECTIONS_MAX_ITEM_LINES = 15;

const SAFARI_WHATSAPP_TERMS_AR_COMPACT = [
  '⚠️ الشروط: تفاصيل الخدمة والتعويض كما في فاتورتكم المطبوعة أو كشف الحساب.',
  'للدعم: 22200299',
].join('\n');

function buildCollectionsUnpaidWhatsAppTextInner(
  row: CollectionUnpaidOnlineRow,
  url: string,
  termsMode: 'full' | 'compact',
): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const customerName = row.customerName?.trim() || 'عميلنا العزيز';

  const greet = buildGreetingLine(customerName, row.orderId);

  const intro = `نسعد بخدمتكم في ${BRAND.customerAr}، ونود تذكيركم بفاتورتكم التالية:`;

  const originLines: string[] = [];
  if (row.branchName && row.branchName.trim()) {
    originLines.push(`🏬 الفرع: ${row.branchName.trim()}`);
  }
  if (row.driverName && row.driverName.trim()) {
    originLines.push(`🚗 السائق: ${row.driverName.trim()}`);
  }
  const metaBlock = [
    `🏷️ رقم الفاتورة: ${invoiceRef}`,
    ...originLines,
  ].join('\n');

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
  const itemsBlock = [itemsHeader, ...itemLines, ...moreLines, '---'].join(
    '\n',
  );

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
    SAFARI_TEAM_FOOTER_AR,
  ].join('\n');
}

function buildCollectionsUnpaidWhatsAppTextMinimal(
  row: CollectionUnpaidOnlineRow,
  url: string,
): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const name = row.customerName?.trim() || 'عميلنا العزيز';
  const greet = buildGreetingLine(name, row.orderId);
  const pay = url
    ? ['🔒 رابط الدفع (UPayments):', url].join('\n')
    : '📞 للدفع يرجى التواصل معنا.';
  return [greet, '', `🏷️ ${invoiceRef}`, `💰 *${row.amountKd} د.ك*`, '', pay, '', SAFARI_TEAM_FOOTER_AR].join(
    '\n',
  );
}

export function buildCollectionsUnpaidWhatsAppText(
  row: CollectionUnpaidOnlineRow,
  paymentUrl?: string | null,
): string {
  const url = paymentUrl ?? row.paymentUrl ?? '';
  const full = buildCollectionsUnpaidWhatsAppTextInner(row, url, 'full');
  // If the prefilled `text` is huge (many lines / long labels), the `wa.me`
  // URL can still exceed client limits — fall back to shorter copy so the
  // payment URL survives end-to-end.
  const fullEnc = encodeURIComponent(full);
  if (fullEnc.length <= 6_000) {
    return full;
  }
  const compact = buildCollectionsUnpaidWhatsAppTextInner(row, url, 'compact');
  if (encodeURIComponent(compact).length <= 6_000) {
    return compact;
  }
  return buildCollectionsUnpaidWhatsAppTextMinimal(row, url);
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

/**
 * V7.1 — Directory / subscription balance reminder (call center + owner).
 * Now fully Arabic, gender-neutral, with a bolded balance line so the key
 * number is unmistakable in the customer's WhatsApp preview. Switches
 * label + CTA between "outstanding debt" vs. "wallet balance" modes.
 */
/**
 * V19.8.5 — Customer statement (كشف حساب) share template.
 *
 * Drives the "Send via WhatsApp" button in the Customer 360 panel.
 * We never ship the full ledger over WhatsApp (privacy + size limits
 * of wa.me URLs); instead the message is a concise, friendly summary
 * the customer can read in-line plus a short line telling them the
 * Call Center can send a branded PDF if they need full detail.
 */
export type CustomerStatementWhatsAppArgs = {
  customerName: string | null;
  customerPhone: string;
  customerId: string;
  walletBalanceKd: string;
  walletDebtKd: string;
  /** Canonical current receivable debt shown to the customer. */
  remainingDebtKd?: string;
  invoiceCount: number;
  openInvoiceCount: number;
  activeSubscription: {
    planName: string;
    expiresAtIso: string;
    walletBalanceKd: string;
  } | null;
  from?: string | null;
  to?: string | null;
  /**
   * V19.8.9 — Optional signed public URL where the customer can open
   * the full A4 statement on any device (no login required) and save
   * it as PDF from their browser. When provided the message becomes
   * "hit this link to view your full statement"; when omitted we
   * fall back to the legacy concise summary so the function keeps
   * working for any caller that has not been migrated yet.
   */
  shareUrl?: string | null;
};

export function buildCustomerStatementWhatsAppText(
  a: CustomerStatementWhatsAppArgs,
): string {
  const name = a.customerName?.trim() || a.customerPhone;
  const greet = buildGreetingLine(name, a.customerId);

  const rangeLine =
    a.from && a.to
      ? `📅 الفترة: من ${a.from} إلى ${a.to}`
      : a.from
        ? `📅 الفترة: من ${a.from}`
        : a.to
          ? `📅 الفترة: حتى ${a.to}`
          : '📅 الفترة: كامل السجل';

  const eff = a.remainingDebtKd?.trim();
  const debtLineKd =
    eff !== undefined && eff !== '' ? eff : a.walletDebtKd;

  const balanceLines = [
    `💰 الرصيد الحالي: *${a.walletBalanceKd} د.ك*`,
    `📉 المديونية الحالية: *${debtLineKd} د.ك*`,
    `📄 عدد الفواتير: ${a.invoiceCount} (غير مسدّدة: ${a.openInvoiceCount})`,
  ];

  const subLines = a.activeSubscription
    ? [
        '',
        '🎫 *الاشتراك الحالي:*',
        `• الباقة: ${a.activeSubscription.planName}`,
        `• تاريخ الانتهاء: ${a.activeSubscription.expiresAtIso.slice(0, 10)}`,
        `• الرصيد المتبقي في الاشتراك: ${a.activeSubscription.walletBalanceKd} د.ك`,
      ]
    : [];

  // V19.8.10 — The Call Center flow now attaches the statement as a
  // real PDF file (dragged into WhatsApp Web by the agent after the
  // browser downloads it). We must NEVER include a link back to our
  // own site in the outbound message — the customer should see only
  // the PDF attachment plus this short Arabic cover note. `shareUrl`
  // stays on the type for backwards compatibility but is ignored
  // here on purpose.
  void a.shareUrl;

  return [
    greet,
    '',
    `نسعد بخدمتكم في ${BRAND.customerAr} — مرفق لكم كشف حسابكم بصيغة PDF:`,
    '',
    rangeLine,
    '',
    '📊 *الملخص المالي:*',
    ...balanceLines,
    ...subLines,
    '',
    'لأي استفسار يُرجى التواصل على:',
    '📞 مركز خدمة العملاء: 22200299',
    '',
    SAFARI_TEAM_FOOTER_AR,
  ].join('\n');
}

export function customerStatementWhatsAppHref(
  a: CustomerStatementWhatsAppArgs,
): string | null {
  const n = whatsappChatNumber(a.customerPhone);
  if (!n) return null;
  const text = buildCustomerStatementWhatsAppText(a);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function customerDirectoryBalanceWhatsAppHref(row: CustomerDirectoryRow): string | null {
  const n = whatsappChatNumber(row.customer.phone);
  if (!n) return null;

  const name = row.customer.displayName?.trim() || row.customer.phone;
  // allow-legacy-debt-reader (V20.6 Phase 2: server-canonical aggregate; row.debt.totalDebt is bound by /api/customers DebtVisibility surface)
  const isDebt = isPositiveKd(row.debt.totalDebt);
  const amount = isDebt ? row.debt.totalDebt : row.subscription.walletBalance;
  const link = customerPayPortalUrl();

  const greet = buildGreetingLine(name, row.customer.id ?? row.customer.phone);

  const balanceLabel = isDebt ? 'الرصيد المستحق' : 'رصيد الاشتراك';
  const balanceLine = `💳 *${balanceLabel}: ${amount} د.ك*`;

  const ctaLine = isDebt
    ? `🔒 للدفع السريع عبر الرابط الآمن:\n${link}`
    : '✨ نتطلع لاستقبال ملابسكم قريباً وخدمتكم بأفضل صورة.';

  const text = [
    greet,
    '',
    `نسعد بخدمتكم في ${BRAND.customerAr}.`,
    '',
    balanceLine,
    '',
    ctaLine,
    '',
    SAFARI_TEAM_FOOTER_AR,
  ].join('\n');

  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/**
 * V19.24 — Pre-filled WhatsApp message with a **public invoice** link
 * (customer saves as PDF from the browser). `wa.me` cannot attach PDF files.
 */
export function buildInvoiceShareWhatsAppHref(
  phone: string,
  shareUrl: string,
  args: { customerName?: string | null; orderLabel: string },
): string | null {
  const n = whatsappChatNumber(phone);
  if (!n) return null;
  const name = args.customerName?.trim() || 'عميلنا العزيز';
  const text = [
    `حياك الله ${name} 🌿`,
    '',
    `فاتورتكم (${args.orderLabel}) — ${BRAND.customerAr}:`,
    'افتحوا الرابط ثم من القائمة اختروا «حفظ كملف PDF» (أو طباعة → PDF):',
    shareUrl,
    '',
    `فريق ${BRAND.systemAr} 🇰🇼`,
  ].join('\n');
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
