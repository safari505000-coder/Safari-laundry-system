import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  Droplets,
  FileText,
  HandCoins,
  Landmark,
  Loader2,
  PiggyBank,
  Printer,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  apiJson,
  ApiError,
  API_EXPENSES,
  API_EXPENSES_SUMMARY,
  type ExpenseRow,
  type MonthlySummaryLedgerRollup,
  type MonthlySummaryReport,
  type PayrollRow,
  type ExpensesSummaryResponse,
} from '@/lib/api';
import { formatKwdLabel, formatSignedKwdLabel } from '@/lib/kwd';
import {
  FilterBar,
  FilterField,
  PageHeader,
} from '@/modules/shared/components/page';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Separator } from '@/modules/shared/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * V19.13 — "الملخص الشهري" (Monthly Summary).
 *
 * V19.13.1 — tabs split Overview / Expenses / Payroll so the owner
 * can drill from hero numbers into the individual receipts and
 * payslips without leaving the page. Subscription subsidy
 * (`دعم الاشتراكات`) is surfaced as its own deduction line because
 * it is a real cost to the group even though the original executive
 * formula treated it as neutral. Printing is delegated to a
 * dedicated full-page route (`/monthly-summary/print`) opened in a
 * new window so the browser never has to deal with the shell's
 * overflow container — this is why the previous button produced
 * blank pages.
 */
export type BranchRow = MonthlySummaryReport['branches'][number];

type LedgerNs = 'glType' | 'journalType' | 'debtSource';

function LedgerRollupSection({
  title,
  rows,
  ns,
}: {
  title: string;
  rows: Array<{ code: string; totalKd: string; movementCount: number }>;
  ns: LedgerNs;
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            {t('monthlySummary.ledgerEmpty', 'لا توجد حركات.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-start text-muted-foreground">
                  <th className="px-4 py-2 font-medium">
                    {t('monthlySummary.colLedgerKind', 'البند')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('monthlySummary.colLedgerMovements', 'الحركات')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('monthlySummary.colLedgerTotal', 'المجموع')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-border/60">
                    <td className="px-4 py-2 text-foreground">
                      {t(`monthlySummary.${ns}.${r.code}`, r.code)}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums text-muted-foreground">
                      {r.movementCount}
                    </td>
                    <td
                      className="px-4 py-2 text-end text-sm font-semibold tabular-nums text-foreground"
                      dir="ltr"
                    >
                      {formatSignedKwdLabel(r.totalKd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerRollupTab({
  rollup,
  loading,
}: {
  rollup: MonthlySummaryLedgerRollup | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Card>
        <CardContent className="py-10">
          <Skeleton className="mx-auto h-8 w-48" />
        </CardContent>
      </Card>
    );
  }
  if (!rollup) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t(
            'monthlySummary.ledgerUnavailable',
            'سجل الحركات غير متوفر.',
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'monthlySummary.ledgerIntro',
          'كل قيد مالي دخل النظام خلال الفترة.',
        )}
      </p>
      <LedgerRollupSection
        title={t('monthlySummary.ledgerGlTitle', 'الدفتر الموحّد')}
        ns="glType"
        rows={rollup.generalLedger.map((g) => ({
          code: g.entryType,
          totalKd: g.totalKd,
          movementCount: g.movementCount,
        }))}
      />
      <LedgerRollupSection
        title={t('monthlySummary.ledgerJournalTitle', 'سجل المحفظة')}
        ns="journalType"
        rows={rollup.walletJournal.map((g) => ({
          code: g.type,
          totalKd: g.totalKd,
          movementCount: g.movementCount,
        }))}
      />
      <LedgerRollupSection
        title={t('monthlySummary.ledgerDebtTitle', 'دفتر الذمم')}
        ns="debtSource"
        rows={rollup.debtLedger.map((g) => ({
          code: g.source,
          totalKd: g.totalKd,
          movementCount: g.movementCount,
        }))}
      />
    </div>
  );
}

type RowFormula = Pick<
  BranchRow,
  | 'grossRevenueKd'
  | 'bankFeesTotalKd'
  | 'variableSoapFuelKd'
  | 'miscOperationalKd'
  | 'fixedExpensesKd'
  | 'payrollPaidKd'
  | 'totalExpensesVariableAndFixedKd'
  | 'subscriptionSubsidyKd'
  | 'netProfitKd'
  | 'collectedRevenueKd'
  | 'uncollectedRevenueKd'
  | 'debtPaymentsReceivedKd'
  | 'outstandingInvoiceDebtKd'
  | 'outstandingSubscriptionDebtKd'
  | 'outstandingDebtKd'
>;

type LineItem = {
  key: string;
  labelKey: string;
  fallback: string;
  icon: typeof Banknote;
  value: string;
  /** Rendered in red when true (expense/deduction). */
  negative?: boolean;
};

function startOfMonthIso(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return x.toISOString();
}

function endOfMonthIso(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return x.toISOString();
}

function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localInputToIso(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function buildBranchLines(row: RowFormula): LineItem[] {
  return [
    {
      key: 'gross',
      labelKey: 'monthlySummary.lineGross',
      fallback: 'إجمالي الإيرادات (فواتير مكتملة)',
      icon: Receipt,
      value: formatKwdLabel(row.grossRevenueKd),
    },
    {
      key: 'bank',
      labelKey: 'monthlySummary.lineBank',
      fallback: 'رسوم بنكية (KNET / بطاقات)',
      icon: Banknote,
      value: formatKwdLabel(row.bankFeesTotalKd),
      negative: true,
    },
    {
      key: 'variable',
      labelKey: 'monthlySummary.lineVariable',
      fallback: 'مصروفات متغيرة (صابون / وقود)',
      icon: Droplets,
      value: formatKwdLabel(row.variableSoapFuelKd),
      negative: true,
    },
    {
      key: 'misc',
      labelKey: 'monthlySummary.lineMisc',
      fallback: 'مصروفات متنوعة',
      icon: Wrench,
      value: formatKwdLabel(row.miscOperationalKd),
      negative: true,
    },
    {
      key: 'fixed',
      labelKey: 'monthlySummary.lineFixed',
      fallback: 'مصروفات ثابتة (إيجار / كهرباء)',
      icon: Building2,
      value: formatKwdLabel(row.fixedExpensesKd),
      negative: true,
    },
    {
      key: 'payroll',
      labelKey: 'monthlySummary.linePayroll',
      fallback: 'رواتب مدفوعة',
      icon: Users,
      value: formatKwdLabel(row.payrollPaidKd),
      negative: true,
    },
    {
      key: 'expensesTotal',
      labelKey: 'monthlySummary.lineExpensesTotal',
      fallback: 'إجمالي المصروفات (بدون رواتب)',
      icon: Wallet,
      value: formatKwdLabel(row.totalExpensesVariableAndFixedKd),
      negative: true,
    },
    {
      key: 'subsidy',
      labelKey: 'monthlySummary.lineSubsidy',
      fallback: 'دعم الاشتراكات (يُخصم من الأرباح)',
      icon: HandCoins,
      value: formatKwdLabel(row.subscriptionSubsidyKd),
      negative: true,
    },
  ];
}

/** Single, compact line row used inside every summary card. */
function LineRow({ item }: { item: LineItem }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70',
            item.negative
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-sky-600 dark:text-sky-400',
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm text-foreground">
          {t(item.labelKey, item.fallback)}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          item.negative && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {item.negative ? '− ' : ''}
        {item.value}
      </span>
    </li>
  );
}

/**
 * V19.15 — Collections strip: period flows + debt split (invoice / sub / total).
 */
function CollectionsStrip({
  collected,
  debtPayments,
  uncollected,
  outstandingInvoice,
  outstandingSubscription,
  outstandingTotal,
}: {
  collected: string;
  debtPayments: string;
  uncollected: string;
  outstandingInvoice: string;
  outstandingSubscription: string;
  outstandingTotal: string;
}) {
  const { t } = useTranslation();
  const tiles: Array<{
    key: string;
    labelKey: string;
    fallback: string;
    value: string;
    icon: typeof Banknote;
    tone: 'green' | 'sky' | 'amber' | 'red';
  }> = [
    {
      key: 'collected',
      labelKey: 'monthlySummary.lineCollected',
      fallback: 'المحصّل من فواتير هذا الشهر',
      value: collected,
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      key: 'priorDebt',
      labelKey: 'monthlySummary.lineDebtPayments',
      fallback:
        'تحصيل ديون على فواتير اكتملت قبل بداية الفترة (سُدّت خلال الفترة)',
      value: debtPayments,
      icon: PiggyBank,
      tone: 'sky',
    },
    {
      key: 'uncollected',
      labelKey: 'monthlySummary.lineUncollected',
      fallback:
        'غير المحصّل — فواتير الفترة فقط (مكتملة وما زالت على الدين)',
      value: uncollected,
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      key: 'outInv',
      labelKey: 'monthlySummary.lineOutstandingInvoiceDebt',
      fallback: 'متبقي ديون الفواتير (كل الفترات)',
      value: outstandingInvoice,
      icon: FileText,
      tone: 'red',
    },
    {
      key: 'outSub',
      labelKey: 'monthlySummary.lineOutstandingSubscriptionDebt',
      fallback: 'متبقي ديون الاشتراك / الزيادة (كل الفترات)',
      value: outstandingSubscription,
      icon: HandCoins,
      tone: 'red',
    },
    {
      key: 'outTotal',
      labelKey: 'monthlySummary.lineOutstandingDebt',
      fallback: 'إجمالي المديونية المتبقية (مجموع الفرعين)',
      value: outstandingTotal,
      icon: Landmark,
      tone: 'red',
    },
  ];
  const toneClass = (tone: 'green' | 'sky' | 'amber' | 'red') => {
    if (tone === 'green') {
      return 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    }
    if (tone === 'sky') {
      return 'border-sky-300/60 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
    }
    if (tone === 'amber') {
      return 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
    }
    return 'border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
  };
  return (
    <div className="mt-3">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">
        {t('monthlySummary.collectionsHeading', 'ملخّص التحصيل')}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.key}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2',
                toneClass(tile.tone),
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="truncate text-[11px] font-medium opacity-80">
                  {t(tile.labelKey, tile.fallback)}
                </div>
                <div className="text-sm font-bold tabular-nums">
                  {formatKwdLabel(tile.value)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Net-profit hero row — gold if positive, red if negative. */
function NetProfitRow({ value }: { value: string }) {
  const { t } = useTranslation();
  const n = Number.parseFloat(value || '0');
  const positive = Number.isFinite(n) ? n >= 0 : true;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        'mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3',
        positive
          ? 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
          : 'border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span className="truncate text-sm font-semibold">
          {t('monthlySummary.netProfit', 'صافي الربح')}
        </span>
      </div>
      <span className="shrink-0 text-lg font-bold tabular-nums">
        {formatKwdLabel(value)}
      </span>
    </div>
  );
}

export function SummaryCard({
  title,
  subtitle,
  row,
  highlighted,
}: {
  title: string;
  subtitle?: string;
  row: RowFormula;
  highlighted?: boolean;
}) {
  const lines = buildBranchLines(row);
  return (
    <Card
      className={cn(
        'overflow-hidden',
        highlighted &&
          'border-sky-300/70 bg-sky-50/40 dark:border-sky-500/30 dark:bg-sky-500/5',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="truncate">{title}</span>
          {highlighted ? (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-medium text-white">
              {subtitle}
            </span>
          ) : null}
        </CardTitle>
        {!highlighted && subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60">
          {lines.map((item) => (
            <LineRow key={item.key} item={item} />
          ))}
        </ul>
        <Separator className="my-3" />
        <NetProfitRow value={row.netProfitKd} />
        <CollectionsStrip
          collected={row.collectedRevenueKd}
          debtPayments={row.debtPaymentsReceivedKd}
          uncollected={row.uncollectedRevenueKd}
          outstandingInvoice={row.outstandingInvoiceDebtKd}
          outstandingSubscription={row.outstandingSubscriptionDebtKd}
          outstandingTotal={row.outstandingDebtKd}
        />
      </CardContent>
    </Card>
  );
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

export function ExpensesTab({
  rows,
  loading,
  totalApprovedKd = '0.000',
}: {
  rows: ExpenseRow[];
  loading: boolean;
  /** V25 — server-computed approved total from API_EXPENSES_SUMMARY. */
  totalApprovedKd?: string;
}) {
  const { t } = useTranslation();
  // @V24-LEGACY-MATH: approved total was computed locally with reduce+parseFloat.
  // const approved = useMemo(() => rows.filter((r) => r.status === 'APPROVED'), [rows]);
  // const totalApprovedKd = useMemo(
  //   () => approved.reduce((acc, r) => acc + Number.parseFloat(r.amount || '0'), 0).toFixed(4),
  //   [approved],
  // );
  // V25: totalApprovedKd is now a required prop passed in from API_EXPENSES_SUMMARY.

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>{t('monthlySummary.tabs.expenses', 'المصروفات')}</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {t('monthlySummary.expensesTotalApproved', 'الإجمالي المعتمد')}
              {': '}
              {formatKwdLabel(totalApprovedKd)}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              'monthlySummary.expensesHint',
              'المصروفات التشغيلية المسجلة في الفترة المختارة — تشمل المعتمد، قيد المراجعة والمرفوض.',
            )}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('monthlySummary.noExpenses', 'لا توجد مصروفات مسجلة للفترة.')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.date', 'التاريخ')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.branch', 'الفرع')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.title', 'البيان')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.category', 'الفئة')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.status', 'الحالة')}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t('monthlySummary.col.amount', 'المبلغ')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-2 tabular-nums">
                        {formatDateShort(r.expenseDate)}
                      </td>
                      <td className="py-2">
                        {r.branch?.name ?? '—'}
                      </td>
                      <td className="py-2">{r.title}</td>
                      <td className="py-2 text-xs">
                        {t(
                          `expenses.categories.${r.category}`,
                          r.category,
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5',
                            r.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : r.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
                          )}
                        >
                          {t(
                            `expenses.status.${r.status}`,
                            r.status,
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-end font-semibold tabular-nums">
                        {formatKwdLabel(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PayrollTab({
  rows,
  loading,
}: {
  rows: PayrollRow[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  const paid = useMemo(
    () => rows.filter((r) => r.status === 'PAID'),
    [rows],
  );
  const totalNetKd = useMemo(() => {
    let sum = 0;
    for (const r of paid) {
      const b = Number.parseFloat(r.basicSalary || '0');
      const a = Number.parseFloat(r.allowances || '0');
      const d = Number.parseFloat(r.deductions || '0');
      sum += b + a - d;
    }
    return sum.toFixed(4);
  }, [paid]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>{t('monthlySummary.tabs.payroll', 'الرواتب')}</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {t('monthlySummary.payrollTotalPaid', 'الإجمالي المدفوع')}
              {': '}
              {formatKwdLabel(totalNetKd)}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              'monthlySummary.payrollHint',
              'مسيّرات الرواتب المسجلة في الفترة المختارة. صافي الراتب = الراتب الأساسي + البدلات − الخصومات.',
            )}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('monthlySummary.noPayroll', 'لا توجد رواتب مسجلة للفترة.')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.date', 'التاريخ')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.employee', 'الموظف')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.branch', 'الفرع')}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t('monthlySummary.col.basic', 'أساسي')}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t('monthlySummary.col.allowances', 'بدلات')}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t('monthlySummary.col.deductions', 'خصومات')}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t('monthlySummary.col.net', 'الصافي')}
                    </th>
                    <th className="py-2 text-start font-medium">
                      {t('monthlySummary.col.status', 'الحالة')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const b = Number.parseFloat(r.basicSalary || '0');
                    const a = Number.parseFloat(r.allowances || '0');
                    const d = Number.parseFloat(r.deductions || '0');
                    const net = (b + a - d).toFixed(4);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/50 last:border-b-0"
                      >
                        <td className="py-2 tabular-nums">
                          {formatDateShort(r.paymentDate)}
                        </td>
                        <td className="py-2">{r.user.fullName}</td>
                        <td className="py-2">{r.branch.name}</td>
                        <td className="py-2 text-end tabular-nums">
                          {formatKwdLabel(r.basicSalary)}
                        </td>
                        <td className="py-2 text-end tabular-nums">
                          {formatKwdLabel(r.allowances)}
                        </td>
                        <td className="py-2 text-end tabular-nums text-rose-600 dark:text-rose-400">
                          − {formatKwdLabel(r.deductions)}
                        </td>
                        <td className="py-2 text-end font-semibold tabular-nums">
                          {formatKwdLabel(net)}
                        </td>
                        <td className="py-2 text-xs">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5',
                              r.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
                            )}
                          >
                            {t(
                              `payroll.status.${r.status}`,
                              r.status,
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MonthlySummaryPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [from, setFrom] = useState<string>(() => startOfMonthIso(new Date()));
  const [to, setTo] = useState<string>(() => endOfMonthIso(new Date()));
  const [data, setData] = useState<MonthlySummaryReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expensesSummary, setExpensesSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setDetailsLoading(true);
    const qs = new URLSearchParams({ from, to });
    try {
      const [summary, expensesResp, expSummaryResp, payrollResp] = await Promise.all([
        apiJson<MonthlySummaryReport>(
          `/api/reports/monthly-summary?${qs.toString()}`,
          { token },
        ),
        apiJson<ExpenseRow[]>(`${API_EXPENSES}?${qs.toString()}`, { token }),
        // V25 — server-computed expense totals; feeds ExpensesTab.totalApprovedKd.
        apiJson<ExpensesSummaryResponse>(
          `${API_EXPENSES_SUMMARY}?${qs.toString()}`,
          { token },
        ).catch(() => null),
        apiJson<PayrollRow[]>(`/api/payroll?${qs.toString()}`, { token }),
      ]);
      setData(summary);
      setExpenses(Array.isArray(expensesResp) ? expensesResp : []);
      setExpensesSummary(expSummaryResp ?? null);
      setPayroll(Array.isArray(payrollResp) ? payrollResp : []);
    } catch (e) {
      setData(null);
      setExpenses([]);
      setPayroll([]);
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error(
          t('monthlySummary.loadFailed', 'تعذر تحميل الملخص الشهري'),
        );
      }
    } finally {
      setLoading(false);
      setDetailsLoading(false);
    }
  }, [token, from, to, t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const openPrintWindow = useCallback(() => {
    const qs = new URLSearchParams({ from, to }).toString();
    // V19.13.1 — the dedicated print route mounts at AuthLayout level
    // (no ExecutiveShell), so the overflow container never traps the
    // printable body. We auto-invoke window.print() inside that page.
    const win = window.open(`/monthly-summary/print?${qs}`, '_blank');
    if (!win) {
      toast.error(
        t(
          'monthlySummary.printBlocked',
          'المتصفح منع فتح نافذة الطباعة — فعّل النوافذ المنبثقة لهذا الموقع.',
        ),
      );
    }
  }, [from, to, t]);

  // V19.29 — Comprehensive report: cover + TOC + explanations + per-branch
  // booklet (payroll, attendance, drivers & debts, manager) + call-center
  // collections + ledger/expenses/inventory appendix.
  const openFullPrintWindow = useCallback(() => {
    const qs = new URLSearchParams({ from, to }).toString();
    const win = window.open(
      `/monthly-summary/full-print?${qs}`,
      '_blank',
    );
    if (!win) {
      toast.error(
        t(
          'monthlySummary.printBlocked',
          'المتصفح منع فتح نافذة الطباعة — فعّل النوافذ المنبثقة لهذا الموقع.',
        ),
      );
    }
  }, [from, to, t]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('monthlySummary.title', 'الملخص الشهري')}
        subtitle={t(
          'monthlySummary.subtitle',
          'تقرير مالي شامل للفترة المختارة — الإجمالي أولاً ثم تقرير مستقل لكل فرع، مع تبويبات للمصروفات والرواتب.',
        )}
        tone="blue"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchAll()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="me-2 h-4 w-4" aria-hidden />
              )}
              {t('common.refresh', 'تحديث')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openPrintWindow}
              disabled={loading || !data}
            >
              <Printer className="me-2 h-4 w-4" aria-hidden />
              {t('monthlySummary.print', 'طباعة')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={openFullPrintWindow}
              disabled={loading || !data}
              title={t(
                'monthlySummary.fullPrintHint',
                'تقرير موسّع: غلاف + فهرس + شرح + كل فرع (حضور + رواتب + سواقين + ديون) + كول سنتر',
              )}
            >
              <Printer className="me-2 h-4 w-4" aria-hidden />
              {t('monthlySummary.fullPrint', 'طباعة موسّعة')}
            </Button>
          </div>
        }
      />

      <FilterBar>
        <FilterField label={t('financials.rangeFrom', 'من')}>
          <Input
            type="datetime-local"
            value={toLocalInputValue(from)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setFrom(iso);
            }}
          />
        </FilterField>
        <FilterField label={t('financials.rangeTo', 'إلى')}>
          <Input
            type="datetime-local"
            value={toLocalInputValue(to)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setTo(iso);
            }}
          />
        </FilterField>
        <FilterField label={t('monthlySummary.quickRange', 'فترات سريعة')}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setFrom(startOfMonthIso(now));
                setTo(endOfMonthIso(now));
              }}
            >
              {t('monthlySummary.thisMonth', 'هذا الشهر')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                const prev = new Date(
                  now.getFullYear(),
                  now.getMonth() - 1,
                  15,
                );
                setFrom(startOfMonthIso(prev));
                setTo(endOfMonthIso(prev));
              }}
            >
              {t('monthlySummary.lastMonth', 'الشهر الماضي')}
            </Button>
          </div>
        </FilterField>
      </FilterBar>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(String(v))}>
        <TabsList>
          <TabsTrigger value="overview">
            {t('monthlySummary.tabs.overview', 'نظرة عامة')}
          </TabsTrigger>
          <TabsTrigger value="expenses">
            {t('monthlySummary.tabs.expenses', 'المصروفات')}
          </TabsTrigger>
          <TabsTrigger value="payroll">
            {t('monthlySummary.tabs.payroll', 'الرواتب')}
          </TabsTrigger>
          <TabsTrigger value="ledger">
            {t('monthlySummary.tabs.ledger', 'سجل الحركات')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {loading && !data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </div>
          ) : !data ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('monthlySummary.empty', 'لا توجد بيانات للفترة المختارة.')}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              <SummaryCard
                title={t(
                  'monthlySummary.consolidatedTitle',
                  'الإجمالي — جميع الفروع',
                )}
                subtitle={t('monthlySummary.consolidatedBadge', 'الإجمالي')}
                row={data.consolidated}
                highlighted
              />

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <h2 className="text-base font-semibold text-foreground">
                  {t('monthlySummary.branchesHeading', 'تقارير الفروع')}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {data.branches.filter((b) => !b.isAdministrative).length}
                  <span className="mx-1 opacity-70">/</span>
                  {data.branches.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(
                    'monthlySummary.branchesCountHint',
                    'تشغيلي / إجمالي الصفوف (يشمل الإدارة إن وُجد)',
                  )}
                </span>
              </div>

              {data.branches.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    {t(
                      'monthlySummary.noBranches',
                      'لا توجد فروع مفعلة حالياً.',
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.branches.map((b) => (
                    <SummaryCard
                      key={b.branchId}
                      title={b.branchName}
                      subtitle={
                        b.isAdministrative ?
                          t(
                            'monthlySummary.branchAdminSubtitle',
                            'مركز تكلفة — إدارة',
                          )
                        : t('monthlySummary.branchBadge', 'فرع')}
                      row={b}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab
            rows={expenses}
            loading={detailsLoading}
            totalApprovedKd={expensesSummary?.totalApprovedKd}
          />
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          <PayrollTab rows={payroll} loading={detailsLoading} />
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <LedgerRollupTab rollup={data?.ledgerRollup} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
