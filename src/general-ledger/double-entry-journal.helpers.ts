import { Prisma } from '@prisma/client';

/**
 * Phase 0 extraction — pure chart-of-accounts constants, journal `sourceRef`
 * parsers, statement-row types, and describe/humanize formatting helpers split
 * out of `double-entry-journal.service.ts`. No I/O, no `this`; behaviour-neutral.
 * The service re-exports everything here via `export *` so existing import
 * paths (e.g. JOURNAL_ACCOUNTS, describeJournalEntry) keep working unchanged.
 */

/**
 * أرقام الحسابات المحاسبية الرسمية لدفتر اليومية مزدوج القيد.
 * يجب أن تكون هذه الأرقام متطابقة مع تهيئة الحسابات في قاعدة البيانات
 * (جدول `Account.code`) وإلا يرفض `appendBalanced` القيد بخطأ `JOURNAL_ACCOUNT_NOT_FOUND`.
 *
 * Canonical chart-of-accounts codes used by every double-entry write.
 * These must match seeded `Account.code` values in the database;
 * `appendBalanced` throws `JOURNAL_ACCOUNT_NOT_FOUND` if any code is missing.
 *
 * @since V20.2
 */
export const JOURNAL_ACCOUNTS = {
  CASH: '1100',
  BANK_KNET: '1200',
  BANK_ONLINE: '1210',
  ACCOUNTS_RECEIVABLE: '1300',
  /**
   * V20.2 — Phase 27. Dedicated liability account for prepaid
   * customer wallet credit. Used by
   * {@link DoubleEntryJournalService.appendWalletAbsorptionEntry}
   * in place of {@link JOURNAL_ACCOUNTS.ADJUSTMENTS}, which was a
   * v4 placeholder. Seeded by the
   * `20260507180000_v20_2_wallet_liability_account` migration.
   */
  WALLET_LIABILITY: '2100',
  REVENUE: '4100',
  /**
   * V20.4 — Phase 1 contra-revenue account. Receives the credit
   * reversal for canceled invoices and the debit reversal for
   * subscription refunds, so gross REVENUE on 4100 stays an
   * append-only mirror of the issuance flow.
   */
  REVENUE_RETURNS: '4200',
  ADJUSTMENTS: '5100',
  /**
   * V20.4 — Phase 1 goodwill account. Receives the expense leg
   * of a CC-granted debt discount so the AR write-down is
   * properly recognised as a P&L impact rather than a silent
   * `wallet.debt` mutation.
   */
  DEBT_DISCOUNTS: '5200',
  /**
   * V20.4 — Phase 1 promotional expense account. Receives the
   * expense leg of subscription "gift" credit (subsidy beyond
   * the customer-paid portion) so the company's promotional
   * spend is traceable and the wallet liability journal stays
   * correct.
   */
  PROMOTIONAL_EXPENSE: '5300',
} as const;

export const UUID_SEGMENT =
  '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

/**
 * يُحوِّل تنسيقات `sourceRef` التاريخية (بالشرطة `-`) إلى الشكل المعياري (بالنقطتين `:`).
 * استُخدم تنسيق الشرطة في الإصدارات الأولى قبل توحيد المرجع؛ هذه الدالة تضمن
 * أن `describeJournalEntry` وباقي محللات المرجع تعمل بشكل صحيح مع السجلات القديمة.
 *
 * Normalises legacy hyphen-separated `sourceRef` shapes to the canonical
 * colon-delimited form. Older records used `-` as a separator; this ensures
 * `describeJournalEntry` and subscription ID parsers match both old and new forms.
 *
 * @param sourceRef - المرجع الخام من `JournalEntry.sourceRef` | Raw value from `JournalEntry.sourceRef`
 * @returns المرجع بعد التوحيد، أو الأصل إذا لم يتغير | Normalised ref, or the original if unchanged
 * @since V20.1
 */
export function normalizeLegacyJournalSourceRef(sourceRef: string): string {
  const r = sourceRef.trim();
  if (!r) return r;

  let m = r.match(new RegExp(`^INVOICE-${UUID_SEGMENT}-SHORTFALL$`, 'i'));
  if (m) return `INVOICE:${m[1]}:SHORTFALL`;

  m = r.match(new RegExp(`^WALLET_FUNDING_SUBSCRIPTION[-_]${UUID_SEGMENT}$`, 'i'));
  if (m) return `WALLET_FUNDING:SUBSCRIPTION:${m[1]}`;

  m = r.match(
    new RegExp(
      `^PAYMENT-SUBSCRIPTION_ACTIVATION[-_]${UUID_SEGMENT}[-_]RESIDUAL$`,
      'i',
    ),
  );
  if (m) return `PAYMENT:SUBSCRIPTION_ACTIVATION:${m[1]}:RESIDUAL`;

  m = r.match(
    new RegExp(
      `^PAYMENT-SUBSCRIPTION_ACTIVATION[-_]${UUID_SEGMENT}[-_]${UUID_SEGMENT}$`,
      'i',
    ),
  );
  if (m) return `PAYMENT:SUBSCRIPTION_ACTIVATION:${m[1]}:${m[2]}`;

  return r;
}

/**
 * يستخرج معرف الاشتراك (UUID) من `sourceRef` لقيود من نوع
 * `WALLET_FUNDING:SUBSCRIPTION` أو `SUBSCRIPTION_ACTIVATION`.
 * تُستخدم النتيجة لتحليل سياق الاشتراك في كشفي الحساب
 * (`getCustomerStatement`, `getCustomerCallCenterBankStatement`).
 *
 * Best-effort extraction of the subscription UUID from a journal `sourceRef`.
 * Used by statement builders to enrich rows with plan name context.
 * Returns `null` when the ref pattern does not encode a subscription.
 *
 * @param source - قيمة `JournalEntry.source` | `JournalEntry.source` value
 * @param sourceRef - قيمة `JournalEntry.sourceRef` (خام أو موحّد) | Raw or normalised `sourceRef`
 * @returns معرف UUID للاشتراك، أو `null` | Subscription UUID or `null`
 * @since V20.1
 */
export function parseSubscriptionIdFromJournalRef(
  source: string,
  sourceRef: string,
): string | null {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  if (!ref) return null;
  if (ref.includes(':SHORTFALL') && !/SUBSCRIPTION/i.test(ref)) return null;

  if (/WALLET_FUNDING:SUBSCRIPTION:/i.test(ref)) {
    const id = ref.split(':')[2]?.trim();
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  }
  if (/SUBSCRIPTION_ACTIVATION/i.test(ref)) {
    const m = ref.match(
      /SUBSCRIPTION_ACTIVATION:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    return m?.[1] ?? null;
  }
  if (source === 'PROCESS_TRANSACTION' && /SUBSCRIPTION/i.test(ref)) {
    const m = ref.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    return m?.[1] ?? null;
  }
  return null;
}

/**
 * يستخرج معرف الطلب (orderId) من قيود الذمم من نوع
 * `INVOICE:<uuid>:SHORTFALL` أو `INVOICE:<uuid>:SUBSCRIPTION_OVERUSE`
 * بعد تطبيق `normalizeLegacyJournalSourceRef`.
 * تُستخدم النتيجة في `resolveOrderRefLabelByOrderId` لإظهار رقم الطلب
 * بدلًا من UUID في واجهات العميل.
 *
 * Extracts the order UUID from invoice-shortfall or subscription-overuse
 * `sourceRef` values. Used by statement builders to replace raw UUIDs
 * with human-readable order serial numbers in customer-facing views.
 *
 * @param source - قيمة `JournalEntry.source` | `JournalEntry.source` value
 * @param sourceRef - قيمة `JournalEntry.sourceRef` | `JournalEntry.sourceRef` value
 * @returns معرف UUID للطلب، أو `null` إذا لم ينطبق النمط | Order UUID or `null`
 * @since V20.1
 */
export function parseOrderIdFromInvoiceJournalRef(
  source: string,
  sourceRef: string,
): string | null {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  if (source !== 'INVOICE') return null;
  if (!ref.toUpperCase().startsWith('INVOICE:')) return null;
  const parts = ref.split(':');
  if (parts.length < 3) return null;
  const id = parts[1]?.trim();
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const kind = (parts[2] ?? '').toUpperCase();
  if (kind === 'SHORTFALL' || kind === 'SUBSCRIPTION_OVERUSE') return id;
  return null;
}

export function paymentMethodLabelFromMeta(meta: Prisma.JsonValue | null | undefined): string | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const m = meta as Record<string, unknown>;
  const raw = m.payment_method ?? m.paymentMethod ?? m.posPaymentMethod;
  if (typeof raw !== 'string') return null;
  const map: Record<string, string> = {
    CASH: 'نقدي',
    KNET: 'كي‌نت',
    ONLINE: 'أونلاين / بطاقة',
    DEBT: 'على الحساب',
    PAYMENT_LINK: 'رابط دفع',
    DEBT_ON_ACCOUNT: 'على الحساب',
  };
  return map[raw] ?? raw;
}

/**
 * يُحدد وسيلة الدفع باللغة العربية اعتمادًا على أسطر القيد المحاسبي.
 * يعطي الأولوية للحقل `payment_method` في `meta` إن وُجد، ثم يستنتج
 * وسيلة الدفع من رمز الحساب الأصل (نقدي / كي‌نت / أونلاين) أو الدعم الترويجي.
 * تُستخدم النتيجة في كشف الكول سنتر البنكي لعمود "الدفع".
 *
 * Derives an Arabic payment-channel label from journal line data.
 * Prefers an explicit `payment_method` in line `meta`; falls back to
 * asset account codes (cash/knet/online) or promotional expense marking.
 * Result is used in CC bank statement rows and customer-facing descriptions.
 *
 * @param lines - أسطر القيد الكاملة مع حسابها | Full journal lines with their account
 * @returns وسيلة الدفع بالعربية، أو `null` إذا تعذّر الاستنتاج | Arabic payment label or `null`
 * @since V22
 */
export function inferPaymentChannelArFromJournalLines(
  lines: Array<{
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    account: { code: string };
    meta?: Prisma.JsonValue | null;
  }>,
): string | null {
  for (const line of lines) {
    if (line.debit.gt(0)) {
      const fromMeta = paymentMethodLabelFromMeta(line.meta);
      if (fromMeta) return fromMeta;
    }
  }
  const assetLabels: Record<string, string> = {
    [JOURNAL_ACCOUNTS.CASH]: 'نقدي',
    [JOURNAL_ACCOUNTS.BANK_KNET]: 'كي‌نت',
    [JOURNAL_ACCOUNTS.BANK_ONLINE]: 'أونلاين / بطاقة',
  };
  const parts: string[] = [];
  let hasPromo = false;
  for (const line of lines) {
    if (line.debit.gt(0)) {
      if (line.account.code === JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE) {
        hasPromo = true;
        continue;
      }
      const lbl = assetLabels[line.account.code];
      if (lbl && !parts.includes(lbl)) parts.push(lbl);
    }
  }
  if (parts.length === 0 && hasPromo) return 'دعم شركة (ترويجي)';
  if (parts.length === 0) return null;
  if (hasPromo) return `${parts.join(' + ')} · دعم شركة`;
  return parts.join(' + ');
}

/**
 * خطأ قاطع الدائرة للقيود المحاسبية — الإصدار V20.1 المرحلة 16.
 * يُرمى من `mirrorDebtLedgerEntrySafe` عندما تتجاوز إخفاقات اليومية
 * للعميل ذاته الحد `CRITICAL_FAILURE_THRESHOLD` خلال نافذة زمنية قصيرة،
 * مما يُشير إلى انحراف كبير في الأرصدة يستوجب تدخلًا فوريًا.
 *
 * Circuit-breaker error for the double-entry journal — V20.1 Phase 16.
 * Thrown by `mirrorDebtLedgerEntrySafe` when the same customer accumulates
 * more than {@link CRITICAL_FAILURE_THRESHOLD} journal failures within
 * {@link CRITICAL_FAILURE_WINDOW_MS}, signalling systematic divergence
 * that the daily drift cron will not catch in time.
 *
 * @since V20.1
 */
export class CriticalJournalFailureError extends Error {
  constructor(
    public readonly customerId: string,
    public readonly recentFailureCount: number,
    public readonly windowMs: number,
  ) {
    super(
      `CRITICAL_JOURNAL_FAILURE customerId=${customerId} recentFailures=${recentFailureCount} windowMs=${windowMs}`,
    );
    this.name = 'CriticalJournalFailureError';
  }
}

/**
 * الحد الأقصى لإخفاقات اليومية قبل إطلاق قاطع الدائرة للعميل ذاته.
 * عند تجاوزه تُرمى `CriticalJournalFailureError` لإيقاف العملية.
 *
 * Maximum consecutive journal failures for the same customer before
 * {@link CriticalJournalFailureError} is thrown. V20.1 Phase 16 tuning.
 *
 * @since V20.1
 */
export const CRITICAL_FAILURE_THRESHOLD = 3;
export const CRITICAL_FAILURE_WINDOW_MS = 5 * 60 * 1000;



/**
 * صف واحد من كشف الحساب المحاسبي (مدين / دائن / رصيد تراكمي).
 * يُعاد من `getCustomerStatement` ويُعرض في واجهة العميل وكشفي الحساب.
 * جميع القيم المالية بصيغة نصية `4dp KWD` من الخادم — بدون حسابات في الواجهة.
 *
 * A single row from the customer AR statement (debit / credit / running balance).
 * Returned by `getCustomerStatement`. All monetary values are canonical
 * server-side 4dp KWD strings — no client-side arithmetic.
 *
 * @since V21
 */
export type JournalStatementRow = {
  entryId: string;
  date: string;
  description: string;
  /** للكول سنتر — باقة + وسيلة دفع عند توافر البيانات. */
  contextLabel?: string;
  debit: string;
  credit: string;
  balance: string;
};

/**
 * صف واحد لكل قيد محاسبي كامل — بأسلوب الكشف البنكي لمركز الاتصال.
 * يُميّز بين ما دفعه العميل فعليًا (نقدي/بنك)، والدعم الذي قدمته الشركة،
 * وحركات محفظة الاشتراك، والجانبَين المحاسبيَّين لحساب الذمم مع رصيد تراكمي.
 * يُعاد من `getCustomerCallCenterBankStatement`.
 *
 * One row per complete journal entry — CC bank-statement style.
 * Separates customer cash payments, company promotional support,
 * wallet movements and AR debit/credit sides with a running AR balance.
 * Returned by `getCustomerCallCenterBankStatement`.
 *
 * @since V22
 */
export type CallCenterBankStatementRow = {
  entryId: string;
  date: string;
  description: string;
  contextLabel?: string;
  /** إيداع من العميل (صندوق / بنك). */
  customerPaidKd: string;
  /** دعم شركة (مصروف ترويجي). */
  companySupportKd: string;
  /**
   * خصم ذمم حسنة (هدية) — مدين على حساب 5200 في قيد منفصل؛ ليس خصم محفظة.
   */
  debtGoodwillDiscountKd: string;
  /** إضافة إلى رصيد المحفظة (التزام 2100 دائن). */
  walletCreditKd: string;
  /** خصم من رصيد المحفظة (التزام 2100 مدين). */
  walletDebitKd: string;
  /** مدين ذمم العملاء. */
  arDebitKd: string;
  /** دائن ذمم العملاء. */
  arCreditKd: string;
  /** رصيد ذمم تراكمي بعد الحركة. */
  arBalanceKd: string;
};

export const BANK_STATEMENT_PAY_IN_CODES = new Set<string>([
  JOURNAL_ACCOUNTS.CASH,
  JOURNAL_ACCOUNTS.BANK_KNET,
  JOURNAL_ACCOUNTS.BANK_ONLINE,
]);

/**
 * يُجمِّع أسطر القيد الكاملة إلى الأعمدة السبعة للكشف البنكي لمركز الاتصال.
 * العمليات الحسابية تجري كليًا على الخادم بـ `Prisma.Decimal` — لا تُمرَّر أرقام للواجهة.
 * تُستدعى بواسطة `getCustomerCallCenterBankStatement` لكل قيد.
 *
 * Aggregates full journal entry lines into the seven CC bank-statement columns
 * (customer paid, company support, goodwill discount, wallet credit/debit, AR debit/credit).
 * All arithmetic is server-side using `Prisma.Decimal` — no numbers are sent to the frontend.
 * Called per entry by `getCustomerCallCenterBankStatement`.
 *
 * @param lines - أسطر القيد الكاملة مع رموز الحسابات | Full journal lines with account codes
 * @returns قاموس بالأعمدة السبعة كقيم نصية `4dp KWD` | Map of 7 columns as 4dp KWD strings
 * @since V22
 */
export function aggregateJournalEntryForBankColumns(
  lines: ReadonlyArray<{
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    account: { code: string };
  }>,
): {
  customerPaidKd: string;
  companySupportKd: string;
  debtGoodwillDiscountKd: string;
  walletCreditKd: string;
  walletDebitKd: string;
  arDebitKd: string;
  arCreditKd: string;
} {
  let customerPaid = new Prisma.Decimal(0);
  let companySupport = new Prisma.Decimal(0);
  let debtGoodwillDiscount = new Prisma.Decimal(0);
  let walletCredit = new Prisma.Decimal(0);
  let walletDebit = new Prisma.Decimal(0);
  let arDebit = new Prisma.Decimal(0);
  let arCredit = new Prisma.Decimal(0);

  for (const line of lines) {
    const code = line.account.code;
    if (BANK_STATEMENT_PAY_IN_CODES.has(code)) {
      customerPaid = customerPaid.add(line.debit);
    }
    if (code === JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE) {
      companySupport = companySupport.add(line.debit);
    }
    if (code === JOURNAL_ACCOUNTS.DEBT_DISCOUNTS) {
      debtGoodwillDiscount = debtGoodwillDiscount.add(line.debit);
    }
    if (code === JOURNAL_ACCOUNTS.WALLET_LIABILITY) {
      walletDebit = walletDebit.add(line.debit);
      walletCredit = walletCredit.add(line.credit);
    }
    if (code === JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE) {
      arDebit = arDebit.add(line.debit);
      arCredit = arCredit.add(line.credit);
    }
  }

  return {
    customerPaidKd: customerPaid.toFixed(4),
    companySupportKd: companySupport.toFixed(4),
    debtGoodwillDiscountKd: debtGoodwillDiscount.toFixed(4),
    walletCreditKd: walletCredit.toFixed(4),
    walletDebitKd: walletDebit.toFixed(4),
    arDebitKd: arDebit.toFixed(4),
    arCreditKd: arCredit.toFixed(4),
  };
}

export function entryRefTail(sourceRef: string): string {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  return ref.split(':').slice(-1)[0]?.slice(0, 12) ?? '';
}

/**
 * يُنتج عنوانًا عربيًا مختصرًا لقيد اليومية بناءً على `(source, sourceRef)`.
 * يُعرض مباشرةً في واجهات العميل بدون ترجمة إضافية.
 * الإصدار V21 المرحلة 5 — جميع أنواع المصادر مُغطَّاة بـ `switch/case`.
 *
 * Produces a concise Arabic one-line title for a journal entry from
 * `(source, sourceRef)`. Rendered verbatim in customer UIs — no English
 * `source` enum values appear in the default output path.
 *
 * @param source - قيمة `JournalEntry.source` | `JournalEntry.source` enum value
 * @param sourceRef - قيمة `JournalEntry.sourceRef` | `JournalEntry.sourceRef` value
 * @returns وصف عربي قصير | Short Arabic description
 * @since V21
 */
export function describeJournalEntry(
  source: string,
  sourceRef: string,
): string {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  const tail = entryRefTail(ref);
  switch (source) {
    case 'ORDER_INVOICE':
      return `فاتورة جديدة${tail ? ` — ${tail}` : ''}`;
    case 'INVOICE': {
      if (ref.includes(':SHORTFALL')) {
        const orderFrag = ref.split(':')[1]?.slice(0, 8) ?? '';
        return `ذمم عملاء من فاتورة (المتبقي)${orderFrag ? ` — ${orderFrag}` : ''}`;
      }
      if (ref.includes('SUBSCRIPTION_OVERUSE')) {
        const orderFrag = ref.split(':')[1]?.slice(0, 8) ?? '';
        return `ذمم — تجاوز استهلاك اشتراك${orderFrag ? ` — ${orderFrag}` : ''}`;
      }
      const frag = ref.split(':')[1]?.slice(0, 12) ?? tail;
      return `ذمم من فاتورة${frag ? ` — ${frag}` : ''}`;
    }
    case 'PROCESS_TRANSACTION': {
      if (ref.startsWith('WALLET_FUNDING:SUBSCRIPTION:')) {
        const id = ref.split(':')[2]?.slice(0, 8) ?? '';
        return `تمويل محفظة اشتراك${id ? ` — ${id}` : ''}`;
      }
      const parts = ref.split(':');
      if (parts[0] === 'PROCESS_TRANSACTION' && parts.length >= 4) {
        const txAr: Record<string, string> = {
          PAYMENT: 'دفعة',
          SUBSIDY: 'دعم ترويجي',
          DISCOUNT: 'خصم',
          RENEWAL: 'تجديد',
          REFUND: 'استرجاع',
        };
        const rtAr: Record<string, string> = {
          INVOICE: 'فاتورة',
          SUBSCRIPTION: 'اشتراك',
          CUSTOMER: 'عميل',
        };
        const tx = txAr[parts[1] ?? ''] ?? parts[1];
        const rt = rtAr[parts[2] ?? ''] ?? parts[2];
        const id = parts[3]?.slice(0, 8) ?? '';
        return `معاملة مالية — ${tx} (${rt})${id ? ` — ${id}` : ''}`;
      }
      return `معاملة مالية${tail ? ` — ${tail}` : ''}`;
    }
    case 'PAYMENT':
      if (ref.includes('SUBSCRIPTION_ACTIVATION')) {
        const sid = ref.split(':')[2]?.slice(0, 8) ?? '';
        return `تسديد — تفعيل اشتراك (تسوية المتبقي)${sid ? ` — ${sid}` : ''}`;
      }
      if (ref.includes('CC_PARTIAL_DEBT_PAYMENT')) {
        return `تسديد جزئي — مركز الاتصال`;
      }
      if (ref.startsWith('PAYMENT:WALLET:'))
        return `تسوية من المحفظة${tail ? ` — ${tail}` : ''}`;
      if (ref.includes(':CASH:')) return `تسديد كاش${tail ? ` — ${tail}` : ''}`;
      if (ref.includes(':KNET:')) return `تسديد كي‌نت${tail ? ` — ${tail}` : ''}`;
      if (ref.includes(':ONLINE:'))
        return `تسديد أونلاين${tail ? ` — ${tail}` : ''}`;
      if (ref.includes(':PAYMENT_LINK:'))
        return `تسديد رابط دفع${tail ? ` — ${tail}` : ''}`;
      return `تسديد${tail ? ` — ${tail}` : ''}`;
    case 'PARTIAL_PAYMENT':
      return `تسديد جزئي${tail ? ` — ${tail}` : ''}`;
    case 'WALLET_ABSORPTION':
    case 'WALLET_SETTLEMENT':
      return `خصم من رصيد الاشتراك${tail ? ` — ${tail}` : ''}`;
    case 'WALLET_ABSORPTION_VOID':
      return `إلغاء خصم من المحفظة${tail ? ` — ${tail}` : ''}`;
    case 'SUBSCRIPTION_ACTIVATION':
      return `تفعيل اشتراك${tail ? ` — ${tail}` : ''}`;
    case 'SUBSCRIPTION_CANCELLATION':
      return `إلغاء اشتراك${tail ? ` — ${tail}` : ''}`;
    case 'SUBSCRIPTION_REFUND':
      return `استرجاع اشتراك${tail ? ` — ${tail}` : ''}`;
    case 'DEBT_ADJUSTMENT':
      return `تعديل قيد${tail ? ` — ${tail}` : ''}`;
    case 'DEBT_DISCOUNT':
      if (ref.includes('JOURNAL:DEBT_DISCOUNT:')) {
        return 'خصم ذمم حسنة — مركز الاتصال (هدية)';
      }
      return `خصم دين${tail ? ` — ${tail}` : ''}`;
    case 'REVERSAL':
      return `قيد عكسي${tail ? ` — ${tail}` : ''}`;
    case 'INVOICE_EDIT':
      return `تعديل فاتورة${tail ? ` — ${tail}` : ''}`;
    case 'INVOICE_ISSUED':
      return `إصدار فاتورة (قيد إيراد)${tail ? ` — ${tail}` : ''}`;
    case 'INVOICE_CANCELED':
      return `إلغاء فاتورة (عكس الذمم)${tail ? ` — ${tail}` : ''}`;
    case 'EXTERNAL_PAYMENT':
      return `دفعة خارجية${tail ? ` — ${tail}` : ''}`;
    case 'VOID':
      return `إلغاء فاتورة${tail ? ` — ${tail}` : ''}`;
    case 'ADJUSTMENT':
      return `قيد تسوية${tail ? ` — ${tail}` : ''}`;
    case 'SUPERVISOR_EDIT_REVERSAL':
      return `تعديل إشرافي — عكس${tail ? ` — ${tail}` : ''}`;
    case 'SUPERVISOR_EDIT_NEW':
      return `تعديل إشرافي — قيد جديد${tail ? ` — ${tail}` : ''}`;
    case 'SUPERVISOR_VOID':
      return `إلغاء إشرافي${tail ? ` — ${tail}` : ''}`;
    default:
      return tail ? `قيد في دفتر اليومية — ${tail}` : 'قيد محاسبي غير مصنّف';
  }
}

/**
 * يستخرج اسم الباقة من سطر السياق المُركَّب الذي تُنتجه
 * `resolveContextLabelsByEntryId` بصيغة `الباقة: … · الدفع: …`.
 * تُستخدم النتيجة لإثراء أوصاف الكشف الموجهة للعميل.
 *
 * Extracts the plan name from a context label string built by
 * `resolveContextLabelsByEntryId` in the form `الباقة: X · الدفع: Y`.
 * Used to enrich customer-facing statement descriptions with plan names.
 *
 * @param contextLabel - سطر السياق كاملًا أو `null` | Full context label or `null`
 * @returns اسم الباقة أو `null` إذا لم يوجد | Plan name or `null`
 * @since V22
 */
export function parsePlanNameFromContextLabel(
  contextLabel: string | null | undefined,
): string | null {
  const raw = contextLabel?.trim();
  if (!raw) return null;
  const m = raw.match(/^الباقة:\s*([^·]+?)\s*(?:·|$)/u);
  const name = m?.[1]?.trim();
  return name && name.length > 0 ? name : null;
}

/**
 * يُنتج وصفًا عربيًا موجهًا للعميل بجودة أعلى من `describeJournalEntry`:
 * يُستبدَل ذيل UUID القصير بمرجع الطلب الورقي أو اسم الباقة أو وسيلة الدفع
 * عند توافرها. يُستدعى من `getCustomerStatement` و`getCustomerCallCenterBankStatement`.
 *
 * Produces an enhanced Arabic customer-facing description by replacing
 * short UUID tails with human-readable order references, plan names,
 * or payment channel labels when available. Called by both statement builders.
 *
 * @param source - قيمة `JournalEntry.source` | `JournalEntry.source`
 * @param sourceRef - قيمة `JournalEntry.sourceRef` | `JournalEntry.sourceRef`
 * @param orderRefLabel - مرجع الطلب الورقي إن وُجد (`طلب 1234`) | Human-readable order ref if resolved
 * @param subscriptionPlanLabel - اسم الباقة إن وُجد | Subscription plan name if resolved
 * @param paymentChannelAr - وسيلة الدفع بالعربية من أسطر القيد | Arabic payment channel from lines
 * @returns وصف عربي جاهز للعرض | Display-ready Arabic description
 * @since V22
 */
export function describeJournalEntryForCustomerFacing(
  source: string,
  sourceRef: string,
  orderRefLabel: string | null,
  subscriptionPlanLabel: string | null = null,
  /** وسيلة الدفع بصياغة عربية (من أسطر القيد أو الميتا) — تستبدل UUID في تسديد الكول سنتر. */
  paymentChannelAr: string | null = null,
): string {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  if (source === 'PAYMENT' && ref.includes('CC_PARTIAL_DEBT_PAYMENT')) {
    const ch = paymentChannelAr?.trim();
    return ch
      ? `تسديد جزئي — مركز الاتصال — ${ch}`
      : 'تسديد جزئي — مركز الاتصال';
  }
  if (source === 'DEBT_DISCOUNT' && ref.includes('JOURNAL:DEBT_DISCOUNT:')) {
    return 'خصم ذمم حسنة — مركز الاتصال (هدية)';
  }
  if (source === 'INVOICE' && ref.includes(':SHORTFALL')) {
    return orderRefLabel
      ? `ذمم عملاء من فاتورة (المتبقي) — ${orderRefLabel}`
      : 'ذمم عملاء من فاتورة (المتبقي)';
  }
  if (source === 'INVOICE' && ref.includes('SUBSCRIPTION_OVERUSE')) {
    return orderRefLabel
      ? `ذمم — تجاوز استهلاك اشتراك — ${orderRefLabel}`
      : 'ذمم — تجاوز استهلاك اشتراك';
  }

  if (
    source === 'PROCESS_TRANSACTION' &&
    ref.startsWith('WALLET_FUNDING:SUBSCRIPTION:')
  ) {
    return subscriptionPlanLabel
      ? `تمويل محفظة اشتراك — ${subscriptionPlanLabel}`
      : 'تمويل محفظة اشتراك';
  }
  if (source === 'PAYMENT' && ref.includes('SUBSCRIPTION_ACTIVATION')) {
    return subscriptionPlanLabel
      ? `تسديد — تفعيل اشتراك (تسوية المتبقي) — ${subscriptionPlanLabel}`
      : 'تسديد — تفعيل اشتراك (تسوية المتبقي)';
  }
  if (source === 'SUBSCRIPTION_ACTIVATION') {
    return subscriptionPlanLabel
      ? `تفعيل اشتراك — ${subscriptionPlanLabel}`
      : 'تفعيل اشتراك';
  }

  const base = describeJournalEntry(source, sourceRef);
  let out = base;
  if (orderRefLabel) {
    out = out.replace(/ — [0-9a-f]{8}$/i, ` — ${orderRefLabel}`);
  }
  if (subscriptionPlanLabel && / — [0-9a-f]{8}$/i.test(out)) {
    out = out.replace(/ — [0-9a-f]{8}$/i, ` — ${subscriptionPlanLabel}`);
  }
  return out;
}

/**
 * يُحوِّل `sourceRef` التقني إلى سطر تفصيل عربي مختصر يُعرض تحت العنوان في الواجهة.
 * يُقصِّر UUID إلى 8 أحرف مع علامة `…`، ويُترجم الأنواع الرئيسية إلى مصطلحات عربية.
 * المرجع الكامل `sourceRef` يبقى متاحًا عبر API للمطورين.
 *
 * Converts a technical `sourceRef` to a short Arabic detail line shown
 * below the entry title in customer UIs. UUIDs are shortened to 8 chars + `…`;
 * major source types are translated to Arabic terms. Full `sourceRef`
 * remains accessible via the API for developers.
 *
 * @param source - قيمة `JournalEntry.source` | `JournalEntry.source`
 * @param sourceRef - قيمة `JournalEntry.sourceRef` | `JournalEntry.sourceRef`
 * @returns سطر تفصيل عربي قصير | Short Arabic detail line
 * @since V22
 */
export function humanizeJournalSourceRef(
  source: string,
  sourceRef: string,
): string {
  const ref = normalizeLegacyJournalSourceRef((sourceRef ?? '').trim());
  if (!ref) return 'بدون مرجع تقني';

  if (ref.includes(':SHORTFALL')) {
    const orderId = ref.split(':')[1] ?? '';
    const frag =
      orderId.length > 8 ? `${orderId.slice(0, 8)}…` : orderId;
    return `طلب ${frag || '—'} · متبقّي الفاتورة (ذمم)`;
  }
  if (ref.includes('SUBSCRIPTION_OVERUSE')) {
    const orderId = ref.split(':')[1] ?? '';
    const frag =
      orderId.length > 8 ? `${orderId.slice(0, 8)}…` : orderId;
    return `طلب ${frag || '—'} · تجاوز استهلاك اشتراك`;
  }
  if (ref.startsWith('WALLET_FUNDING:SUBSCRIPTION:')) {
    const id = ref.split(':')[2] ?? '';
    const frag = id.length > 8 ? `${id.slice(0, 8)}…` : id;
    return `اشتراك ${frag || '—'} · إيداع في محفظة العميل`;
  }
  if (ref.startsWith('PROCESS_TRANSACTION:')) {
    const p = ref.split(':');
    if (p.length >= 4) {
      const txAr: Record<string, string> = {
        PAYMENT: 'دفعة',
        SUBSIDY: 'دعم ترويجي',
        DISCOUNT: 'خصم',
        RENEWAL: 'تجديد',
        REFUND: 'استرجاع',
      };
      const rtAr: Record<string, string> = {
        INVOICE: 'فاتورة',
        SUBSCRIPTION: 'اشتراك',
        CUSTOMER: 'عميل',
      };
      const tx = txAr[p[1] ?? ''] ?? p[1];
      const rt = rtAr[p[2] ?? ''] ?? p[2];
      const id = p[3] ?? '';
      const frag = id.length > 8 ? `${id.slice(0, 8)}…` : id;
      return `مرجع: ${tx} — ${rt} · ${frag || '—'}`;
    }
  }
  if (ref.includes('SUBSCRIPTION_ACTIVATION')) {
    const subId = ref.split(':')[2] ?? '';
    const frag =
      subId.length > 8 ? `${subId.slice(0, 8)}…` : subId;
    return `تفعيل اشتراك · تسوية المتبقي · ${frag || '—'}`;
  }
  if (ref.startsWith('JOURNAL:INVOICE_ISSUED:')) {
    const oid = ref.replace('JOURNAL:INVOICE_ISSUED:', '');
    const frag = oid.length > 8 ? `${oid.slice(0, 8)}…` : oid;
    return `قيد إصدار · ${frag || '—'}`;
  }
  if (ref.startsWith('JOURNAL:INVOICE_CANCELED:')) {
    const oid = ref.replace('JOURNAL:INVOICE_CANCELED:', '');
    const frag = oid.length > 8 ? `${oid.slice(0, 8)}…` : oid;
    return `قيد إلغاء · ${frag || '—'}`;
  }
  if (ref.startsWith('PAYMENT:')) {
    const parts = ref.split(':');
    const trace = parts[2] ?? '';
    const frag =
      trace.length > 10 ? `${trace.slice(0, 10)}…` : trace;
    if (parts[1] === 'CASH') return `نقدي · ${frag || '—'}`;
    if (parts[1] === 'KNET') return `كي‌نت · ${frag || '—'}`;
    if (parts[1] === 'ONLINE') return `أونلاين · ${frag || '—'}`;
    if (parts[1] === 'PAYMENT_LINK') return `رابط دفع · ${frag || '—'}`;
    if (parts[1] === 'WALLET') return `من المحفظة · ${frag || '—'}`;
  }

  return describeJournalEntry(source, ref);
}

/**
 * خدمة دفتر اليومية مزدوج القيد — النواة المحاسبية للنظام.
 *
 * تكتب كل العمليات المالية (إصدار فواتير، تسديدات، خصومات، استردادات، إلغاءات)
 * كقيود متوازنة (مجموع المدين = مجموع الدائن ± 0.001 د.ك) في جدول `JournalEntry`.
 * جميع القيود غير قابلة للتغيير بعد الكتابة؛ أي تصحيح يتم عبر قيد عكسي منفصل.
 *
 * المبادئ الثابتة (invariants):
 * - كل كتابة تمر عبر `appendBalanced` الذي يتحقق من التوازن ورموز الحسابات.
 * - `sourceRef` حتمي لكل قيد → الكتابة مرنة بالكامل (idempotent on retry).
 * - الطرق المنتهية بـ `Safe` لا توقف التدفق التجاري عند الإخفاق؛ تُسجِّل الفشل
 *   وتُفعِّل قاطع الدائرة عند تجاوز العتبة. الاستثناء: عند تفعيل
 *   `JOURNAL_FAIL_CLOSED_CRITICAL=true` تُعيد الدالتان الحرجتان
 *   (`appendExternalPaymentEntrySafe` و`appendInvoiceIssuanceEntrySafe`)
 *   رمي الخطأ بعد التسجيل لإلغاء المعاملة (fail-closed).
 * - قراءة الأرصدة تُجرى فقط من `JournalLine` (حساب 1300 — الذمم).
 *
 * The double-entry journal service — the system's accounting core.
 *
 * Writes every financial operation (invoice issuance, payments, discounts,
 * refunds, cancellations) as a balanced entry (Σ debit = Σ credit ± 0.001 KWD)
 * into the `JournalEntry` table. All entries are append-only; corrections
 * require a separate reversal entry.
 *
 * Invariants:
 * - Every write goes through `appendBalanced`, which enforces balance and account codes.
 * - `sourceRef` is deterministic per operation → fully idempotent on retry.
 * - Methods ending in `Safe` never abort the surrounding business transaction;
 *   they log failures and trip the circuit breaker on threshold breach.
 *   Exception: when `JOURNAL_FAIL_CLOSED_CRITICAL=true`, the two CRITICAL
 *   wrappers (`appendExternalPaymentEntrySafe`, `appendInvoiceIssuanceEntrySafe`)
 *   re-throw after logging so the transaction rolls back (fail-closed).
 * - Balance reads query only `JournalLine` (account 1300 — AR).
 *
 * @since V20.1
 */
