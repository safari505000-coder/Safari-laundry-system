import type { CollectionUnpaidOnlineRow, CustomerDirectoryRow } from '@/lib/api';
import { BRAND } from '@/lib/brand';

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
 */
export function buildCollectionsUnpaidWhatsAppText(
  row: CollectionUnpaidOnlineRow,
  paymentUrl?: string | null,
): string {
  const invoiceRef =
    row.invoiceNumber?.trim() || row.readableId || row.orderId.slice(-6).toUpperCase();
  const url = paymentUrl ?? row.paymentUrl ?? '';
  const customerName = row.customerName?.trim() || 'عميلنا العزيز';

  const greet = buildGreetingLine(customerName, row.orderId);

  const intro = `نسعد بخدمتكم في ${BRAND.customerAr}، ونود تذكيركم بفاتورتكم التالية:`;

  // V19.4 — CC pack #5. Surface the branch and driver identity so
  // the customer instantly recognises the origin of the invoice and
  // can ask for the same driver on follow-up. Silently omitted when
  // either field is missing to keep the message clean for legacy
  // rows that never had branch/driver attribution.
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
  const itemLines =
    row.lineItems.length > 0
      ? row.lineItems.map((li) => {
          const name = li.label?.trim() || 'خدمة';
          const qty = formatQty(li.quantity);
          return `${qty} × ${name} : ${li.lineTotalKd} د.ك`;
        })
      : ['—'];
  const itemsBlock = [itemsHeader, ...itemLines, '---'].join('\n');

  // WhatsApp bold uses *...* — keeping the total visually anchored.
  const totalLine = `💰 *الإجمالي: ${row.amountKd} د.ك*`;

  const actionBlock = url
    ? ['🔒 للدفع السريع عبر الرابط الآمن:', url].join('\n')
    : '📞 للدفع يرجى التواصل معنا.';

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
    SAFARI_REASSURANCE_AR,
    '',
    SAFARI_WHATSAPP_TERMS_AR,
    '',
    actionBlock,
    '',
    SAFARI_TEAM_FOOTER_AR,
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

  const balanceLines = [
    `💰 الرصيد الحالي: *${a.walletBalanceKd} د.ك*`,
    `📉 المديونية الحالية: *${a.walletDebtKd} د.ك*`,
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

  // V19.8.9 — When a share URL is available we pivot the closing call
  // to action from "ask us for a PDF" to "open this link on your
  // phone". The URL renders the exact same A4 statement the agent
  // saw, with the digital seal, and supports the browser's native
  // "Save as PDF" — which gives the customer the actual PDF file
  // they wanted without WhatsApp Business API overhead.
  const ctaBlock = a.shareUrl
    ? [
        '🔎 *لعرض كشف الحساب الكامل (بإمكانك حفظه PDF من متصفحك):*',
        a.shareUrl,
        '',
        '⏳ الرابط صالح لمدة 7 أيام من وقت الإرسال.',
      ]
    : [
        'لاستلام نسخة مفصّلة (PDF مختوم رقمياً) يُرجى إبلاغنا وسنرسلها فوراً.',
      ];

  return [
    greet,
    '',
    `نسعد بخدمتكم في ${BRAND.customerAr} — فيما يلي ملخّص كشف حسابكم:`,
    '',
    rangeLine,
    '',
    '📊 *الملخص المالي:*',
    ...balanceLines,
    ...subLines,
    '',
    ...ctaBlock,
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
  const debt = Number.parseFloat(row.debt.totalDebt ?? '0');
  const isDebt = Number.isFinite(debt) && debt > 0;
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
