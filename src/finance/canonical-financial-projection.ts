import { OrderStatus, Prisma } from '@prisma/client';

/**
 * عقد إسقاطات النواة المصرفية الرسمية — V21.
 *
 * يحتوي هذا الملف على مُختارات (selectors) قابلة للإعادة الاستخدام لإجماليات الكشوف،
 * وأرصدة تشغيلية تراكمية، وملخصات مالية للقراءة فقط. لا يُنفِّذ أي كتابة
 * في دفتر الأستاذ أو اليومية — قراءة صرفة.
 *
 * V21 Canonical Banking Core projection contract.
 *
 * Owns reusable projection selectors for statement totals, running balances,
 * and other read-model-only financial summaries. Must stay read-only — must
 * not write any ledger or journal rows.
 *
 * @since V21
 */

/**
 * مدخلات فاتورة واحدة لحساب إجماليات الكشف الرسمي.
 * `openDebt` يُحدد إن كانت الفاتورة ما زالت مستحقة أم سُددت.
 *
 * Single invoice input for computing canonical statement totals.
 * `openDebt` indicates whether the invoice is still outstanding or settled.
 *
 * @since V21
 */
export type CanonicalStatementInvoiceInput = {
  totalKd: string | number | Prisma.Decimal;
  status: OrderStatus | string;
  openDebt: boolean;
};

/**
 * تصنيف الفاتورة في الكشف: غير مسددة / مسددة / ملغاة.
 *
 * Invoice classification for statement display: unpaid / paid / canceled.
 *
 * @since V21
 */
export type CanonicalStatementInvoiceGroup = 'UNPAID' | 'PAID' | 'CANCELED';

/**
 * إجماليات الكشف الرسمي: إجمالي الفوترة، المسدد، المفتوح، وعدادات الفئات.
 * جميع القيم المالية نصية 4dp KWD من الخادم — بدون حسابات في الواجهة.
 *
 * Canonical statement totals: total invoiced, paid, open, and category counts.
 * All monetary values are 4dp KWD strings from the server — no client arithmetic.
 *
 * @since V21
 */
export type CanonicalStatementTotals = {
  totalInvoicedKd: string;
  totalPaidInvoicesKd: string;
  totalOpenInvoicesKd: string;
  unpaidInvoiceCount: number;
  paidInvoiceCount: number;
  canceledInvoiceCount: number;
};

/**
 * يُصنِّف فاتورة واحدة إلى مجموعة الكشف (غير مسددة / مسددة / ملغاة).
 * تأخذ الأولوية للحالة `CANCELED` بصرف النظر عن `openDebt`.
 *
 * Classifies a single invoice into its statement group (UNPAID / PAID / CANCELED).
 * CANCELED status takes priority over the `openDebt` flag.
 *
 * @param invoice - حالة الفاتورة ومؤشر الدين المفتوح | Invoice status and open-debt flag
 * @returns تصنيف المجموعة | Statement group classification
 * @since V21
 */
export function canonicalStatementInvoiceGroup(
  invoice: Pick<CanonicalStatementInvoiceInput, 'status' | 'openDebt'>,
): CanonicalStatementInvoiceGroup {
  if (invoice.status === OrderStatus.CANCELED || invoice.status === 'CANCELED') {
    return 'CANCELED';
  }
  return invoice.openDebt ? 'UNPAID' : 'PAID';
}

/**
 * يحسب إجماليات الكشف الرسمي من مصفوفة فواتير.
 * الفواتير الملغاة تُحتسب في العداد فقط — لا تُضاف لأي إجمالي مالي.
 * جميع الحسابات تجري بـ `Prisma.Decimal` — لا `parseFloat`.
 *
 * Computes canonical statement totals from an array of invoices.
 * Canceled invoices only count towards the counter — excluded from all monetary totals.
 * All arithmetic uses `Prisma.Decimal` — no `parseFloat`.
 *
 * @param invoices - قائمة مدخلات الفواتير | Invoice input array
 * @returns إجماليات الكشف الرسمية | Canonical statement totals
 * @since V21
 */
export function computeCanonicalStatementTotals(
  invoices: ReadonlyArray<CanonicalStatementInvoiceInput>,
): CanonicalStatementTotals {
  const totals = invoices.reduce(
    (acc, inv) => {
      if (inv.status === OrderStatus.CANCELED || inv.status === 'CANCELED') {
        acc.canceledInvoiceCount += 1;
        return acc;
      }
      const total = new Prisma.Decimal(inv.totalKd.toString());
      acc.totalInvoiced = acc.totalInvoiced.plus(total);
      if (inv.openDebt) {
        acc.totalOpen = acc.totalOpen.plus(total);
        acc.unpaidInvoiceCount += 1;
      } else {
        acc.totalPaid = acc.totalPaid.plus(total);
        acc.paidInvoiceCount += 1;
      }
      return acc;
    },
    {
      totalInvoiced: new Prisma.Decimal(0),
      totalPaid: new Prisma.Decimal(0),
      totalOpen: new Prisma.Decimal(0),
      unpaidInvoiceCount: 0,
      paidInvoiceCount: 0,
      canceledInvoiceCount: 0,
    },
  );
  return {
    totalInvoicedKd: totals.totalInvoiced.toFixed(4),
    totalPaidInvoicesKd: totals.totalPaid.toFixed(4),
    totalOpenInvoicesKd: totals.totalOpen.toFixed(4),
    unpaidInvoiceCount: totals.unpaidInvoiceCount,
    paidInvoiceCount: totals.paidInvoiceCount,
    canceledInvoiceCount: totals.canceledInvoiceCount,
  };
}

/**
 * مدخلات حدث واحد من كشف العميل (تفعيل اشتراك، دفعة، إلخ) لحساب إسقاط الحدث.
 *
 * Single customer statement event input for projection computation
 * (subscription activation, payment, etc.).
 *
 * @since V21
 */
export type CanonicalStatementEventInput = {
  kind: string;
  amountKd: string | number | Prisma.Decimal;
  balanceAfterKd: string | number | Prisma.Decimal;
  debtAfterKd: string | number | Prisma.Decimal;
  debtSettledKd: string | number | Prisma.Decimal;
  debtDiscountKd: string | number | Prisma.Decimal;
  closedInvoices?: ReadonlyArray<{ totalKd: string | number | Prisma.Decimal }>;
};

/**
 * إسقاط حدث الكشف: هل هو قيد دائن؟ الذمة الفعلية بعد الحدث، ومؤشرات الخصم والتسوية.
 * يُستخدم في واجهات Customer 360 وكشف حساب مركز الاتصال.
 *
 * Statement event projection: credit indicator, effective debt after event,
 * and discount/settlement flags. Used in Customer 360 and CC statement UIs.
 *
 * @since V21
 */
export type CanonicalStatementEventProjection = {
  isCredit: boolean;
  effectiveDebtAfterKd: string;
  hasDebtDiscount: boolean;
  hasDebtSettled: boolean;
  closedInvoicesTotalKd: string;
};

/**
 * يحسب إسقاط حدث كشف العميل من مدخلاته.
 * الذمة الفعلية = ذمة بعد الحدث + الرصيد السالب المطلق (إن وُجد).
 * إجمالي الفواتير المغلقة يُحسب من مصفوفة `closedInvoices`.
 *
 * Computes the canonical statement event projection from event inputs.
 * Effective debt = debt-after + |negative balance| (if any).
 * Closed invoices total aggregated from the `closedInvoices` array.
 *
 * @param event - بيانات الحدث | Event input data
 * @returns إسقاط الحدث | Event projection
 * @since V21
 */
export function computeCanonicalStatementEventProjection(
  event: CanonicalStatementEventInput,
): CanonicalStatementEventProjection {
  const amount = new Prisma.Decimal(event.amountKd.toString());
  const balanceAfter = new Prisma.Decimal(event.balanceAfterKd.toString());
  const debtAfter = new Prisma.Decimal(event.debtAfterKd.toString());
  const debtSettled = new Prisma.Decimal(event.debtSettledKd.toString());
  const debtDiscount = new Prisma.Decimal(event.debtDiscountKd.toString());
  const negativeBalanceDebt = balanceAfter.lessThan(0)
    ? balanceAfter.abs()
    : new Prisma.Decimal(0);
  const closedInvoicesTotal = (event.closedInvoices ?? []).reduce(
    (acc, invoice) => acc.plus(new Prisma.Decimal(invoice.totalKd.toString())),
    new Prisma.Decimal(0),
  );

  return {
    isCredit: event.kind === 'SUBSCRIPTION_ACTIVATION' || amount.lessThan(0),
    effectiveDebtAfterKd: debtAfter.plus(negativeBalanceDebt).toFixed(4),
    hasDebtDiscount: debtDiscount.greaterThan(0),
    hasDebtSettled: debtSettled.greaterThan(0),
    closedInvoicesTotalKd: closedInvoicesTotal.toFixed(4),
  };
}

/**
 * صف واحد من مدخلات الرصيد التراكمي المتبقي للعميل (حسب الطلب وتاريخ الإصدار).
 *
 * Single row input for computing the customer's chronological running remaining balance
 * (per order and issuance date).
 *
 * @since V21
 */
export type CanonicalRunningRemainingInput = {
  customerId: string;
  orderId: string;
  issuedAt: string | Date;
  debtSource?: string | null;
  remainingKd: string | number | Prisma.Decimal;
};

/**
 * نتيجة صف مُثرّى برصيد تراكمي متبقٍ للعميل (`customerRunningRemainingKd`).
 *
 * Row enriched with the customer's running remaining KD balance after this row.
 *
 * @since V21
 */
export type CanonicalRunningRemainingResult<T> = T & {
  customerRunningRemainingKd: string;
};

/**
 * مدخلات صف سائق لملخص الذمم المستحقة (عدد الفواتير، الإجمالي، التأخر).
 *
 * Driver row input for the outstanding debt driver summary
 * (invoice count, total due, days late).
 *
 * @since V21
 */
export type CanonicalOutstandingDriverInput = {
  driverId?: string | null;
  driverName?: string | null;
  invoicesCount: number;
  totalDueKd: string | number | Prisma.Decimal;
  daysLate: number;
};

/**
 * ملخص سائق واحد في تقرير الذمم المستحقة (مجمَّع من طلباته).
 *
 * Aggregated driver summary in the outstanding debt report.
 *
 * @since V21
 */
export type CanonicalOutstandingDriverSummary = {
  driverId: string | null;
  driverName: string;
  customers: number;
  invoices: number;
  totalRemainingKd: string;
  maxDaysLate: number;
};

/**
 * صف فاتورة غير مسددة بقناة إلكترونية (رابط دفع / أونلاين) لإسقاط التقرير.
 *
 * Unpaid-online invoice row for the payment-link/online report projection.
 *
 * @since V21
 */
export type CanonicalUnpaidOnlineReportRow = {
  amountKd: string | number | Prisma.Decimal;
  branchName?: string | null;
  driverName?: string | null;
  paymentUrl?: string | null;
  reminderCount: number;
  paymentMethod?: string | null;
};

/**
 * ملخص فرع واحد في تقرير الفواتير الإلكترونية غير المسددة.
 *
 * Single branch summary in the unpaid-online invoice report.
 *
 * @since V21
 */
export type CanonicalUnpaidOnlineBranchSummary = {
  branchName: string;
  invoices: number;
  totalRemainingKd: string;
  driversCount: number;
};

/**
 * ملخص روابط الدفع القابلة للإجراء مقابل الإجمالي الكلي.
 *
 * Summary of actionable payment-link rows vs. total row count.
 *
 * @since V21
 */
export type CanonicalUnpaidOnlinePaymentLinkSummary = {
  totalRows: number;
  actionableRows: number;
};

/**
 * الإسقاط الكامل لتقرير الفواتير الإلكترونية غير المسددة:
 * ملخصات الفروع + ملخص روابط الدفع + مؤشرات أسطر روابط الدفع.
 *
 * Full projection for the unpaid-online report:
 * branch summaries + payment-link summary + actionable row indexes.
 *
 * @since V21
 */
export type CanonicalUnpaidOnlineReportProjection = {
  branchSummaries: CanonicalUnpaidOnlineBranchSummary[];
  paymentLinkSummary: CanonicalUnpaidOnlinePaymentLinkSummary;
  paymentLinkRowIndexes: number[];
};

/**
 * مدخلات يوم واحد من تقرير تعافي الديون (المحصَّل، عدد التسويات، عدد الاشتراكات).
 *
 * Single day input for the debt recovery report (recovered amount, settlement and subscription counts).
 *
 * @since V21
 */
export type CanonicalDebtRecoveryDayInput = {
  recoveredKd: string | number | Prisma.Decimal;
  settlementCount: number;
  subscriptionCount: number;
};

/**
 * ملخص تقرير تعافي الديون: إجماليات وأعلى يوم وتوجهات نسبية (0–100).
 *
 * Debt recovery report summary: totals, peak day, and relative trend ratios (0–100).
 *
 * @since V21
 */
export type CanonicalDebtRecoverySummary = {
  totalSettlements: number;
  totalSubscriptions: number;
  maxRecoveredKd: string;
  trendRatios: number[];
};

/**
 * مدخلات إجماليات مدفوعات العمولة (معلقة / محررة / مدفوعة / ملغاة).
 *
 * Commission payout totals input (pending / released / paid / cancelled).
 *
 * @since V21
 */
export type CanonicalCommissionPayoutTotalsInput = {
  pendingKd: string | number | Prisma.Decimal;
  releasedKd: string | number | Prisma.Decimal;
  paidKd: string | number | Prisma.Decimal;
  cancelledKd: string | number | Prisma.Decimal;
};

/**
 * إجماليات ملخص مدفوعات العمولة كقيم نصية 4dp KWD.
 *
 * Commission payout summary totals as 4dp KWD strings.
 *
 * @since V21
 */
export type CanonicalCommissionPayoutSummaryTotals = {
  pendingKd: string;
  releasedKd: string;
  paidKd: string;
  cancelledKd: string;
};

/**
 * صف مدخلات فاتورة سائق معلقة (المبلغ + النص القابل للبحث للتصفية).
 *
 * Driver pending invoice input row (amount + searchable text for filtering).
 *
 * @since V21
 */
export type CanonicalDriverPendingInvoiceInput = {
  amountKd: string | number | Prisma.Decimal;
  searchableText: string;
};

/**
 * إسقاط قائمة فواتير السائق المعلقة مع دعم البحث النصي والإجمالي.
 *
 * Projection of driver pending invoices with text search support and totals.
 *
 * @since V21
 */
export type CanonicalDriverPendingInvoiceProjection<T> = {
  rows: T[];
  totalAmountKd: string;
  filteredCount: number;
  totalCount: number;
};

/**
 * مدخلات صف كاش سائق (المبلغ) لحساب ملخص العهدة النقدية.
 *
 * Driver cash custody row input (amount) for computing the custody summary.
 *
 * @since V21
 */
export type CanonicalDriverCashCustodyInput = {
  amountKd: string | number | Prisma.Decimal;
};

/**
 * ملخص العهدة النقدية للسائق: إجمالي الكاش، عدد الطلبات، والإجمالي الكلي.
 *
 * Driver cash custody summary: cash total, order count, and grand total.
 *
 * @since V21
 */
export type CanonicalDriverCashCustodySummary = {
  cashTotalKd: string;
  cashOrderCount: number;
  grandTotalKd: string;
};

const debtSourceSortRank = (source: string | null | undefined): number => {
  if (source === 'INVOICE_SHORTFALL') return 0;
  if (source === 'SUBSCRIPTION_OVERUSE') return 1;
  return 2;
};

/**
 * يُضيف الرصيد التراكمي المتبقي للعميل إلى كل صف بترتيب زمني.
 * الصفوف بنفس تاريخ الإصدار تُرتَّب بـ `orderId` ثم مصدر الدين
 * (`INVOICE_SHORTFALL` أولًا) للحصول على تراكم حتمي ومتكرر.
 *
 * Attaches a customer-scoped running remaining balance to every row in chronological order.
 * Rows with the same issuance date are sub-sorted by `orderId` then debt source
 * (`INVOICE_SHORTFALL` first) for a deterministic, repeatable accumulation.
 *
 * @param rows - صفوف مرتبة بأي ترتيب | Rows in any order
 * @returns نفس الصفوف مُثرَّاة بـ `customerRunningRemainingKd` | Same rows enriched with running balance
 * @since V21
 */
export function attachCanonicalRunningRemaining<
  T extends CanonicalRunningRemainingInput,
>(rows: ReadonlyArray<T>): Array<CanonicalRunningRemainingResult<T>> {
  const output = rows.map((row) => ({
    ...row,
    customerRunningRemainingKd: '0.0000',
  }));
  const byCustomer = new Map<string, Array<CanonicalRunningRemainingResult<T>>>();
  for (const row of output) {
    const bucket = byCustomer.get(row.customerId) ?? [];
    bucket.push(row);
    byCustomer.set(row.customerId, bucket);
  }
  for (const bucket of byCustomer.values()) {
    const chronological = [...bucket].sort((a, b) => {
      const ta = new Date(a.issuedAt).getTime();
      const tb = new Date(b.issuedAt).getTime();
      if (ta !== tb) return ta - tb;
      if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
      return debtSourceSortRank(a.debtSource) - debtSourceSortRank(b.debtSource);
    });
    let running = new Prisma.Decimal(0);
    for (const row of chronological) {
      running = running.plus(new Prisma.Decimal(row.remainingKd.toString()));
      row.customerRunningRemainingKd = running.toFixed(4);
    }
  }
  return output;
}

const NO_DRIVER_LABEL = 'بدون سائق';
const NO_BRANCH_LABEL = 'بدون فرع';

/**
 * يُجمِّع صفوف الذمم المستحقة إلى ملخصات حسب السائق مرتبة تنازليًا بالمبلغ.
 * السائقون بلا معرف يُجمَّعون تحت تسمية `بدون سائق`.
 *
 * Aggregates outstanding debt rows into per-driver summaries sorted by amount descending.
 * Rows without a driver ID are grouped under `بدون سائق`.
 *
 * @param rows - صفوف مدخلات السائقين | Driver input rows
 * @returns ملخصات السائقين مرتبة | Sorted driver summaries
 * @since V21
 */
export function computeCanonicalOutstandingDriverSummaries(
  rows: ReadonlyArray<CanonicalOutstandingDriverInput>,
): CanonicalOutstandingDriverSummary[] {
  const byDriver = new Map<string, {
    driverId: string | null;
    driverName: string;
    customers: number;
    invoices: number;
    totalRemaining: Prisma.Decimal;
    maxDaysLate: number;
  }>();

  for (const row of rows) {
    const driverId = row.driverId ?? null;
    const key = driverId ?? '__no_driver__';
    const existing = byDriver.get(key);
    const amount = new Prisma.Decimal(row.totalDueKd ?? 0);
    if (existing) {
      existing.customers += 1;
      existing.invoices += row.invoicesCount;
      existing.totalRemaining = existing.totalRemaining.plus(amount);
      existing.maxDaysLate = Math.max(existing.maxDaysLate, row.daysLate);
      continue;
    }

    byDriver.set(key, {
      driverId,
      driverName: (row.driverName ?? '').trim() || NO_DRIVER_LABEL,
      customers: 1,
      invoices: row.invoicesCount,
      totalRemaining: amount,
      maxDaysLate: row.daysLate,
    });
  }

  return Array.from(byDriver.values())
    .map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      customers: row.customers,
      invoices: row.invoices,
      totalRemainingKd: row.totalRemaining.toFixed(3),
      maxDaysLate: row.maxDaysLate,
    }))
    .sort((a, b) => {
      const byAmount = new Prisma.Decimal(b.totalRemainingKd)
        .sub(a.totalRemainingKd)
        .toNumber();
      if (byAmount !== 0) return byAmount;
      return a.driverName.localeCompare(b.driverName);
    });
}

/**
 * يُنتج إسقاط تقرير الفواتير الإلكترونية غير المسددة:
 * ملخصات الفروع مرتبة تنازليًا + ملخص روابط الدفع + مؤشرات الأسطر القابلة للإجراء.
 * صف قابل للإجراء = مبلغ موجب + رابط دفع أو تذكير سابق أو وسيلة دفع إلكترونية.
 *
 * Produces the unpaid-online report projection:
 * branch summaries sorted descending + payment-link summary + actionable row indexes.
 * A row is actionable if it has a positive amount with a payment URL, prior reminder,
 * or electronic payment method.
 *
 * @param rows - صفوف الفواتير غير المسددة بقناة إلكترونية | Unpaid-online invoice rows
 * @returns إسقاط التقرير الكامل | Full report projection
 * @since V21
 */
export function computeCanonicalUnpaidOnlineReportProjection(
  rows: ReadonlyArray<CanonicalUnpaidOnlineReportRow>,
): CanonicalUnpaidOnlineReportProjection {
  const byBranch = new Map<
    string,
    {
      branchName: string;
      invoices: number;
      totalRemaining: Prisma.Decimal;
      drivers: Set<string>;
    }
  >();
  let actionableRows = 0;

  const paymentLinkRowIndexes: number[] = [];

  rows.forEach((row, index) => {
    const branchName = (row.branchName ?? '').trim() || NO_BRANCH_LABEL;
    const driverName = (row.driverName ?? '').trim() || NO_DRIVER_LABEL;
    const existing =
      byBranch.get(branchName) ??
      {
        branchName,
        invoices: 0,
        totalRemaining: new Prisma.Decimal(0),
        drivers: new Set<string>(),
      };
    existing.invoices += 1;
    existing.totalRemaining = existing.totalRemaining.plus(
      new Prisma.Decimal(row.amountKd ?? 0),
    );
    existing.drivers.add(driverName);
    byBranch.set(branchName, existing);

    if (isCanonicalPaymentLinkActionable(row)) {
      actionableRows += 1;
      paymentLinkRowIndexes.push(index);
    }
  });

  return {
    branchSummaries: Array.from(byBranch.values())
      .map((row) => ({
        branchName: row.branchName,
        invoices: row.invoices,
        totalRemainingKd: row.totalRemaining.toFixed(3),
        driversCount: row.drivers.size,
      }))
      .sort((a, b) => {
        const byAmount = new Prisma.Decimal(b.totalRemainingKd)
          .sub(a.totalRemainingKd)
          .toNumber();
        if (byAmount !== 0) return byAmount;
        return a.branchName.localeCompare(b.branchName);
      }),
    paymentLinkSummary: {
      totalRows: rows.length,
      actionableRows,
    },
    paymentLinkRowIndexes,
  };
}

function isCanonicalPaymentLinkActionable(
  row: CanonicalUnpaidOnlineReportRow,
): boolean {
  const amount = new Prisma.Decimal(row.amountKd ?? 0);
  if (amount.lte(0)) return false;
  if ((row.paymentUrl ?? '').trim()) return true;
  if (row.reminderCount > 0) return true;
  return row.paymentMethod === 'PAYMENT_LINK' || row.paymentMethod === 'ONLINE';
}

/**
 * يُلخِّص بيانات تعافي الديون اليومية: الإجماليات، أعلى يوم محصَّل، والنسب التوجهية.
 * النسب توجهية (0–100) تُقاس نسبةً للقيمة اليومية القصوى للرسوم البيانية.
 *
 * Summarises daily debt recovery data: totals, peak recovered day, and trend ratios.
 * Trend ratios (0–100) are relative to the maximum daily value for charting.
 *
 * @param days - بيانات أيام تعافي الديون | Debt recovery day data
 * @returns ملخص تعافي الديون | Debt recovery summary
 * @since V21
 */
export function computeCanonicalDebtRecoverySummary(
  days: ReadonlyArray<CanonicalDebtRecoveryDayInput>,
): CanonicalDebtRecoverySummary {
  let totalSettlements = 0;
  let totalSubscriptions = 0;
  let maxRecovered = new Prisma.Decimal(0);
  const recovered = days.map((day) => {
    totalSettlements += day.settlementCount;
    totalSubscriptions += day.subscriptionCount;
    const value = new Prisma.Decimal(day.recoveredKd ?? 0);
    if (value.greaterThan(maxRecovered)) maxRecovered = value;
    return value;
  });

  return {
    totalSettlements,
    totalSubscriptions,
    maxRecoveredKd: maxRecovered.toFixed(4),
    trendRatios: recovered.map((value) => {
      if (maxRecovered.lte(0)) return 0;
      return Math.round(value.div(maxRecovered).toNumber() * 100);
    }),
  };
}

/**
 * يحسب إجماليات ملخص مدفوعات العمولة من صفوف متعددة.
 * الجمع بـ `Prisma.Decimal` — لا `parseFloat`.
 *
 * Computes commission payout summary totals from multiple rows.
 * Aggregation uses `Prisma.Decimal` — no `parseFloat`.
 *
 * @param totals - صفوف المدخلات | Input rows
 * @returns إجماليات ملخص العمولة | Commission summary totals
 * @since V21
 */
export function computeCanonicalCommissionPayoutSummaryTotals(
  totals: ReadonlyArray<CanonicalCommissionPayoutTotalsInput>,
): CanonicalCommissionPayoutSummaryTotals {
  const out = {
    pending: new Prisma.Decimal(0),
    released: new Prisma.Decimal(0),
    paid: new Prisma.Decimal(0),
    cancelled: new Prisma.Decimal(0),
  };

  for (const row of totals) {
    out.pending = out.pending.plus(new Prisma.Decimal(row.pendingKd ?? 0));
    out.released = out.released.plus(new Prisma.Decimal(row.releasedKd ?? 0));
    out.paid = out.paid.plus(new Prisma.Decimal(row.paidKd ?? 0));
    out.cancelled = out.cancelled.plus(new Prisma.Decimal(row.cancelledKd ?? 0));
  }

  return {
    pendingKd: out.pending.toFixed(4),
    releasedKd: out.released.toFixed(4),
    paidKd: out.paid.toFixed(4),
    cancelledKd: out.cancelled.toFixed(4),
  };
}

/**
 * يُصفِّي فواتير السائق المعلقة بنص البحث ويُحسب الإجمالي والعدادات.
 * البحث غير حساس لحالة الأحرف ويقارن بحقل `searchableText` المُعدَّ مسبقًا.
 * إذا كان البحث فارغًا تُعاد جميع الصفوف.
 *
 * Filters driver pending invoices by search text and computes total and counts.
 * Case-insensitive match against the pre-computed `searchableText` field.
 * Returns all rows when search is empty.
 *
 * @param rows - صفوف الفواتير المعلقة | Pending invoice rows
 * @param search - نص البحث (اختياري) | Search text (optional)
 * @returns إسقاط الفواتير المصفّاة مع الإجمالي | Filtered invoice projection with totals
 * @since V21
 */
export function computeCanonicalDriverPendingInvoiceProjection<
  T extends CanonicalDriverPendingInvoiceInput,
>(
  rows: ReadonlyArray<T>,
  search?: string | null,
): CanonicalDriverPendingInvoiceProjection<T> {
  const needle = (search ?? '').trim().toLowerCase();
  const filtered =
    needle ?
      rows.filter((row) => row.searchableText.toLowerCase().includes(needle))
    : [...rows];
  const total = filtered.reduce(
    (sum, row) => sum.plus(new Prisma.Decimal(row.amountKd ?? 0)),
    new Prisma.Decimal(0),
  );

  return {
    rows: filtered,
    totalAmountKd: total.toFixed(3),
    filteredCount: filtered.length,
    totalCount: rows.length,
  };
}

/**
 * يحسب ملخص العهدة النقدية للسائق من صفوف الكاش.
 * `grandTotalKd` = `cashTotalKd` (لا توجد قنوات أخرى في هذا الإسقاط حاليًا).
 *
 * Computes the driver cash custody summary from cash rows.
 * `grandTotalKd` equals `cashTotalKd` (no other channels in this projection currently).
 *
 * @param rows - صفوف الكاش | Cash rows
 * @returns ملخص العهدة النقدية | Cash custody summary
 * @since V21
 */
export function computeCanonicalDriverCashCustodySummary(
  rows: ReadonlyArray<CanonicalDriverCashCustodyInput>,
): CanonicalDriverCashCustodySummary {
  const total = rows.reduce(
    (sum, row) => sum.plus(new Prisma.Decimal(row.amountKd ?? 0)),
    new Prisma.Decimal(0),
  );
  return {
    cashTotalKd: total.toFixed(3),
    cashOrderCount: rows.length,
    grandTotalKd: total.toFixed(3),
  };
}
