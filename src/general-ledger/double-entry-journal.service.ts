import { Injectable, Logger, Optional } from '@nestjs/common';
import { DebtSource, PosPaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialPeriodsService } from '../finance/periods/financial-periods.service';

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

const UUID_SEGMENT =
  '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

/**
 * Some historical exports / intermediates used hyphenated `sourceRef`
 * shapes. Normalise them so {@link describeJournalEntry} and subscription
 * parsing match canonical colon forms.
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
 * Best-effort subscription id for journal rows tied to
 * `WALLET_FUNDING:SUBSCRIPTION` or `SUBSCRIPTION_ACTIVATION` payments.
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
 * Order id embedded in `INVOICE:<uuid>:SHORTFALL` /
 * `INVOICE:<uuid>:SUBSCRIPTION_OVERUSE` journal `sourceRef` values
 * (after {@link normalizeLegacyJournalSourceRef}).
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

function paymentMethodLabelFromMeta(meta: Prisma.JsonValue | null | undefined): string | null {
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
 * Prefer explicit `payment_method` from journal line `meta`; otherwise
 * infer from asset account codes (and promotional subsidy lines).
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
 * V20.1-v4 — Phase 16 circuit-breaker error.
 *
 * Thrown by `mirrorDebtLedgerEntrySafe` when the same customer has
 * accumulated more than {@link CRITICAL_FAILURE_THRESHOLD} journal
 * failures in {@link CRITICAL_FAILURE_WINDOW_MS}. The intent is to
 * trip a hard error in the calling business flow once journal
 * divergence has reached a level that operators will not catch via
 * the daily drift cron.
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

/** V20.1-v4 — Phase 16 circuit-breaker tuning. */
export const CRITICAL_FAILURE_THRESHOLD = 3;
const CRITICAL_FAILURE_WINDOW_MS = 5 * 60 * 1000;

type Db = PrismaService | Prisma.TransactionClient;

type JournalLineInput = {
  accountCode: string;
  debit?: Prisma.Decimal | string | number;
  credit?: Prisma.Decimal | string | number;
  meta?: Prisma.InputJsonValue;
};

type AppendJournalInput = {
  source: string;
  sourceRef: string;
  actorUserId: string;
  customerId?: string | null;
  orderId?: string | null;
  /**
   * V20.5 — Phase 9 branch attribution. Optional and nullable;
   * pre-Phase 9 callers continue to work unchanged. New writers
   * pass the resolved branch (handover shift → user → null).
   */
  branchId?: string | null;
  /**
   * V20.6 — Phase 1 period-lock attribution.
   *
   * Effective accounting date used by `FinancialPeriodsService.assertWriteAllowed`
   * to decide whether the (year, month) the row falls into is OPEN
   * or CLOSED. Defaults to "now" when omitted.
   *
   * Pre-V20.6 callers do not need to change — the guard derives the
   * period from the current timestamp, which matches the previous
   * implicit behaviour.
   */
  effectiveAt?: Date | null;
  /**
   * V20.6 — Phase 1 reversal opt-in.
   *
   * When `true`, this entry is ALLOWED into a CLOSED period (a
   * violation row is still recorded for the auditor — it just
   * doesn't reject the write). Set this only on REVERSAL writers
   * such as `appendInvoiceCancellationEntry` and
   * `appendSubscriptionRefundEntry`.
   */
  allowReversal?: boolean;
  lines: JournalLineInput[];
};

type MirrorDebtLedgerInput = {
  source: DebtSource | string;
  amount: Prisma.Decimal | string | number;
  sourceRef?: string | null;
  actorUserId?: string | null;
  customerId: string;
  orderId?: string | null;
  paymentMethod?: PosPaymentMethod | string | null;
  note?: string | null;
};

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

/** صف واحد لكل قيد — أسلوب كشف بنكي لمركز الاتصال (دفع / دعم / محفظة / ذمم). */
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

const BANK_STATEMENT_PAY_IN_CODES = new Set<string>([
  JOURNAL_ACCOUNTS.CASH,
  JOURNAL_ACCOUNTS.BANK_KNET,
  JOURNAL_ACCOUNTS.BANK_ONLINE,
]);

/**
 * يشتق أعمدة الكشف البنكي من أسطر القيد كاملة (خادم فقط — بدون رياضيات في الواجهة).
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

function entryRefTail(sourceRef: string): string {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  return ref.split(':').slice(-1)[0]?.slice(0, 12) ?? '';
}

/**
 * V21 Phase 5 — Arabic-friendly one-line title for a journal entry,
 * derived from `(source, sourceRef)`. Customer journal UIs render this
 * verbatim (no English `source` enums in the default path).
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
 * يستخرج اسم الباقة من سطر السياق الذي يبنيه
 * {@link DoubleEntryJournalService.resolveContextLabelsByEntryId}
 * (صيغة `الباقة: … · الدفع: …`).
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
 * أوصاف كشف العميل / الكول سنتر: استبدال ذيل UUID قصير بمرجع الطلب أو
 * الفاتورة الورقية ({@link DoubleEntryJournalService.resolveOrderRefLabelByOrderId})
 * أو اسم الباقة (`subscriptionPlanLabel`) لقيود الاشتراك.
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
 * Arabic detail line for the technical `sourceRef` (shown under the title in UI).
 * Keeps UUID / trace fragments short; full ref remains available via API `sourceRef`.
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

@Injectable()
export class DoubleEntryJournalService {
  private readonly logger = new Logger(DoubleEntryJournalService.name);

  /**
   * V20.6 — Phase 1 enforcement flag.
   *
   * When `PERIOD_LOCK_ENFORCE !== 'true'` the guard is skipped
   * entirely (current behaviour). When `'true'`, every
   * `appendBalanced` call falls through `assertWriteAllowed`
   * before any journal row is created. Read at every call so an
   * operator can flip the flag without restarting the process
   * (useful during incident response).
   */
  private isPeriodLockEnforced(): boolean {
    return process.env.PERIOD_LOCK_ENFORCE === 'true';
  }

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly periodGuard: FinancialPeriodsService | null = null,
  ) {}

  async appendBalanced(
    db: Db,
    input: AppendJournalInput,
  ): Promise<{ id: string }> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    if (!input.sourceRef?.trim()) throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
    if (input.lines.length < 2) throw new Error('JOURNAL_MINIMUM_TWO_LINES');

    // V20.6 — Phase 1: idempotency check FIRST. A second call with
    // the same sourceRef must always short-circuit with the existing
    // row, even on a CLOSED period. Reasoning: the row was committed
    // when the period was OPEN; rejecting the retry now would surface
    // a phantom failure to a caller that already succeeded.
    const existing = await db.journalEntry.findUnique({
      where: { sourceRef: input.sourceRef },
      select: { id: true },
    });
    if (existing) return existing;

    // V20.6 — Phase 1 period-lock guard. Only fires when:
    //   1) PERIOD_LOCK_ENFORCE=true, AND
    //   2) the FinancialPeriodsService is wired into the DI graph
    //      (it is, via the @Global() PeriodsModule from V20.6).
    // The guard logs a violation row inside its own connection so
    // the audit trail survives even if the writer's transaction
    // rolls back as a result of the throw.
    if (this.isPeriodLockEnforced() && this.periodGuard) {
      const effectiveAt = input.effectiveAt ?? new Date();
      await this.periodGuard.assertWriteAllowed({
        effectiveAt,
        actorUserId: input.actorUserId ?? null,
        writerName: `DoubleEntryJournalService.${input.source}`,
        sourceRef: input.sourceRef,
        allowReversal: input.allowReversal ?? false,
        payload: {
          customerId: input.customerId ?? null,
          orderId: input.orderId ?? null,
          branchId: input.branchId ?? null,
        },
      });
    }

    const normalized = input.lines.map((line) => ({
      ...line,
      debit: this.decimal(line.debit ?? 0),
      credit: this.decimal(line.credit ?? 0),
    }));

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const line of normalized) {
      if (line.debit.lessThan(0) || line.credit.lessThan(0)) {
        throw new Error('NEGATIVE_JOURNAL_LINE');
      }
      if (line.debit.gt(0) && line.credit.gt(0)) {
        throw new Error('AMBIGUOUS_JOURNAL_LINE');
      }
      if (line.debit.equals(0) && line.credit.equals(0)) {
        throw new Error('EMPTY_JOURNAL_LINE');
      }
      totalDebit = totalDebit.add(line.debit);
      totalCredit = totalCredit.add(line.credit);
    }

    if (totalDebit.sub(totalCredit).abs().gt(new Prisma.Decimal('0.001'))) {
      throw new Error('UNBALANCED_JOURNAL');
    }

    const accounts = await db.account.findMany({
      where: {
        code: { in: normalized.map((line) => line.accountCode) },
        isActive: true,
      },
      select: { id: true, code: true },
    });
    const accountIdByCode = new Map(accounts.map((a) => [a.code, a.id]));
    for (const line of normalized) {
      if (!accountIdByCode.has(line.accountCode)) {
        throw new Error(`JOURNAL_ACCOUNT_NOT_FOUND:${line.accountCode}`);
      }
    }

    return db.journalEntry.create({
      data: {
        source: input.source,
        sourceRef: input.sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        branchId: input.branchId ?? null,
        lines: {
          create: normalized.map((line) => ({
            accountId: accountIdByCode.get(line.accountCode)!,
            debit: line.debit,
            credit: line.credit,
            ...(line.meta !== undefined ? { meta: line.meta } : {}),
          })),
        },
      },
      select: { id: true },
    });
  }

  /**
   * V20.1-v4 (was v2 Phase 9) — Non-blocking mirror with persistent
   * failure log and circuit breaker.
   *
   * Wraps {@link mirrorDebtLedgerEntry} so journal-side failures
   * (missing seeded account, balance check, unique constraint, DB
   * timeout, …) NEVER abort the surrounding business transaction
   * for the FIRST few attempts. Every failure:
   *   1) emits a `[JOURNAL_WRITE_FAILED]` log line
   *   2) persists a row in `JournalFailureLog` (best-effort: a
   *      failed persist is itself swallowed, so a degraded DB
   *      cannot rollback the business flow)
   *   3) checks recent failure density for the customer; if more
   *      than {@link CRITICAL_FAILURE_THRESHOLD} failures occurred
   *      in {@link CRITICAL_FAILURE_WINDOW_MS}, throws
   *      {@link CriticalJournalFailureError} so the caller's
   *      transaction rolls back and the operator is forced to
   *      triage before the divergence accumulates further.
   *
   * The breaker uses a SEPARATE Prisma client (`this.prisma`),
   * not the transaction client `db`, so the failure log persists
   * even if the surrounding transaction rolls back.
   */
  async mirrorDebtLedgerEntrySafe(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    try {
      return await this.mirrorDebtLedgerEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError
          ? err.code
          : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          amount:
            input.amount instanceof Prisma.Decimal
              ? input.amount.toFixed(4)
              : String(input.amount),
          message,
          errorCode,
        }),
      );

      await this.persistFailure(input, message, errorCode);
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * Persist a journal failure to {@link JournalFailureLog}. Uses the
   * raw prisma instance (not the transaction client) so the row
   * survives a rollback of the surrounding business transaction.
   * Best-effort: a failure to persist the failure is logged but
   * never propagated.
   */
  private async persistFailure(
    input: MirrorDebtLedgerInput,
    message: string,
    errorCode: string | null,
  ): Promise<void> {
    try {
      const amountDecimal =
        input.amount instanceof Prisma.Decimal
          ? input.amount
          : new Prisma.Decimal(String(input.amount));
      await this.prisma.journalFailureLog.create({
        data: {
          customerId: input.customerId ?? null,
          orderId: input.orderId ?? null,
          source: typeof input.source === 'string' ? input.source : String(input.source),
          sourceRef: input.sourceRef ?? null,
          amount: amountDecimal,
          errorCode,
          errorMessage: message,
          context: {
            paymentMethod: input.paymentMethod ?? null,
            note: input.note ?? null,
          },
        },
      });
    } catch (persistErr) {
      this.logger.error(
        `[JOURNAL_FAILURE_PERSIST_FAILED] customerId=${input.customerId} message=${(persistErr as Error)?.message}`,
      );
    }
  }

  /**
   * Phase 16 circuit breaker. Counts persisted failures for the
   * customer in the recent window; throws
   * {@link CriticalJournalFailureError} if the threshold is exceeded.
   *
   * Note: failures are counted from `JournalFailureLog`, NOT from
   * an in-process counter, so the breaker survives process restarts
   * and works correctly across horizontally-scaled instances.
   */
  private async tripBreakerIfNeeded(customerId: string | null | undefined): Promise<void> {
    if (!customerId) return;
    try {
      const since = new Date(Date.now() - CRITICAL_FAILURE_WINDOW_MS);
      const count = await this.prisma.journalFailureLog.count({
        where: { customerId, createdAt: { gte: since } },
      });
      if (count > CRITICAL_FAILURE_THRESHOLD) {
        throw new CriticalJournalFailureError(
          customerId,
          count,
          CRITICAL_FAILURE_WINDOW_MS,
        );
      }
    } catch (err) {
      if (err instanceof CriticalJournalFailureError) throw err;
      this.logger.error(
        `[JOURNAL_FAILURE_BREAKER_CHECK_FAILED] customerId=${customerId} message=${(err as Error)?.message}`,
      );
    }
  }

  /**
   * V20.3 — Phase 31 invoice issuance journal entry.
   *
   * Writes the full invoice amount to AR + REVENUE on order
   * issuance so the journal reflects the gross receivable, not
   * the post-wallet remainder. This is the "true" accounting
   * model: every invoice is recognised as revenue at issuance,
   * and subsequent payments (wallet absorption, cash, KNET,
   * payment-link) credit AR back down.
   *
   * Lines:
   *   DR ACCOUNTS_RECEIVABLE  (full invoice amount — what the customer owes)
   *   CR REVENUE              (full invoice amount — service value rendered)
   *
   * sourceRef: `JOURNAL:INVOICE_ISSUED:<orderId>`. Deterministic so
   * `appendBalanced` is idempotent on retry / re-entry.
   */
  async appendInvoiceIssuanceEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'INVOICE_ISSUED',
      sourceRef: `JOURNAL:INVOICE_ISSUED:${input.orderId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          debit: amount,
          meta: { event: 'INVOICE_ISSUED', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE,
          credit: amount,
          meta: { event: 'INVOICE_ISSUED', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 31 safe variant. Same Phase 16 contract as
   * {@link mirrorDebtLedgerEntrySafe}: failure logs + persists +
   * trips breaker, never aborts the surrounding business
   * transaction directly.
   */
  async appendInvoiceIssuanceEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendInvoiceIssuanceEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'INVOICE_ISSUED',
          sourceRef: `JOURNAL:INVOICE_ISSUED:${input.orderId}`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount:
            input.amount instanceof Prisma.Decimal
              ? input.amount.toFixed(4)
              : String(input.amount),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'INVOICE_ISSUED',
          sourceRef: `JOURNAL:INVOICE_ISSUED:${input.orderId}`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount: input.amount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.3 — Phase 33 wallet absorption journal entry (true model).
   *
   * The literal V20.2 prompt's shape: DR WALLET_LIABILITY / CR
   * ACCOUNTS_RECEIVABLE. Valid ONLY when `appendInvoiceIssuanceEntry`
   * has already DEBITED AR by the FULL invoice amount; otherwise
   * crediting AR pushes it negative. Use under
   * `V20_3_TRUE_ACCOUNTING=true` only.
   *
   * Lines:
   *   DR WALLET_LIABILITY     (we owe the customer N less)
   *   CR ACCOUNTS_RECEIVABLE  (customer owes us N less)
   *
   * sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:<orderId>:APPLIED`
   * (distinct from the V20.2 sourceRef so both can coexist
   * during the migration window).
   */
  async appendWalletAbsorptionEntryV3(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'WALLET_ABSORPTION_V3',
      sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:${input.orderId}:APPLIED`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: amount,
          meta: { event: 'WALLET_ABSORPTION_V3', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'WALLET_ABSORPTION_V3', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 33 safe variant.
   */
  async appendWalletAbsorptionEntryV3Safe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendWalletAbsorptionEntryV3(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'WALLET_ABSORPTION_V3',
          sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:${input.orderId}:APPLIED`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount:
            input.amount instanceof Prisma.Decimal
              ? input.amount.toFixed(4)
              : String(input.amount),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'WALLET_ABSORPTION_V3',
          sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:${input.orderId}:APPLIED`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount: input.amount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.3 — Phase 34 external payment journal entry.
   *
   * Writes `DR <CASH/BANK_KNET/BANK_ONLINE> / CR ACCOUNTS_RECEIVABLE`
   * for every external payment. Replaces the V20.1
   * `mirrorDebtLedgerEntry(PAYMENT, …)` path under V20.3 — the
   * substantive difference is that this entry is keyed by the
   * payment event (deterministic on the `paymentRef`) rather than
   * by the DebtLedgerEntry sourceRef, which is itself derived
   * data under the new model.
   *
   * sourceRef: `JOURNAL:EXTERNAL_PAYMENT:<paymentRef>` (caller
   * provides the unique `paymentRef`, e.g. `<orderId>:CASH`,
   * `<orderId>:KNET:<txId>`, `<paymentBundleId>:GATEWAY`).
   */
  async appendExternalPaymentEntry(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      paymentMethod: PosPaymentMethod | string;
      paymentRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    if (!input.paymentRef?.trim()) {
      throw new Error('JOURNAL_EXTERNAL_PAYMENT_REF_REQUIRED');
    }
    const debitAccount = this.externalPaymentAssetAccount(input.paymentMethod);
    return this.appendBalanced(db, {
      source: 'EXTERNAL_PAYMENT',
      sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${input.paymentRef}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      lines: [
        {
          accountCode: debitAccount,
          debit: amount,
          meta: {
            event: 'EXTERNAL_PAYMENT',
            paymentMethod: input.paymentMethod,
            note: input.note ?? null,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'EXTERNAL_PAYMENT', paymentRef: input.paymentRef },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 34 safe variant.
   */
  async appendExternalPaymentEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      paymentMethod: PosPaymentMethod | string;
      paymentRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendExternalPaymentEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'EXTERNAL_PAYMENT',
          sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${input.paymentRef}`,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          amount:
            input.amount instanceof Prisma.Decimal
              ? input.amount.toFixed(4)
              : String(input.amount),
          paymentMethod: String(input.paymentMethod),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'EXTERNAL_PAYMENT',
          sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${input.paymentRef}`,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          amount: input.amount,
          actorUserId: input.actorUserId,
          paymentMethod: input.paymentMethod,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.3 — resolve the asset account for an external payment.
   * Mirrors the {@link paymentAssetAccount} branching but accepts
   * a paymentMethod directly (no DebtLedgerEntry to inspect).
   */
  private externalPaymentAssetAccount(
    method: PosPaymentMethod | string,
  ): string {
    if (method === PosPaymentMethod.KNET) return JOURNAL_ACCOUNTS.BANK_KNET;
    if (
      method === PosPaymentMethod.ONLINE ||
      method === PosPaymentMethod.PAYMENT_LINK
    ) {
      return JOURNAL_ACCOUNTS.BANK_ONLINE;
    }
    if (method === PosPaymentMethod.CASH) return JOURNAL_ACCOUNTS.CASH;
    return JOURNAL_ACCOUNTS.CASH;
  }

  /**
   * V20.2 — Phase 27 wallet-absorption journal entry (revised).
   *
   * Writes a balanced, AR-neutral journal entry that recognises
   * the wallet portion of an invoice as revenue while reducing
   * the wallet liability we owed the customer. Required to satisfy
   * the v4 invariant "every wallet deduction has 3 entries"
   * (TransactionHistory + DebtLedgerEntry PAYMENT + JournalEntry).
   *
   * Lines:
   *   DR WALLET_LIABILITY  (we owe the customer 5 KD less)
   *   CR REVENUE           (5 KD of service was rendered)
   *
   * Why CR REVENUE and not CR ACCOUNTS_RECEIVABLE (deviation from
   * the literal V20.2 prompt):
   *   • The matching `INVOICE_SHORTFALL` row already carries the
   *     post-wallet remainder (e.g. SHORTFALL = 15 KD when the
   *     invoice was 20 KD and wallet absorbed 5 KD), so the AR
   *     journal balance for that order is 15 KD.
   *   • Crediting AR by another 5 KD here would push journal AR
   *     to 10 KD while the DebtLedgerEntry net stays at 15 KD,
   *     tripping the Phase 29 lockstep on every wallet absorption.
   *   • The cleanest fix (gross-invoice SHORTFALL = full 20 KD,
   *     plus a separate AR-issuance entry) requires changing the
   *     SHORTFALL semantic across the entire system and is queued
   *     for V20.3. Until then, CR REVENUE keeps the journal AR in
   *     lockstep with the DebtLedger AR while still recognising
   *     the wallet portion as revenue.
   *
   * sourceRef: `JOURNAL:WALLET_ABSORPTION:<orderId>:APPLIED`
   * (deterministic — appendBalanced is idempotent on sourceRef).
   */
  async appendWalletAbsorptionEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'WALLET_ABSORPTION',
      sourceRef: `JOURNAL:WALLET_ABSORPTION:${input.orderId}:APPLIED`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: amount,
          meta: { event: 'WALLET_ABSORPTION', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE,
          credit: amount,
          meta: { event: 'WALLET_ABSORPTION', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * Safe variant of {@link appendWalletAbsorptionEntry} — uses the
   * same Phase 16 failure log + breaker contract as
   * {@link mirrorDebtLedgerEntrySafe}.
   */
  async appendWalletAbsorptionEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendWalletAbsorptionEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'WALLET_ABSORPTION',
          sourceRef: `JOURNAL:WALLET_ABSORPTION:${input.orderId}:APPLIED`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount:
            input.amount instanceof Prisma.Decimal
              ? input.amount.toFixed(4)
              : String(input.amount),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'WALLET_ABSORPTION',
          sourceRef: `JOURNAL:WALLET_ABSORPTION:${input.orderId}:APPLIED`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount: input.amount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  async mirrorDebtLedgerEntry(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;

    const sourceRef =
      input.sourceRef?.trim() ||
      `JOURNAL:${input.source}:${input.customerId}:${input.orderId ?? 'CUSTOMER'}:${Date.now()}`;

    if (input.source === DebtSource.PAYMENT || input.source === 'PAYMENT') {
      // V20.1 — Wallet-absorption PAYMENTs are recorded in DebtLedgerEntry
      // for audit (see WALLET_ABSORPTION_SOURCE_REF_PREFIXES), but they
      // must NOT be mirrored as DR <asset> / CR AR. Today the matching
      // INVOICE_SHORTFALL only carries the *remainder* (post-wallet),
      // so crediting AR by the wallet portion would push the journal
      // AR balance below the DebtLedgerEntry net (induced drift).
      // Revenue recognition for the wallet portion is a separate
      // cleanup tracked under V20.2 (full POS revenue → journal).
      if (sourceRef.startsWith('PAYMENT:WALLET:')) {
        return null;
      }
      const assetAccount = this.paymentAssetAccount(input);
      const isAdjustment = assetAccount === JOURNAL_ACCOUNTS.ADJUSTMENTS;
      const payMeta =
        input.paymentMethod != null
          ? {
              posPaymentMethod: input.paymentMethod,
              note: input.note ?? null,
            }
          : { note: input.note ?? null };
      return this.appendBalanced(db, {
        source: isAdjustment ? 'ADJUSTMENT' : 'PAYMENT',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: assetAccount,
            debit: amount,
            meta: payMeta,
          },
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            credit: amount,
            meta: {
              debtSource: input.source,
              ...(input.paymentMethod != null
                ? { posPaymentMethod: input.paymentMethod }
                : {}),
            },
          },
        ],
      });
    }

    if (
      input.source === DebtSource.INVOICE_SHORTFALL ||
      input.source === DebtSource.SUBSCRIPTION_OVERUSE ||
      input.source === 'INVOICE_SHORTFALL' ||
      input.source === 'SUBSCRIPTION_OVERUSE'
    ) {
      return this.appendBalanced(db, {
        source: 'INVOICE',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            debit: amount,
            meta: { debtSource: input.source },
          },
          {
            accountCode: JOURNAL_ACCOUNTS.REVENUE,
            credit: amount,
            meta: { note: input.note ?? null },
          },
        ],
      });
    }

    return null;
  }

  // ====================================================================
  //   V20.4 — FINAL CANONICAL BANKING CORE — PHASE 1 ENTRY TYPES
  // ====================================================================
  //
  // The V20.3.4 forensic audit found three flows that mutate balances
  // without any journal trail:
  //   1. Subscription cancellation refund (cash + gift removal).
  //   2. Subscription activation under `accrueSaleOnAccount=true`
  //      (plan-sale revenue recognition deferred to AR).
  //   3. CC partial-payment discount portion (goodwill writedown).
  // Plus one drift source:
  //   4. Invoice cancellation never reverses the original issuance.
  //
  // These four `appendXxxEntry` / `appendXxxEntrySafe` pairs close
  // the gaps. All sourceRefs are deterministic so retries are
  // idempotent (P2002 → return existing entry, no double-post).

  /**
   * V20.4 — Phase 1 invoice cancellation reversal entry.
   *
   * Reverses the issuance entry's REVENUE recognition by
   * debiting REVENUE_RETURNS, and clears the AR debit by
   * crediting ACCOUNTS_RECEIVABLE for whatever portion is
   * still on the books for that order.
   *
   * Call site MUST pass `remainingArAmount` = the remaining
   * AR balance for the order at the moment of cancellation
   * (computed from prior journal lines on this order). If
   * the order was already fully paid, pass 0 and the helper
   * returns null without writing.
   *
   * Lines:
   *   DR REVENUE_RETURNS         (recognise the contra-revenue)
   *   CR ACCOUNTS_RECEIVABLE     (clear the outstanding AR)
   *
   * sourceRef: `JOURNAL:INVOICE_CANCELED:<orderId>`.
   */
  async appendInvoiceCancellationEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      remainingArAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.remainingArAmount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'INVOICE_CANCELED',
      sourceRef: `JOURNAL:INVOICE_CANCELED:${input.orderId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      // V20.6 — Phase 1: explicit reversal opt-in. Cancellation of
      // a previously-issued invoice is the canonical reversal flow
      // and must remain permitted even after the period closes.
      allowReversal: true,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE_RETURNS,
          debit: amount,
          meta: {
            event: 'INVOICE_CANCELED',
            orderId: input.orderId,
            reason: input.reason ?? null,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'INVOICE_CANCELED', orderId: input.orderId },
        },
      ],
    });
  }

  async appendInvoiceCancellationEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      remainingArAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendInvoiceCancellationEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'INVOICE_CANCELED',
          sourceRef: `JOURNAL:INVOICE_CANCELED:${input.orderId}`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount:
            input.remainingArAmount instanceof Prisma.Decimal
              ? input.remainingArAmount.toFixed(4)
              : String(input.remainingArAmount),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'INVOICE_CANCELED',
          sourceRef: `JOURNAL:INVOICE_CANCELED:${input.orderId}`,
          customerId: input.customerId,
          orderId: input.orderId,
          amount: input.remainingArAmount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.4 — Phase 1 debt-discount entry.
   *
   * Recognises a CC-granted goodwill discount as an expense and
   * clears the matching AR. Replaces the legacy single-entry
   * `GeneralLedgerEntry.DEBT_ADJUSTMENT` write that was the only
   * record of the discount until V20.4.
   *
   * Lines:
   *   DR DEBT_DISCOUNTS        (P&L expense — goodwill writedown)
   *   CR ACCOUNTS_RECEIVABLE   (AR cleared by the discounted amount)
   *
   * sourceRef: `JOURNAL:DEBT_DISCOUNT:<discountRef>` — caller
   * supplies a deterministic ref (e.g. `<customerId>:<thRowId>`).
   */
  async appendDebtDiscountEntry(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      discountRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    if (!input.discountRef?.trim()) {
      throw new Error('JOURNAL_DEBT_DISCOUNT_REF_REQUIRED');
    }
    return this.appendBalanced(db, {
      source: 'DEBT_DISCOUNT',
      sourceRef: `JOURNAL:DEBT_DISCOUNT:${input.discountRef}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.DEBT_DISCOUNTS,
          debit: amount,
          meta: { event: 'DEBT_DISCOUNT', note: input.note ?? null },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'DEBT_DISCOUNT', discountRef: input.discountRef },
        },
      ],
    });
  }

  async appendDebtDiscountEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      discountRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendDebtDiscountEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'DEBT_DISCOUNT',
          sourceRef: `JOURNAL:DEBT_DISCOUNT:${input.discountRef}`,
          customerId: input.customerId,
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'DEBT_DISCOUNT',
          sourceRef: `JOURNAL:DEBT_DISCOUNT:${input.discountRef}`,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          amount: input.amount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.4 — Phase 1 subscription refund entry.
   *
   * Records the journal-side effect of `cancelSubscriptionForCustomer`.
   * Two independent legs are required because gift removal and cash
   * refund have different P&L treatments:
   *
   *   GIFT REMOVAL (we void promotional credit we previously gave):
   *     DR WALLET_LIABILITY    (we owe customer N less)
   *     CR PROMOTIONAL_EXPENSE (reverses the promotional spend)
   *
   *   CASH REFUND (we return cash to the customer):
   *     DR WALLET_LIABILITY    (we owe customer N less)
   *     CR CASH                (cash leaves the till)
   *
   * Either leg may be zero (e.g. only gift was unused). The helper
   * writes both legs in a single balanced entry; if one leg is zero
   * it is omitted. If both are zero the helper returns null.
   *
   * sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:<subscriptionId>`.
   */
  async appendSubscriptionRefundEntry(
    db: Db,
    input: {
      customerId: string;
      subscriptionId: string;
      actorUserId: string;
      giftRemovalAmount: Prisma.Decimal | string | number;
      cashRefundAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const giftAmount = this.decimal(input.giftRemovalAmount);
    const cashAmount = this.decimal(input.cashRefundAmount);
    if (giftAmount.lessThanOrEqualTo(0) && cashAmount.lessThanOrEqualTo(0)) {
      return null;
    }
    const lines: JournalLineInput[] = [];
    if (giftAmount.greaterThan(0)) {
      lines.push(
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: giftAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_GIFT',
            subscriptionId: input.subscriptionId,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE,
          credit: giftAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_GIFT',
            subscriptionId: input.subscriptionId,
            reason: input.reason ?? null,
          },
        },
      );
    }
    if (cashAmount.greaterThan(0)) {
      lines.push(
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: cashAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_CASH',
            subscriptionId: input.subscriptionId,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.CASH,
          credit: cashAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_CASH',
            subscriptionId: input.subscriptionId,
            reason: input.reason ?? null,
          },
        },
      );
    }
    return this.appendBalanced(db, {
      source: 'SUBSCRIPTION_REFUND',
      sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:${input.subscriptionId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: null,
      // V20.6 — Phase 1: subscription refunds (gift removal +
      // cash refund) are P&L reversals and must be permitted on
      // CLOSED periods as long as the operator explicitly opted
      // in (this flag is the explicit opt-in for ALL callers of
      // this helper).
      allowReversal: true,
      lines,
    });
  }

  async appendSubscriptionRefundEntrySafe(
    db: Db,
    input: {
      customerId: string;
      subscriptionId: string;
      actorUserId: string;
      giftRemovalAmount: Prisma.Decimal | string | number;
      cashRefundAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendSubscriptionRefundEntry(db, input);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const errorCode =
        err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      const totalAmount = this.decimal(input.giftRemovalAmount).add(
        this.decimal(input.cashRefundAmount),
      );
      // eslint-disable-next-line no-console
      console.error(
        '[JOURNAL_WRITE_FAILED]',
        JSON.stringify({
          source: 'SUBSCRIPTION_REFUND',
          sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:${input.subscriptionId}`,
          customerId: input.customerId,
          subscriptionId: input.subscriptionId,
          giftAmount:
            input.giftRemovalAmount instanceof Prisma.Decimal
              ? input.giftRemovalAmount.toFixed(4)
              : String(input.giftRemovalAmount),
          cashAmount:
            input.cashRefundAmount instanceof Prisma.Decimal
              ? input.cashRefundAmount.toFixed(4)
              : String(input.cashRefundAmount),
          message,
          errorCode,
        }),
      );
      await this.persistFailure(
        {
          source: 'SUBSCRIPTION_REFUND',
          sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:${input.subscriptionId}`,
          customerId: input.customerId,
          orderId: null,
          amount: totalAmount,
          actorUserId: input.actorUserId,
        },
        message,
        errorCode,
      );
      await this.tripBreakerIfNeeded(input.customerId);
      return null;
    }
  }

  /**
   * V20.4 — Phase 1 helper used by `appendInvoiceCancellationEntry`
   * call sites to compute the remaining AR for an order at the
   * moment of cancellation. Reads journal-only — works under both
   * V20.2 and V20.3 because both models converge on AR being
   * the source of truth for "still outstanding".
   *
   * Returns Decimal(0) for orders never journal-issued (legacy
   * orders pre-V20.3) so the caller naturally skips the no-op.
   */
  async getOrderArBalance(orderId: string): Promise<Prisma.Decimal> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { orderId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: { debit: true, credit: true },
    });
    let balance = new Prisma.Decimal(0);
    for (const line of lines) {
      balance = balance.add(line.debit).sub(line.credit);
    }
    return balance.lessThan(0) ? new Prisma.Decimal(0) : balance;
  }

  async getCustomerBalanceFromJournal(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    const rows = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: { debit: true, credit: true },
    });
    return rows.reduce(
      (sum, row) => sum.add(row.debit).sub(row.credit),
      new Prisma.Decimal(0),
    );
  }

  async logCustomerDrift(
    customerId: string,
    ledgerBalance: Prisma.Decimal | string | number,
  ): Promise<void> {
    const journalBalance = await this.getCustomerBalanceFromJournal(customerId);
    const ledger = this.decimal(ledgerBalance);
    if (ledger.sub(journalBalance).abs().gt(new Prisma.Decimal('0.001'))) {
      console.error('[JOURNAL_DRIFT]', {
        customerId,
        ledgerBalance: ledger.toFixed(4),
        journalBalance: journalBalance.toFixed(4),
      });
    }
  }

  /**
   * V25 — shared enrichment for subscription plan name + payment channel
   * (journal line meta + asset accounts). Used by AR statement rows and
   * full-entry views.
   */
  private async resolveContextLabelsByEntryId(
    entries: ReadonlyArray<{
      id: string;
      source: string;
      sourceRef: string;
      lines: ReadonlyArray<{
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        meta: Prisma.JsonValue | null;
        account: { code: string };
      }>;
    }>,
  ): Promise<Map<string, string | undefined>> {
    const subIds = new Set<string>();
    for (const e of entries) {
      const sid = parseSubscriptionIdFromJournalRef(e.source, e.sourceRef);
      if (sid) subIds.add(sid);
    }
    const planBySub =
      subIds.size === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.prisma.customerSubscription.findMany({
                where: { id: { in: [...subIds] } },
                select: { id: true, planNameSnapshot: true },
              })
            ).map((s) => [s.id, s.planNameSnapshot]),
          );

    const map = new Map<string, string | undefined>();
    for (const e of entries) {
      const subId = parseSubscriptionIdFromJournalRef(e.source, e.sourceRef);
      const planName = subId ? planBySub.get(subId) : undefined;
      const payChannel = inferPaymentChannelArFromJournalLines([...e.lines]);
      const bits: string[] = [];
      if (planName?.trim()) bits.push(`الباقة: ${planName.trim()}`);
      if (payChannel?.trim()) bits.push(`الدفع: ${payChannel.trim()}`);
      map.set(e.id, bits.length > 0 ? bits.join(' · ') : undefined);
    }
    return map;
  }

  private async resolveOrderRefLabelByOrderId(
    orderIds: ReadonlyArray<string>,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(orderIds.filter((id) => id?.trim()))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.order.findMany({
      where: { id: { in: unique } },
      select: { id: true, serialNumber: true, invoiceNumber: true },
    });
    const map = new Map<string, string>();
    for (const o of rows) {
      if (o.serialNumber?.trim()) {
        map.set(o.id, `طلب ${o.serialNumber.trim()}`);
      } else if (o.invoiceNumber?.trim()) {
        map.set(o.id, `فاتورة ورقية ${o.invoiceNumber.trim()}`);
      }
    }
    return map;
  }

  private collectOrderIdsForCustomerFacingDescriptions(
    entries: ReadonlyArray<{
      orderId: string | null;
      source: string;
      sourceRef: string;
    }>,
  ): string[] {
    const ids: string[] = [];
    for (const e of entries) {
      const oid =
        e.orderId ??
        parseOrderIdFromInvoiceJournalRef(e.source, e.sourceRef);
      if (oid) ids.push(oid);
    }
    return ids;
  }

  async getCustomerStatement(
    customerId: string,
  ): Promise<{ balance: string; rows: JournalStatementRow[] }> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
      select: {
        debit: true,
        credit: true,
        entry: {
          select: {
            id: true,
            source: true,
            sourceRef: true,
            createdAt: true,
            orderId: true,
          },
        },
      },
    });

    const entryIds = [...new Set(lines.map((l) => l.entry.id))];
    const entriesForContext =
      entryIds.length === 0
        ? []
        : await this.prisma.journalEntry.findMany({
            where: { id: { in: entryIds } },
            select: {
              id: true,
              source: true,
              sourceRef: true,
              orderId: true,
              lines: {
                orderBy: { id: 'asc' },
                select: {
                  debit: true,
                  credit: true,
                  meta: true,
                  account: { select: { code: true } },
                },
              },
            },
          });

    const contextByEntry =
      await this.resolveContextLabelsByEntryId(entriesForContext);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entriesForContext),
    );
    const entryIdToOrderLabel = new Map<string, string | null>();
    const entryLinesById = new Map(
      entriesForContext.map((e) => [e.id, e.lines] as const),
    );
    for (const e of entriesForContext) {
      const oid =
        e.orderId ??
        parseOrderIdFromInvoiceJournalRef(e.source, e.sourceRef);
      const label = oid ? labelByOrder.get(oid) ?? null : null;
      entryIdToOrderLabel.set(e.id, label);
    }

    let balance = new Prisma.Decimal(0);
    const rows = lines.map((line) => {
      balance = balance.add(line.debit).sub(line.credit);
      const fullLines = entryLinesById.get(line.entry.id) ?? [];
      return {
        entryId: line.entry.id,
        date: line.entry.createdAt.toISOString(),
        description: describeJournalEntryForCustomerFacing(
          line.entry.source,
          line.entry.sourceRef,
          entryIdToOrderLabel.get(line.entry.id) ?? null,
          parsePlanNameFromContextLabel(contextByEntry.get(line.entry.id)),
          inferPaymentChannelArFromJournalLines(fullLines),
        ),
        contextLabel: contextByEntry.get(line.entry.id),
        debit: line.debit.toFixed(4),
        credit: line.credit.toFixed(4),
        balance: balance.toFixed(4),
      };
    });

    return { balance: balance.toFixed(4), rows };
  }

  /**
   * كشف «بنكي» لمركز الاتصال: صف واحد لكل قيد كامل مع أعمدة دفع العميل /
   * دعم الشركة / حركة المحفظة (2100) / الجانب المحاسبي للذمم، ورصيد ذمم
   * تراكمي بعد كل قيد. القراءة من `JournalEntry` كما في
   * {@link getCustomerJournalEntries}، والرياضيات هنا فقط على الخادم.
   */
  async getCustomerCallCenterBankStatement(
    customerId: string,
  ): Promise<{ balance: string; rows: CallCenterBankStatementRow[] }> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        createdAt: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            debit: true,
            credit: true,
            meta: true,
            account: { select: { code: true } },
          },
        },
      },
    });

    const contextByEntry = await this.resolveContextLabelsByEntryId(entries);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entries),
    );

    let arRunning = new Prisma.Decimal(0);
    const rows: CallCenterBankStatementRow[] = entries.map((entry) => {
      const agg = aggregateJournalEntryForBankColumns(entry.lines);
      arRunning = arRunning
        .add(new Prisma.Decimal(agg.arDebitKd))
        .sub(new Prisma.Decimal(agg.arCreditKd));

      const oid =
        entry.orderId ??
        parseOrderIdFromInvoiceJournalRef(entry.source, entry.sourceRef);
      const orderRefLabel = oid ? labelByOrder.get(oid) ?? null : null;
      const payCh = inferPaymentChannelArFromJournalLines([...entry.lines]);

      return {
        entryId: entry.id,
        date: entry.createdAt.toISOString(),
        description: describeJournalEntryForCustomerFacing(
          entry.source,
          entry.sourceRef,
          orderRefLabel,
          parsePlanNameFromContextLabel(contextByEntry.get(entry.id)),
          payCh,
        ),
        contextLabel: contextByEntry.get(entry.id),
        customerPaidKd: agg.customerPaidKd,
        companySupportKd: agg.companySupportKd,
        debtGoodwillDiscountKd: agg.debtGoodwillDiscountKd,
        walletCreditKd: agg.walletCreditKd,
        walletDebitKd: agg.walletDebitKd,
        arDebitKd: agg.arDebitKd,
        arCreditKd: agg.arCreditKd,
        arBalanceKd: arRunning.toFixed(4),
      };
    });

    return { balance: arRunning.toFixed(4), rows };
  }

  /**
   * V22 Phase 6 — full double-entry journal view for a single customer.
   *
   * `getCustomerStatement` projects only the AR slice (one row per
   * AR-side line) which is correct for a "كشف حساب" but does NOT
   * surface the actual double-entry shape: every balanced entry has
   * 2+ lines across multiple accounts (Dr CASH / Cr AR, Dr AR / Cr
   * REVENUE, …). Operators kept asking "where is the matching
   * double-entry?" because they only saw one side.
   *
   * This method returns every JournalEntry that mentions the customer
   * (entry.customerId = customerId), with ALL of its lines and the
   * resolved account `code` + `name`, plus a per-entry trial-balance
   * check (Σ debit − Σ credit MUST be ≤ 0.001 by appendBalanced
   * guard). The frontend renders both sides verbatim so the audit
   * trail is visually self-evident.
   *
   * Append-only / read-side: this is a pure SELECT that reuses the
   * existing `JournalEntry_customerId_createdAt_idx`. No mutation,
   * no derived calculation — every value is canonical Decimal(19,4).
   */
  async getCustomerJournalEntries(
    customerId: string,
  ): Promise<{
    customerId: string;
    entries: Array<{
      entryId: string;
      source: string;
      sourceRef: string;
      /** UI subtitle — Arabic expansion of `sourceRef` (technical ref still in `sourceRef`). */
      referenceLabel: string;
      /** e.g. `الباقة: … · الدفع: …` when resolvable from subscription + journal lines. */
      contextLabel?: string;
      description: string;
      createdAt: string;
      totalDebitKd: string;
      totalCreditKd: string;
      balanced: boolean;
      lines: Array<{
        accountCode: string;
        accountName: string;
        debitKd: string;
        creditKd: string;
      }>;
    }>;
  }> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        createdAt: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            debit: true,
            credit: true,
            meta: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
    });

    const contextByEntry = await this.resolveContextLabelsByEntryId(entries);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entries),
    );

    const out = entries.map((entry) => {
      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);
      const lines = entry.lines.map((line) => {
        totalDebit = totalDebit.add(line.debit);
        totalCredit = totalCredit.add(line.credit);
        return {
          accountCode: line.account.code,
          accountName: line.account.name,
          debitKd: line.debit.toFixed(4),
          creditKd: line.credit.toFixed(4),
        };
      });
      const balanced = totalDebit.sub(totalCredit).abs().lte(new Prisma.Decimal('0.001'));

      const contextLabel = contextByEntry.get(entry.id);

      const oid =
        entry.orderId ??
        parseOrderIdFromInvoiceJournalRef(entry.source, entry.sourceRef);
      const orderRefLabel = oid ? labelByOrder.get(oid) ?? null : null;
      const payCh = inferPaymentChannelArFromJournalLines([...entry.lines]);

      return {
        entryId: entry.id,
        source: entry.source,
        sourceRef: entry.sourceRef,
        referenceLabel: humanizeJournalSourceRef(
          entry.source,
          entry.sourceRef,
        ),
        contextLabel,
        description: describeJournalEntryForCustomerFacing(
          entry.source,
          entry.sourceRef,
          orderRefLabel,
          parsePlanNameFromContextLabel(contextLabel),
          payCh,
        ),
        createdAt: entry.createdAt.toISOString(),
        totalDebitKd: totalDebit.toFixed(4),
        totalCreditKd: totalCredit.toFixed(4),
        balanced,
        lines,
      };
    });

    return { customerId, entries: out };
  }

  private paymentAssetAccount(input: MirrorDebtLedgerInput): string {
    const ref = input.sourceRef ?? '';
    const method = input.paymentMethod ?? '';
    const note = input.note?.toLowerCase() ?? '';
    if (ref.includes(':KNET:') || method === PosPaymentMethod.KNET) {
      return JOURNAL_ACCOUNTS.BANK_KNET;
    }
    if (
      ref.includes(':ONLINE:') ||
      ref.includes(':PAYMENT_LINK:') ||
      method === PosPaymentMethod.ONLINE ||
      method === PosPaymentMethod.PAYMENT_LINK
    ) {
      return JOURNAL_ACCOUNTS.BANK_ONLINE;
    }
    if (ref.includes(':CASH:') || method === PosPaymentMethod.CASH) {
      return JOURNAL_ACCOUNTS.CASH;
    }
    if (ref.startsWith('ADJUSTMENT:') || note.includes('void') || note.includes('edit')) {
      return JOURNAL_ACCOUNTS.ADJUSTMENTS;
    }
    return JOURNAL_ACCOUNTS.CASH;
  }

  private decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value.toString());
  }
}
