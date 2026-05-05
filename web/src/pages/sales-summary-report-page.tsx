import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SalesDebtInsightsPanel } from '@/components/reports/sales-debt-insights-panel';
import { useAuth } from '@/contexts/auth-context';
import { type OrderRow, getInvoices } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import {
  buildSalesDebtAnalytics,
  resolveSalesDebtRange,
  type SalesDebtAnalytics,
  type SalesDebtGroupRow,
  type SalesDebtPeriodKind,
  type SalesDebtPeriodMode,
} from '@/lib/sales-debt-analytics';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

type ActiveTab = 'branch' | 'driver';

function csvEscape(value: string | number | null | undefined): string {
  const raw = String(value ?? '');
  return `"${raw.replaceAll('"', '""')}"`;
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCsv(analytics: SalesDebtAnalytics): string {
  const rows = [
    ['section', 'name', 'totalSales', 'totalCollected', 'totalDebt', 'invoiceCount'],
    [
      'totals',
      'TOTAL',
      analytics.totals.totalSales.toFixed(4),
      analytics.totals.totalCollected.toFixed(4),
      analytics.totals.totalDebt.toFixed(4),
      analytics.totals.invoiceCount,
    ],
    ...analytics.byBranch.map((row) => [
      'branch',
      row.name,
      row.totalSales.toFixed(4),
      row.totalCollected.toFixed(4),
      row.totalDebt.toFixed(4),
      row.invoiceCount,
    ]),
    ...analytics.byDriver.map((row) => [
      'driver',
      row.name,
      row.totalSales.toFixed(4),
      row.totalCollected.toFixed(4),
      row.totalDebt.toFixed(4),
      row.invoiceCount,
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function printPdf(analytics: SalesDebtAnalytics): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return;
  const branchRows = analytics.byBranch
    .map(
      (row) =>
        `<tr><td>${row.name}</td><td>${row.invoiceCount}</td><td>${formatKwdLabel(row.totalSales.toFixed(4))}</td><td>${formatKwdLabel(row.totalCollected.toFixed(4))}</td><td>${formatKwdLabel(row.totalDebt.toFixed(4))}</td></tr>`,
    )
    .join('');
  const driverRows = analytics.byDriver
    .map(
      (row) =>
        `<tr><td>${row.name}</td><td>${row.invoiceCount}</td><td>${formatKwdLabel(row.totalSales.toFixed(4))}</td><td>${formatKwdLabel(row.totalCollected.toFixed(4))}</td><td>${formatKwdLabel(row.totalDebt.toFixed(4))}</td></tr>`,
    )
    .join('');

  popup.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير المبيعات والتحصيل والمديونية</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          h2 { margin-top: 24px; font-size: 18px; }
          .muted { color: #6b7280; font-size: 12px; }
          .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
          .label { color: #6b7280; font-size: 12px; }
          .value { font-size: 20px; font-weight: 700; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: right; font-size: 12px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">طباعة / حفظ PDF</button>
        <h1>تقرير المبيعات والتحصيل والمديونية</h1>
        <p class="muted">من ${new Date(analytics.period.from).toLocaleDateString('ar-KW')} إلى ${new Date(analytics.period.to).toLocaleDateString('ar-KW')}</p>
        <div class="kpis">
          <div class="card"><div class="label">إجمالي المبيعات</div><div class="value">${formatKwdLabel(analytics.totals.totalSales.toFixed(4))}</div></div>
          <div class="card"><div class="label">إجمالي المحصل</div><div class="value">${formatKwdLabel(analytics.totals.totalCollected.toFixed(4))}</div></div>
          <div class="card"><div class="label">إجمالي المديونية</div><div class="value">${formatKwdLabel(analytics.totals.totalDebt.toFixed(4))}</div></div>
        </div>
        <h2>حسب الفرع</h2>
        <table><thead><tr><th>الاسم</th><th>الفواتير</th><th>المبيعات</th><th>المحصل</th><th>المديونية</th></tr></thead><tbody>${branchRows}</tbody></table>
        <h2>حسب السائق</h2>
        <table><thead><tr><th>الاسم</th><th>الفواتير</th><th>المبيعات</th><th>المحصل</th><th>المديونية</th></tr></thead><tbody>${driverRows}</tbody></table>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function GroupTable({ rows }: { rows: SalesDebtGroupRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات للفترة المحددة</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الاسم</TableHead>
          <TableHead>الفواتير</TableHead>
          <TableHead className="text-end">إجمالي المبيعات</TableHead>
          <TableHead className="text-end">إجمالي المحصل</TableHead>
          <TableHead className="text-end">إجمالي المديونية</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.invoiceCount}</TableCell>
            <TableCell className="text-end tabular-nums">
              {formatKwdLabel(row.totalSales.toFixed(4))}
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {formatKwdLabel(row.totalCollected.toFixed(4))}
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {formatKwdLabel(row.totalDebt.toFixed(4))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SalesSummaryReportPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodKind, setPeriodKind] = useState<SalesDebtPeriodKind>('weekly');
  const [periodMode, setPeriodMode] = useState<SalesDebtPeriodMode>('last7Days');
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    searchParams.get('tab') === 'driver' ? 'driver' : 'branch',
  );

  const range = useMemo(
    () => resolveSalesDebtRange(periodKind, periodMode),
    [periodKind, periodMode],
  );
  const analytics = useMemo(
    () =>
      buildSalesDebtAnalytics(orders, {
        kind: periodKind,
        mode: periodMode,
        range,
      }),
    [orders, periodKind, periodMode, range],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await getInvoices(token, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      setOrders(rows);
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTab = useCallback(
    (tab: ActiveTab) => {
      setActiveTab(tab);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('tab', tab);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const visibleRows = activeTab === 'branch' ? analytics.byBranch : analytics.byDriver;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            تقرير المبيعات والتحصيل والمديونية
          </h1>
          <p className="text-sm text-muted-foreground">
            من {range.from.toLocaleDateString('ar-KW')} إلى{' '}
            {range.to.toLocaleDateString('ar-KW')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            تحديث
          </Button>
          <Button type="button" size="sm" onClick={() => printPdf(analytics)} disabled={analytics.totals.invoiceCount === 0}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile('sales-summary-report.csv', buildCsv(analytics), 'text/csv;charset=utf-8')
            }
            disabled={analytics.totals.invoiceCount === 0}
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Select
            value={periodKind}
            onValueChange={(value) => {
              const next = value as SalesDebtPeriodKind;
              setPeriodKind(next);
              setPeriodMode(next === 'weekly' ? 'last7Days' : 'currentMonth');
            }}
          >
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">أسبوعي</SelectItem>
              <SelectItem value="monthly">شهري</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={periodMode}
            onValueChange={(value) => setPeriodMode(value as SalesDebtPeriodMode)}
          >
            <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {periodKind === 'weekly' ? (
                <>
                  <SelectItem value="last7Days">آخر 7 أيام</SelectItem>
                  <SelectItem value="calendarWeek">الأسبوع الحالي</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="currentMonth">الشهر الحالي</SelectItem>
                  <SelectItem value="previousMonth">الشهر السابق</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard label="إجمالي المبيعات" value={formatKwdLabel(analytics.totals.totalSales.toFixed(4))} />
        <KpiCard label="إجمالي المحصل" value={formatKwdLabel(analytics.totals.totalCollected.toFixed(4))} />
        <KpiCard label="إجمالي المديونية" value={formatKwdLabel(analytics.totals.totalDebt.toFixed(4))} />
      </div>

      <SalesDebtInsightsPanel
        analytics={analytics}
        onDrillDown={(target) => switchTab(target)}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">التفاصيل</CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'branch' ? 'default' : 'outline'}
                onClick={() => switchTab('branch')}
              >
                حسب الفرع
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'driver' ? 'default' : 'outline'}
                onClick={() => switchTab('driver')}
              >
                حسب السائق
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <GroupTable rows={visibleRows} />
        </CardContent>
      </Card>
    </div>
  );
}
