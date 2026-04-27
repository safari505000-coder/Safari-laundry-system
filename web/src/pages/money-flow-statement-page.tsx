import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  apiJson,
  ApiError,
  type MoneyFlowStatementReport,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { cn } from '@/lib/utils';

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

type LedgerNs = 'glType' | 'journalType' | 'debtSource';

function LedgerBlock({
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
            {t('moneyFlow.ledgerEmpty', 'لا توجد حركات.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-start text-muted-foreground">
                  <th className="px-4 py-2 font-medium">
                    {t('moneyFlow.colKind', 'البند')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('moneyFlow.colMovements', 'الحركات')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('moneyFlow.colTotal', 'المجموع')}
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

function AmountTable({
  title,
  rows,
  amountMode,
}: {
  title?: string;
  rows: Array<{ key: string; label: string; count?: number; amountKd: string }>;
  amountMode: 'signed' | 'absolute';
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      {title ?
        <CardHeader className="py-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      : null}
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            {t('moneyFlow.emptySection', 'لا بيانات في هذه الفترة.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-start text-muted-foreground">
                  <th className="px-4 py-2 font-medium">
                    {t('moneyFlow.colKind', 'البند')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('moneyFlow.colMovements', 'الحركات')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium tabular-nums">
                    {t('moneyFlow.colTotal', 'المبلغ')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60">
                    <td className="px-4 py-2 text-foreground">{r.label}</td>
                    <td className="px-4 py-2 text-end tabular-nums text-muted-foreground">
                      {r.count !== undefined ? r.count : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-end text-sm font-semibold tabular-nums',
                        amountMode === 'absolute' && 'text-foreground',
                      )}
                      dir="ltr"
                    >
                      {amountMode === 'signed' ?
                        formatSignedKwdLabel(r.amountKd)
                      : formatKwdLabel(r.amountKd)}
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

export function MoneyFlowStatementPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [from, setFrom] = useState<string>(() => startOfMonthIso(new Date()));
  const [to, setTo] = useState<string>(() => endOfMonthIso(new Date()));
  const [data, setData] = useState<MoneyFlowStatementReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const res = await apiJson<MoneyFlowStatementReport>(
        `/api/reports/money-flow-statement?${qs}`,
        { token },
      );
      setData(res);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error(t('moneyFlow.loadFailed', 'تعذر تحميل بيانات التدفق المالي.'));
      }
    } finally {
      setLoading(false);
    }
  }, [token, from, to, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const inflowRows = useMemo(() => {
    if (!data) return [];
    const ex = data.executive;
    const lr = data.ledgerRollup;
    const rows: Array<{
      key: string;
      label: string;
      count?: number;
      amountKd: string;
    }> = [
      {
        key: 'gross',
        label: t('moneyFlow.in.grossCompleted', 'إيراد مبيعات مكتملة (الفترة)'),
        amountKd: ex.grossRevenueKd,
      },
      {
        key: 'settledAfterFees',
        label: t(
          'moneyFlow.in.settledAfterFees',
          'إيراد بعد رسوم البنوك (تقريبي)',
        ),
        amountKd: ex.settledRevenueAfterBankFeesKd,
      },
      {
        key: 'collected',
        label: t(
          'moneyFlow.in.collectedSlice',
          'المحصّل من تلك المبيعات (طرق الدفع)',
        ),
        amountKd: data.collections.collectedRevenueKd,
      },
      {
        key: 'uncollected',
        label: t(
          'moneyFlow.in.uncollectedSlice',
          'مبيعات مكتملة — لم تُقبض بعد (ذمم فواتير جديدة)',
        ),
        amountKd: data.collections.uncollectedRevenueKd,
      },
      {
        key: 'debtPrior',
        label: t(
          'moneyFlow.in.debtPrior',
          'تحصيل ذمم فواتير صدرت قبل الفترة',
        ),
        amountKd: data.debtPaymentsPriorInvoiceKd,
      },
    ];
    for (const j of lr.walletJournal) {
      rows.push({
        key: `wj-${j.type}`,
        label: t(`monthlySummary.journalType.${j.type}`, j.type),
        count: j.movementCount,
        amountKd: j.totalKd,
      });
    }
    for (const d of lr.debtLedger) {
      if (d.source === 'PAYMENT') {
        rows.push({
          key: `debt-${d.source}`,
          label: t(`monthlySummary.debtSource.${d.source}`, d.source),
          count: d.movementCount,
          amountKd: d.totalKd,
        });
      }
    }
    return rows;
  }, [data, t]);

  const deductionRows = useMemo(() => {
    if (!data) return [];
    const ex = data.executive;
    const lr = data.ledgerRollup;
    const rows: Array<{
      key: string;
      label: string;
      count?: number;
      amountKd: string;
    }> = [
      {
        key: 'bankFees',
        label: t('moneyFlow.ded.bankFees', 'رسوم بنك وتوجيه (تقريبية)'),
        amountKd: ex.bankFeesTotalKd,
      },
      {
        key: 'subsidy',
        label: t('moneyFlow.ded.subsidy', 'دعم الاشتراكات (خصم المجموعة)'),
        amountKd: ex.subscriptionSubsidyKd,
      },
    ];
    for (const g of lr.generalLedger) {
      if (g.entryType === 'DEBT_ADJUSTMENT') {
        rows.push({
          key: `gl-${g.entryType}`,
          label: t(`monthlySummary.glType.${g.entryType}`, g.entryType),
          count: g.movementCount,
          amountKd: g.totalKd,
        });
      }
    }
    for (const d of lr.debtLedger) {
      if (d.source === 'INVOICE_SHORTFALL' || d.source === 'SUBSCRIPTION_OVERUSE') {
        rows.push({
          key: `debt-${d.source}`,
          label: t(`monthlySummary.debtSource.${d.source}`, d.source),
          count: d.movementCount,
          amountKd: d.totalKd,
        });
      }
    }
    return rows;
  }, [data, t]);

  const outflowRows = useMemo(() => {
    if (!data) return [];
    const ex = data.executive;
    const rows: Array<{
      key: string;
      label: string;
      count?: number;
      amountKd: string;
    }> = [
      {
        key: 'payroll',
        label: t('moneyFlow.out.payroll', 'رواتب مدفوعة (صافي المسير)'),
        amountKd: ex.payrollPaidKd,
      },
      {
        key: 'fixedTotal',
        label: t('moneyFlow.out.fixedTotal', 'مصاريف ثابتة (استحقاق شهري في الفترة)'),
        amountKd: ex.fixedExpensesKd,
      },
      {
        key: 'soapFuel',
        label: t('moneyFlow.out.soapFuel', 'صابون ووقود (مصروفات ميدانية معتمدة)'),
        amountKd: ex.variableSoapFuelKd,
      },
      {
        key: 'misc',
        label: t('moneyFlow.out.misc', 'متفرقات تشغيلية (معتمدة)'),
        amountKd: ex.miscOperationalKd,
      },
    ];
    for (const g of data.ledgerRollup.generalLedger) {
      if (g.entryType === 'EXPENSE_RECORDED') {
        rows.push({
          key: `gl-${g.entryType}`,
          label: t(`monthlySummary.glType.${g.entryType}`, g.entryType),
          count: g.movementCount,
          amountKd: g.totalKd,
        });
      }
    }
    return rows;
  }, [data, t]);

  const branchExpenseRows = useMemo(() => {
    if (!data) return [];
    return data.branchExpensesByCategory.map((r) => ({
      key: `be-${r.category}`,
      label: t(`expenseApproval.category.${r.category}`, r.category),
      count: r.movementCount,
      amountKd: r.totalKd,
    }));
  }, [data, t]);

  const vehicleRows = useMemo(() => {
    if (!data) return [];
    return data.vehicleExpensesByType.map((r) => ({
      key: `ve-${r.expenseType}`,
      label: t(`vehicleExpenses.typeLabel.${r.expenseType}`, r.expenseType),
      count: r.movementCount,
      amountKd: r.totalKd,
    }));
  }, [data, t]);

  const fixedRows = useMemo(() => {
    if (!data) return [];
    return data.fixedExpensesByCategory.map((r) => ({
      key: `fx-${r.category}`,
      label: t(`fixedExpenses.cat.${r.category}`, r.category),
      amountKd: r.totalKd,
    }));
  }, [data, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('moneyFlow.title', 'تقرير الوارد والصادر')}
        subtitle={t(
          'moneyFlow.subtitle',
          'كل مصادر الدخل والخصومات والمصروفات المعتمدة في الفترة، مع تفصيل الدفاتر للمراجعة.',
        )}
        tone="blue"
      />

      <FilterBar>
        <FilterField label={t('moneyFlow.from', 'من')}>
          <Input
            type="datetime-local"
            value={toLocalInputValue(from)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setFrom(iso);
            }}
            className="w-full max-w-[220px]"
          />
        </FilterField>
        <FilterField label={t('moneyFlow.to', 'إلى')}>
          <Input
            type="datetime-local"
            value={toLocalInputValue(to)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setTo(iso);
            }}
            className="w-full max-w-[220px]"
          />
        </FilterField>
        <div className="flex flex-wrap items-end gap-2">
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
            {t('moneyFlow.thisMonth', 'هذا الشهر')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void fetchData()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
            {t('moneyFlow.run', 'تشغيل')}
          </Button>
        </div>
      </FilterBar>

      {loading && !data ?
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      : !data ?
        null
      : (
        <Tabs defaultValue="inflows" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="border-border/80 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('moneyFlow.kpiGross', 'الإجمالي')}
              </p>
              <p
                className="mt-1 text-2xl font-bold tabular-nums text-foreground"
                dir="ltr"
              >
                {formatKwdLabel(data.executive.grossRevenueKd)}
              </p>
            </Card>
            <Card className="border-border/80 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('moneyFlow.kpiCollected', 'المدفوع')}
              </p>
              <p
                className="mt-1 text-2xl font-bold tabular-nums text-foreground"
                dir="ltr"
              >
                {formatKwdLabel(data.collections.collectedRevenueKd)}
              </p>
            </Card>
            <Card className="border-border/80 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('moneyFlow.kpiUncollected', 'المتبقي')}
              </p>
              <p
                className="mt-1 text-2xl font-bold tabular-nums text-foreground"
                dir="ltr"
              >
                {formatKwdLabel(data.collections.uncollectedRevenueKd)}
              </p>
            </Card>
          </div>
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="inflows">
              {t('moneyFlow.tabInflows', 'وارد')}
            </TabsTrigger>
            <TabsTrigger value="deductions">
              {t('moneyFlow.tabDeductions', 'خصومات وذمم')}
            </TabsTrigger>
            <TabsTrigger value="outflows">
              {t('moneyFlow.tabOutflows', 'صادر ومصروفات')}
            </TabsTrigger>
            <TabsTrigger value="ledgers">
              {t('moneyFlow.tabLedgers', 'تفصيل الدفاتر')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inflows" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'moneyFlow.inIntro',
                'إيراد المبيعات المكتملة في الفترة، التحصيل، وحركات الدفتر ذات الصلة. بعض الأسطر تتداخل منطقياً مع تقارير أخرى — استخدم هذا كمرجع تدقيق.',
              )}
            </p>
            <AmountTable rows={inflowRows} amountMode="absolute" />
          </TabsContent>

          <TabsContent value="deductions" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'moneyFlow.dedIntro',
                'رسوم البنوك، دعم الاشتراكات، وتكوين الذمم (عجز فاتورة / تجاوز اشتراك) ضمن الفترة.',
              )}
            </p>
            <AmountTable rows={deductionRows} amountMode="absolute" />
          </TabsContent>

          <TabsContent value="outflows" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'moneyFlow.outIntro',
                'رواتب، ثابت، ومتغير من تقرير الربحية؛ وتفصيل مصروفات الفروع (معتمدة)، والسيارات (معتمدة)، والثابت حسب الفئة.',
              )}
            </p>
            <AmountTable rows={outflowRows} amountMode="absolute" />
            <AmountTable
              title={t('moneyFlow.out.branchTitle', 'مصروفات الفروع (معتمدة)')}
              rows={branchExpenseRows}
              amountMode="absolute"
            />
            <AmountTable
              title={t('moneyFlow.out.vehicleTitle', 'مصروفات السيارات (معتمدة)')}
              rows={vehicleRows}
              amountMode="absolute"
            />
            <AmountTable
              title={t('moneyFlow.out.fixedByCat', 'مصاريف ثابتة حسب الفئة (استحقاق)')}
              rows={fixedRows.map((r) => ({ ...r, count: undefined }))}
              amountMode="absolute"
            />
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">
                  {t('moneyFlow.out.netProfit', 'صافي الربح (بعد الخصومات التنفيذية)')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className="text-2xl font-semibold tabular-nums text-foreground"
                  dir="ltr"
                >
                  {formatSignedKwdLabel(data.executive.netProfitKd)}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ledgers" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                'moneyFlow.ledgerIntro',
                'مجاميع أنواع القيود في الدفتر الموحّد، سجل المحفظة، ودفتر الذمم — المبالغ موقعة كما في النظام.',
              )}
            </p>
            <LedgerBlock
              title={t('moneyFlow.ledgerGl', 'الدفتر الموحّد')}
              ns="glType"
              rows={data.ledgerRollup.generalLedger.map((g) => ({
                code: g.entryType,
                totalKd: g.totalKd,
                movementCount: g.movementCount,
              }))}
            />
            <LedgerBlock
              title={t('moneyFlow.ledgerJournal', 'سجل المحفظة')}
              ns="journalType"
              rows={data.ledgerRollup.walletJournal.map((g) => ({
                code: g.type,
                totalKd: g.totalKd,
                movementCount: g.movementCount,
              }))}
            />
            <LedgerBlock
              title={t('moneyFlow.ledgerDebt', 'دفتر الذمم')}
              ns="debtSource"
              rows={data.ledgerRollup.debtLedger.map((g) => ({
                code: g.source,
                totalKd: g.totalKd,
                movementCount: g.movementCount,
              }))}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
