import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import type { ExpenseRow } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import {
  buildWeeklyReport,
  type WeeklyExpenseReport,
} from '@/lib/weekly-expense-report';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent } from '@/modules/shared/components/ui/card';

const LAST_REPORT_KEY = 'expenses-weekly-report-last-generated-at';

type WeeklyExpenseReportActionsProps = {
  rows: ExpenseRow[];
};

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

function buildCsv(report: WeeklyExpenseReport): string {
  const summaryRows = [
    ['section', 'metric', 'value'],
    ['summary', 'total', report.analytics.total.toFixed(4)],
    ['summary', 'car', report.analytics.carTotal.toFixed(4)],
    ['summary', 'other', report.analytics.otherTotal.toFixed(4)],
    ['summary', 'carPercent', report.analytics.percentage.toFixed(2)],
    [],
    ['id', 'date', 'title', 'category', 'status', 'branch', 'recordedBy', 'amount'],
  ];
  const rowLines = report.rows.map((row) => [
    row.id,
    row.expenseDate,
    row.title,
    row.category,
    row.status,
    row.branch?.name ?? '',
    row.recordedBy.fullName || row.recordedBy.username,
    row.amount,
  ]);

  return [...summaryRows, ...rowLines]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
}

function printPdf(report: WeeklyExpenseReport): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return;

  const insights = report.insights.length
    ? report.insights.map((insight) => `<li>${insight.message}</li>`).join('')
    : '<li>لا توجد بيانات كافية للتحليل</li>';
  const branchRows = report.analytics.byBranch
    .map(
      (row) =>
        `<tr><td>${row.label}</td><td>${row.count}</td><td>${formatKwdLabel(row.amount.toFixed(4))}</td></tr>`,
    )
    .join('');
  const typeRows = report.analytics.byType
    .map(
      (row) =>
        `<tr><td>${row.label}</td><td>${row.count}</td><td>${formatKwdLabel(row.amount.toFixed(4))}</td></tr>`,
    )
    .join('');

  popup.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${report.title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          h2 { margin-top: 24px; font-size: 18px; }
          .muted { color: #6b7280; font-size: 12px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
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
        <h1>${report.title}</h1>
        <p class="muted">من ${new Date(report.range.from).toLocaleDateString('ar-KW')} إلى ${new Date(report.range.to).toLocaleDateString('ar-KW')}</p>
        <div class="kpis">
          <div class="card"><div class="label">إجمالي المصروفات</div><div class="value">${formatKwdLabel(report.analytics.total.toFixed(4))}</div></div>
          <div class="card"><div class="label">مصروفات السيارات</div><div class="value">${formatKwdLabel(report.analytics.carTotal.toFixed(4))}</div></div>
          <div class="card"><div class="label">مصروفات أخرى</div><div class="value">${formatKwdLabel(report.analytics.otherTotal.toFixed(4))}</div></div>
          <div class="card"><div class="label">نسبة السيارات</div><div class="value">${report.analytics.percentage.toFixed(1)}%</div></div>
        </div>
        <h2>الرؤى</h2>
        <ul>${insights}</ul>
        <h2>حسب الفرع</h2>
        <table><thead><tr><th>الفرع</th><th>العدد</th><th>المبلغ</th></tr></thead><tbody>${branchRows}</tbody></table>
        <h2>حسب النوع</h2>
        <table><thead><tr><th>النوع</th><th>العدد</th><th>المبلغ</th></tr></thead><tbody>${typeRows}</tbody></table>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
}

export function WeeklyExpenseReportActions({
  rows,
}: WeeklyExpenseReportActionsProps) {
  const [loading, setLoading] = useState<'pdf' | 'csv' | 'regenerate' | null>(null);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_REPORT_KEY);
    } catch {
      return null;
    }
  });
  const report = useMemo(() => buildWeeklyReport(rows), [rows]);
  const hasData = report.rows.length > 0;

  function markGenerated(): void {
    const now = new Date().toISOString();
    setLastGeneratedAt(now);
    try {
      localStorage.setItem(LAST_REPORT_KEY, now);
    } catch {
      /* ignore */
    }
  }

  function exportPdf(): void {
    if (!hasData) return;
    setLoading('pdf');
    printPdf(report);
    markGenerated();
    setLoading(null);
  }

  function exportCsv(): void {
    if (!hasData) return;
    setLoading('csv');
    downloadFile(
      'weekly-expenses-report.csv',
      buildCsv(report),
      'text/csv;charset=utf-8',
    );
    markGenerated();
    setLoading(null);
  }

  function regenerate(): void {
    setLoading('regenerate');
    markGenerated();
    setLoading(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">التقرير الأسبوعي للمصروفات</p>
          <p className="text-xs text-muted-foreground">
            {hasData
              ? `آخر تقرير: ${
                  lastGeneratedAt
                    ? new Date(lastGeneratedAt).toLocaleString('ar-KW')
                    : 'لم يتم توليده بعد'
                }`
              : 'لا توجد بيانات لهذا الأسبوع'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={regenerate}
            disabled={!hasData || loading !== null}
          >
            {loading === 'regenerate' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            إعادة التوليد
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={exportPdf}
            disabled={!hasData || loading !== null}
          >
            {loading === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            تحميل التقرير الأسبوعي
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={!hasData || loading !== null}
          >
            {loading === 'csv' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
