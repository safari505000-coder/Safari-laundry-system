import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  apiJson,
  ApiError,
  API_EXPENSES,
  type ExpenseRow,
  type MonthlySummaryReport,
  type PayrollRow,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import './monthly-summary-print.css';

/**
 * V19.13.1 — Monthly Summary printable sheet.
 *
 * Rendered for the "طباعة" button on `/monthly-summary`. Lives at
 * AuthLayout level (no ExecutiveShell) on purpose: the shell's
 * overflow-y-auto wrapper is the reason the previous print button
 * produced blank pages.
 *
 * V19.13.2 — the page is intentionally "pure" HTML tables (no
 * SummaryCard / no Lucide icons per row / no tailwind Card wrappers)
 * so the browser's print preview draws instantly instead of
 * spinning while it lays out hundreds of icon <svg>s. Auto-print
 * waits on `document.fonts.ready` + one animation frame so the
 * preview is never triggered before layout is settled.
 */
type BranchRow = MonthlySummaryReport['branches'][number];

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

function formatArabicDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Compact P&L table reused for consolidated + every branch. */
function PnlTable({ row }: { row: RowFormula }) {
  const { t } = useTranslation();
  const lines: Array<{
    label: string;
    value: string;
    negative?: boolean;
    isTotal?: boolean;
  }> = [
    {
      label: t('monthlySummary.lineGross', 'إجمالي الإيرادات'),
      value: formatKwdLabel(row.grossRevenueKd),
    },
    {
      label: t('monthlySummary.lineBank', 'رسوم بنكية (KNET/بطاقات)'),
      value: formatKwdLabel(row.bankFeesTotalKd),
      negative: true,
    },
    {
      label: t('monthlySummary.lineVariable', 'مصروفات متغيرة'),
      value: formatKwdLabel(row.variableSoapFuelKd),
      negative: true,
    },
    {
      label: t('monthlySummary.lineMisc', 'مصروفات متنوعة'),
      value: formatKwdLabel(row.miscOperationalKd),
      negative: true,
    },
    {
      label: t('monthlySummary.lineFixed', 'مصروفات ثابتة'),
      value: formatKwdLabel(row.fixedExpensesKd),
      negative: true,
    },
    {
      label: t('monthlySummary.linePayroll', 'رواتب مدفوعة'),
      value: formatKwdLabel(row.payrollPaidKd),
      negative: true,
    },
    {
      label: t('monthlySummary.lineSubsidy', 'دعم الاشتراكات'),
      value: formatKwdLabel(row.subscriptionSubsidyKd),
      negative: true,
    },
  ];
  return (
    <table className="msp-table">
      <tbody>
        {lines.map((l) => (
          <tr key={l.label}>
            <td className="msp-table__label">{l.label}</td>
            <td
              className={`msp-table__value${l.negative ? ' is-neg' : ''}`}
            >
              {l.negative ? '− ' : ''}
              {l.value}
            </td>
          </tr>
        ))}
        <tr className="msp-table__net">
          <td className="msp-table__label">
            {t('monthlySummary.netProfit', 'صافي الربح')}
          </td>
          <td className="msp-table__value">
            {formatKwdLabel(row.netProfitKd)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * V19.14 — Collections snapshot strip (collected / uncollected /
 * outstanding debt). Kept as a plain table so the print layout stays
 * consistent with the P&L block above; toned cells are driven by
 * simple CSS classes handled in monthly-summary-print.css.
 */
function CollectionsTable({ row }: { row: RowFormula }) {
  const { t } = useTranslation();
  return (
    <table className="msp-table msp-table--collections">
      <tbody>
        <tr>
          <td className="msp-table__label">
            {t('monthlySummary.lineCollected', 'المحصّل من فواتير هذا الشهر')}
          </td>
          <td className="msp-table__value is-pos">
            {formatKwdLabel(row.collectedRevenueKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            {t(
              'monthlySummary.lineDebtPayments',
              'تحصيل ديون على فواتير اكتملت قبل بداية الفترة (سُدّت خلال الفترة)',
            )}
          </td>
          <td className="msp-table__value is-sky">
            {formatKwdLabel(row.debtPaymentsReceivedKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            {t(
              'monthlySummary.lineUncollected',
              'غير المحصّل — فواتير الفترة فقط (مكتملة وما زالت على الدين)',
            )}
          </td>
          <td className="msp-table__value is-warn">
            {formatKwdLabel(row.uncollectedRevenueKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            {t(
              'monthlySummary.lineOutstandingInvoiceDebt',
              'متبقي ديون الفواتير (كل الفترات)',
            )}
          </td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingInvoiceDebtKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            {t(
              'monthlySummary.lineOutstandingSubscriptionDebt',
              'متبقي ديون الاشتراك / الزيادة (كل الفترات)',
            )}
          </td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingSubscriptionDebtKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            {t(
              'monthlySummary.lineOutstandingDebt',
              'إجمالي المديونية المتبقية (مجموع الفرعين)',
            )}
          </td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingDebtKd)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function MonthlySummaryPrintPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [search] = useSearchParams();
  const from = search.get('from')?.trim() || '';
  const to = search.get('to')?.trim() || '';

  const [summary, setSummary] = useState<MonthlySummaryReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const autoPrintedRef = useRef(false);

  const load = useCallback(async () => {
    if (!token || !from || !to) return;
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [s, e, p] = await Promise.all([
        apiJson<MonthlySummaryReport>(
          `/api/reports/monthly-summary?${qs}`,
          { token },
        ),
        apiJson<ExpenseRow[]>(`${API_EXPENSES}?${qs}`, { token }),
        apiJson<PayrollRow[]>(`/api/payroll?${qs}`, { token }),
      ]);
      setSummary(s);
      setExpenses(Array.isArray(e) ? e : []);
      setPayroll(Array.isArray(p) ? p : []);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(
          t('monthlySummary.loadFailed', 'تعذر تحميل الملخص الشهري'),
        );
      }
    }
  }, [token, from, to, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * V19.13.3 — force light mode on the print window, durably.
   *
   * `ThemeProvider` at the app root keeps reapplying
   * `<html class="dark">` via its own `useEffect` every time it
   * re-runs. React fires child effects BEFORE parent effects, so
   * a one-shot `classList.remove('dark')` here loses the race:
   * ThemeProvider re-adds it right after. We install a
   * MutationObserver that watches `<html>` and immediately strips
   * `dark` / dark-theme inline styles whenever they reappear, so
   * the print sheet is guaranteed to render with light text on
   * white paper no matter what the app theme is.
   */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const hadDark = html.classList.contains('dark');

    const force = () => {
      if (html.classList.contains('dark')) html.classList.remove('dark');
      if (body.classList.contains('dark')) body.classList.remove('dark');
      html.style.colorScheme = 'light';
      html.setAttribute('data-print-mode', 'light');
      html.setAttribute('data-theme', 'light');
    };

    force();

    const observer = new MutationObserver(() => {
      // Don't loop — only re-force when something else tried to
      // flip us back to dark.
      if (
        html.classList.contains('dark') ||
        html.getAttribute('data-theme') === 'dark' ||
        html.style.colorScheme !== 'light'
      ) {
        force();
      }
    });

    observer.observe(html, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    observer.observe(body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      html.removeAttribute('data-print-mode');
      html.style.colorScheme = '';
      if (hadDark) html.classList.add('dark');
    };
  }, []);

  // Auto-print: only after data is loaded AND fonts are ready AND
  // the browser has had a paint cycle. Without this guard, the
  // preview opens before layout is settled and Edge/Chrome just
  // show a spinner while they re-paint in the background.
  useEffect(() => {
    if (!summary || autoPrintedRef.current) return;
    autoPrintedRef.current = true;

    const trigger = () => {
      setReady(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            window.print();
          } catch {
            /* ignore — the "طباعة الآن" button is the fallback. */
          }
        });
      });
    };

    const fontsPromise: Promise<unknown> = (document as Document & {
      fonts?: { ready?: Promise<unknown> };
    }).fonts?.ready ?? Promise.resolve();

    fontsPromise.then(trigger).catch(trigger);
  }, [summary]);

  const generatedAt = useMemo(() => new Date(), []);
  const brandName = 'Safari Laundry';

  const expensesApprovedTotal = useMemo(() => {
    let sum = 0;
    for (const r of expenses) {
      if (r.status === 'APPROVED') sum += Number.parseFloat(r.amount || '0');
    }
    return sum.toFixed(4);
  }, [expenses]);

  const payrollPaidTotal = useMemo(() => {
    let sum = 0;
    for (const r of payroll) {
      if (r.status !== 'PAID') continue;
      const b = Number.parseFloat(r.basicSalary || '0');
      const a = Number.parseFloat(r.allowances || '0');
      const d = Number.parseFloat(r.deductions || '0');
      sum += b + a - d;
    }
    return sum.toFixed(4);
  }, [payroll]);

  if (error) {
    return (
      <div className="msp-message msp-message--error">
        <h1>{t('monthlySummary.title', 'الملخص الشهري')}</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="msp-message">
        <h1>{t('monthlySummary.title', 'الملخص الشهري')}</h1>
        <p>{t('monthlySummary.printLoading', 'جاري تحضير الملف للطباعة...')}</p>
      </div>
    );
  }

  const c = summary.consolidated;

  const inv = summary.inventoryConsumption?.branches ?? [];

  return (
    <div className="monthly-summary-print">
      <div className="monthly-summary-print__toolbar no-print">
        <div className="msp-toolbar__hint">
          {ready
            ? t(
                'monthlySummary.printReady',
                'تم تحضير التقرير — إذا لم تفتح نافذة الطباعة تلقائياً اضغط الزر.',
              )
            : t(
                'monthlySummary.printPreparing',
                'جاري التحضير...',
              )}
        </div>
        <button
          type="button"
          className="msp-toolbar__btn"
          onClick={() => window.print()}
        >
          <Printer size={14} />
          <span>{t('monthlySummary.print', 'طباعة')}</span>
        </button>
      </div>

      <div className="monthly-summary-print__sheet">
        {/* صفحة 1 — ملخص الفترة (إجمالي المجموعة + التحصيل فقط) */}
        <div className="msp-cover">
          <header className="monthly-summary-print__header">
            <div>
              <div className="monthly-summary-print__brand">{brandName}</div>
              <h1 className="monthly-summary-print__title">
                {t('monthlySummary.title', 'الملخص الشهري')}
              </h1>
              <p className="monthly-summary-print__range">
                {t('monthlySummary.rangeLabel', 'الفترة')}:{' '}
                <span dir="ltr">
                  {formatArabicDate(from)} → {formatArabicDate(to)}
                </span>
              </p>
              <p className="msp-cover__hint">
                {t(
                  'monthlySummary.printDetailsFollow',
                  'التقارير التفصيلية والجداول الطويلة تبدأ من الصفحة التالية.',
                )}
              </p>
            </div>
            <div className="monthly-summary-print__meta">
              <div className="monthly-summary-print__metric">
                <span className="monthly-summary-print__metric-label">
                  {t('monthlySummary.lineGross', 'إجمالي الإيرادات')}
                </span>
                <span className="monthly-summary-print__metric-value">
                  {formatKwdLabel(c.grossRevenueKd)}
                </span>
              </div>
              <div className="monthly-summary-print__metric">
                <span className="monthly-summary-print__metric-label">
                  {t('monthlySummary.netProfit', 'صافي الربح')}
                </span>
                <span className="monthly-summary-print__metric-value">
                  {formatKwdLabel(c.netProfitKd)}
                </span>
              </div>
              <div className="monthly-summary-print__generated">
                {t('monthlySummary.generatedAt', 'تم التوليد')}:{' '}
                {generatedAt.toLocaleString('en-GB')}
              </div>
            </div>
          </header>

          <section className="monthly-summary-print__section msp-section--cover-only">
            <h2 className="monthly-summary-print__section-title">
              {t('monthlySummary.periodSummaryTitle', 'ملخص الفترة — الإجمالي')}
            </h2>
            <p className="msp-section__intro">
              {t(
                'monthlySummary.periodSummaryIntro',
                'أداء المجموعة خلال الفترة: الأرباح والمصروفات وملخص التحصيل.',
              )}
            </p>
            <PnlTable row={c} />
            <h3 className="monthly-summary-print__subheading">
              {t('monthlySummary.collectionsHeading', 'ملخّص التحصيل')}
            </h3>
            <CollectionsTable row={c} />
          </section>

          <footer className="monthly-summary-print__footer msp-cover__footer">
            <span>
              {t(
                'monthlySummary.printFooter',
                'تقرير تم توليده آلياً من نظام سفاري للمحاسبة — للاستخدام الداخلي.',
              )}
            </span>
          </footer>
        </div>

        {/* الملحق — تفاصيل حسب الفرع ثم مصروفات ورواتب ومخزون */}
        <div className="msp-appendix">
          <div className="msp-runhead">
            <div className="msp-runhead__brand">{brandName}</div>
            <div className="msp-runhead__title">
              {t('monthlySummary.detailedReportsTitle', 'التقارير التفصيلية')}
            </div>
            <div className="msp-runhead__range" dir="ltr">
              {formatArabicDate(from)} → {formatArabicDate(to)}
            </div>
          </div>

          {summary.branches.length > 0 ? (
            <section className="monthly-summary-print__section msp-section--flow">
              <h2 className="monthly-summary-print__section-title">
                {t('monthlySummary.branchesHeading', 'تقارير الفروع')}
              </h2>
              <p className="msp-section__intro">
                {t(
                  'monthlySummary.branchesPrintIntro',
                  'تفصيل الأرباح والتحصيل لكل فرع — نفس بنية ملخص الفترة أعلاه.',
                )}
              </p>
              <div className="monthly-summary-print__branches">
                {summary.branches.map((b) => (
                  <div
                    key={b.branchId}
                    className="monthly-summary-print__branch-card"
                  >
                    <h3 className="monthly-summary-print__branch-title">
                      {b.branchName}
                    </h3>
                    <PnlTable row={b} />
                    <CollectionsTable row={b} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

        <section className="monthly-summary-print__section msp-section--flow">
          <h2 className="monthly-summary-print__section-title">
            {t('monthlySummary.tabs.expenses', 'المصروفات')}{' '}
            <span className="monthly-summary-print__chip">
              {t('monthlySummary.expensesTotalApproved', 'الإجمالي المعتمد')}
              {': '}
              {formatKwdLabel(expensesApprovedTotal)}
            </span>
          </h2>
          {expenses.length === 0 ? (
            <p className="msp-empty">
              {t('monthlySummary.noExpenses', 'لا توجد مصروفات مسجلة للفترة.')}
            </p>
          ) : (
            <table className="msp-list">
              <thead>
                <tr>
                  <th>{t('monthlySummary.col.date', 'التاريخ')}</th>
                  <th>{t('monthlySummary.col.branch', 'الفرع')}</th>
                  <th>{t('monthlySummary.col.title', 'البيان')}</th>
                  <th>{t('monthlySummary.col.category', 'الفئة')}</th>
                  <th>{t('monthlySummary.col.status', 'الحالة')}</th>
                  <th className="num">
                    {t('monthlySummary.col.amount', 'المبلغ')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((r) => (
                  <tr key={r.id}>
                    <td>{formatShortDate(r.expenseDate)}</td>
                    <td>{r.branch?.name ?? '—'}</td>
                    <td>{r.title}</td>
                    <td>
                      {t(`expenses.categories.${r.category}`, r.category)}
                    </td>
                    <td>{t(`expenses.status.${r.status}`, r.status)}</td>
                    <td className="num">{formatKwdLabel(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="monthly-summary-print__section msp-section--flow">
          <h2 className="monthly-summary-print__section-title">
            {t('monthlySummary.tabs.payroll', 'الرواتب')}{' '}
            <span className="monthly-summary-print__chip">
              {t('monthlySummary.payrollTotalPaid', 'الإجمالي المدفوع')}
              {': '}
              {formatKwdLabel(payrollPaidTotal)}
            </span>
          </h2>
          {payroll.length === 0 ? (
            <p className="msp-empty">
              {t('monthlySummary.noPayroll', 'لا توجد رواتب مسجلة للفترة.')}
            </p>
          ) : (
            <table className="msp-list">
              <thead>
                <tr>
                  <th>{t('monthlySummary.col.date', 'التاريخ')}</th>
                  <th>{t('monthlySummary.col.employee', 'الموظف')}</th>
                  <th>{t('monthlySummary.col.branch', 'الفرع')}</th>
                  <th className="num">
                    {t('monthlySummary.col.basic', 'أساسي')}
                  </th>
                  <th className="num">
                    {t('monthlySummary.col.allowances', 'بدلات')}
                  </th>
                  <th className="num">
                    {t('monthlySummary.col.deductions', 'خصومات')}
                  </th>
                  <th className="num">
                    {t('monthlySummary.col.net', 'الصافي')}
                  </th>
                  <th>{t('monthlySummary.col.status', 'الحالة')}</th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((r) => {
                  const b = Number.parseFloat(r.basicSalary || '0');
                  const a = Number.parseFloat(r.allowances || '0');
                  const d = Number.parseFloat(r.deductions || '0');
                  const net = (b + a - d).toFixed(4);
                  return (
                    <tr key={r.id}>
                      <td>{formatShortDate(r.paymentDate)}</td>
                      <td>{r.user.fullName}</td>
                      <td>{r.branch.name}</td>
                      <td className="num">{formatKwdLabel(r.basicSalary)}</td>
                      <td className="num">{formatKwdLabel(r.allowances)}</td>
                      <td className="num is-neg">
                        − {formatKwdLabel(r.deductions)}
                      </td>
                      <td className="num">{formatKwdLabel(net)}</td>
                      <td>{t(`payroll.status.${r.status}`, r.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="monthly-summary-print__section msp-section--flow">
          <h2 className="monthly-summary-print__section-title">
            {t(
              'monthlySummary.inventoryConsumptionTitle',
              'استهلاك المخزون (صرف ميداني)',
            )}
          </h2>
          <p className="msp-section__intro">
            {t(
              'monthlySummary.inventoryConsumptionIntro',
              'مجموع حركات «صرف مخزون» لكل صنف خلال الفترة، معزولة حسب الفرع. إن امتد الجدول يُكمل تلقائياً على الصفحات التالية.',
            )}
          </p>
          {inv.length === 0 ? (
            <p className="msp-empty">
              {t(
                'monthlySummary.noInventoryConsumption',
                'لا توجد حركات صرف مخزون مسجلة للفترة.',
              )}
            </p>
          ) : (
            inv.map((block) => (
              <div
                key={block.branchId}
                className="msp-inventory-branch"
              >
                <h3 className="msp-inventory-branch__title">
                  {block.branchName}
                </h3>
                <table className="msp-list msp-list--inventory">
                  <thead>
                    <tr>
                      <th>{t('monthlySummary.col.itemCode', 'الرمز')}</th>
                      <th>{t('monthlySummary.col.itemName', 'الصنف')}</th>
                      <th>{t('monthlySummary.col.unit', 'الوحدة')}</th>
                      <th className="num">
                        {t(
                          'monthlySummary.col.qtyConsumed',
                          'الكمية المستهلكة',
                        )}
                      </th>
                      <th className="num">
                        {t('monthlySummary.col.movements', 'عدد الحركات')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.lines.map((line) => (
                      <tr key={line.stockItemId}>
                        <td className="msp-code" dir="ltr">
                          {line.code}
                        </td>
                        <td>{line.nameAr}</td>
                        <td>{line.unit}</td>
                        <td className="num">{line.quantityConsumed}</td>
                        <td className="num">{line.movementCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>

        <footer className="monthly-summary-print__footer msp-appendix__footer">
          <span>
            {t(
              'monthlySummary.printFooter',
              'تقرير تم توليده آلياً من نظام سفاري للمحاسبة — للاستخدام الداخلي.',
            )}
          </span>
        </footer>
        </div>
      </div>
    </div>
  );
}
