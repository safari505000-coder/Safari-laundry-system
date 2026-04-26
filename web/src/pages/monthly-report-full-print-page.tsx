import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  apiJson,
  ApiError,
  listAttendance,
  type AttendanceRow,
  type DebtRecoveryReport,
  type DriverLedgerReport,
  type ExpenseRow,
  type MonthlySummaryReport,
  type PayrollRow,
  type TeamUserRow,
  API_EXPENSES,
} from '@/lib/api';
import { formatKwdLabel, formatSignedKwdLabel } from '@/lib/kwd';
import { OperatorRouteHint } from '@/modules/shared/components/shell/operator-route-hint';
import './monthly-summary-print.css';
import './monthly-report-full-print.css';

/**
 * V19.29 — Comprehensive monthly report (print-only).
 *
 * Layout:
 *   1. Cover — KPIs, consolidated P&L, collections
 *   2. Table of contents
 *   3. Explanation page (what every number means + why it moves)
 *   4. Per-branch sections (one branch per spread):
 *        · Branch header + manager info
 *        · P&L + collections
 *        · Payroll roster
 *        · Attendance summary
 *        · Driver performance + debt
 *   5. Call center collections (debt recovery over the period)
 *   6. Appendix: consolidated expenses, payroll, ledger, inventory
 *
 * Opens as its own window so the app shell does not trap printing.
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

function f(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
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

function formatArabicDate(iso: string): string {
  if (!iso) return '';
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

function formatMinutesAsHours(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0:00';
  const h = Math.floor(min / 60);
  const m = Math.max(0, Math.round(min - h * 60));
  return `${h}:${String(m).padStart(2, '0')}`;
}

function PnlTable({ row }: { row: RowFormula }) {
  const { t } = useTranslation();
  const lines: Array<{
    label: string;
    value: string;
    negative?: boolean;
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

function CollectionsTable({ row }: { row: RowFormula }) {
  return (
    <table className="msp-table msp-table--collections">
      <tbody>
        <tr>
          <td className="msp-table__label">المحصّل من فواتير هذا الشهر</td>
          <td className="msp-table__value is-pos">
            {formatKwdLabel(row.collectedRevenueKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            تحصيل ديون على فواتير اكتملت قبل بداية الفترة
          </td>
          <td className="msp-table__value is-sky">
            {formatKwdLabel(row.debtPaymentsReceivedKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            غير المحصّل — فواتير الفترة (مكتملة وما زالت دين)
          </td>
          <td className="msp-table__value is-warn">
            {formatKwdLabel(row.uncollectedRevenueKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            متبقي ديون الفواتير (كل الفترات)
          </td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingInvoiceDebtKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">
            متبقي ديون الاشتراك / الزيادة (كل الفترات)
          </td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingSubscriptionDebtKd)}
          </td>
        </tr>
        <tr>
          <td className="msp-table__label">إجمالي المديونية المتبقية</td>
          <td className="msp-table__value is-neg">
            {formatKwdLabel(row.outstandingDebtKd)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

type AttendanceAgg = {
  userId: string;
  userName: string;
  employeeId: string | null;
  daysPresent: number;
  totalMinutes: number;
  lastDay: string | null;
};

function aggregateAttendance(rows: AttendanceRow[]): Map<string, AttendanceAgg> {
  const map = new Map<string, AttendanceAgg>();
  for (const r of rows) {
    const prev = map.get(r.userId);
    const minutes = r.durationMinutes ?? 0;
    if (prev) {
      prev.daysPresent += 1;
      prev.totalMinutes += minutes;
      if (!prev.lastDay || r.date > prev.lastDay) prev.lastDay = r.date;
    } else {
      map.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        employeeId: r.employeeId,
        daysPresent: 1,
        totalMinutes: minutes,
        lastDay: r.date,
      });
    }
  }
  return map;
}

const ROLE_LABEL_AR: Record<string, string> = {
  OWNER: 'المالك',
  GENERAL_MANAGER: 'المدير العام',
  MANAGER: 'مدير الفرع',
  DRIVER: 'سائق',
  WORKER: 'غسال / عامل',
  CALL_CENTER: 'موظف كول سنتر',
  CALL_CENTER_SUPERVISOR: 'مشرف الكول سنتر',
  FLEET_SUPERVISOR: 'مشرف الأسطول',
  ACCOUNTANT: 'محاسب',
  SUPERVISOR: 'مشرف',
  VIEWER: 'مشاهد',
};

function roleLabel(r: string): string {
  return ROLE_LABEL_AR[r] ?? r;
}

export function MonthlyReportFullPrintPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [search] = useSearchParams();
  const from = search.get('from')?.trim() || '';
  const to = search.get('to')?.trim() || '';

  const [summary, setSummary] = useState<MonthlySummaryReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [users, setUsers] = useState<TeamUserRow[]>([]);
  const [driverLedgers, setDriverLedgers] = useState<
    Map<string, DriverLedgerReport>
  >(new Map());
  const [debtRecovery, setDebtRecovery] = useState<DebtRecoveryReport | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** When false, auto-print must not run — data (incl. driver ledgers) still loading. */
  const [packReady, setPackReady] = useState(false);
  const autoPrintedRef = useRef(false);

  const load = useCallback(async () => {
    if (!token || !from || !to) return;
    setPackReady(false);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [s, e, p, a, u, dr] = await Promise.all([
        apiJson<MonthlySummaryReport>(
          `/api/reports/monthly-summary?${qs}`,
          { token },
        ),
        apiJson<ExpenseRow[]>(`${API_EXPENSES}?${qs}`, { token }),
        apiJson<PayrollRow[]>(`/api/payroll?${qs}`, { token }),
        listAttendance(token, { from, to }).catch(() => []),
        apiJson<TeamUserRow[]>('/api/users', { token }).catch(() => []),
        apiJson<DebtRecoveryReport>(
          `/api/call-center/debt-recovery-report?${qs}`,
          { token },
        ).catch(() => null),
      ]);

      setSummary(s);
      setExpenses(Array.isArray(e) ? e : []);
      setPayroll(Array.isArray(p) ? p : []);
      setAttendance(Array.isArray(a) ? a : []);
      setUsers(Array.isArray(u) ? u : []);
      setDebtRecovery(dr);

      // Fetch driver ledger per driver (active) in parallel. Errors are
      // soft-swallowed so the report still renders without dragging
      // a missing driver's row down.
      const drivers = (Array.isArray(u) ? u : []).filter(
        (x) => x.isActive && x.safariRole === 'DRIVER',
      );
      if (drivers.length > 0) {
        const results = await Promise.all(
          drivers.map(async (d) => {
            try {
              const qs2 = new URLSearchParams({
                driverId: d.id,
                from,
                to,
              }).toString();
              const r = await apiJson<DriverLedgerReport>(
                `/api/reports/driver-ledger?${qs2}`,
                { token },
              );
              return [d.id, r] as const;
            } catch {
              return null;
            }
          }),
        );
        const next = new Map<string, DriverLedgerReport>();
        for (const r of results) {
          if (r) next.set(r[0], r[1]);
        }
        setDriverLedgers(next);
      } else {
        setDriverLedgers(new Map());
      }

      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'تعذر تحميل التقرير الشهري الموسع',
      );
    } finally {
      setPackReady(true);
    }
  }, [token, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Force light theme in the print window.
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
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      html.removeAttribute('data-print-mode');
      html.style.colorScheme = '';
      if (hadDark) html.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    if (!summary || !packReady || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    const trigger = () => {
      setReady(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            window.print();
          } catch {
            /* fallback: manual button */
          }
        });
      });
    };
    const fontsPromise: Promise<unknown> = (document as Document & {
      fonts?: { ready?: Promise<unknown> };
    }).fonts?.ready ?? Promise.resolve();
    fontsPromise.then(trigger).catch(trigger);
  }, [summary, packReady]);

  const generatedAt = useMemo(() => new Date(), []);
  const brandName = 'Safari Laundry';

  const usersByBranch = useMemo(() => {
    const m = new Map<string, TeamUserRow[]>();
    for (const u of users) {
      if (!u.branchId) continue;
      const list = m.get(u.branchId) ?? [];
      list.push(u);
      m.set(u.branchId, list);
    }
    return m;
  }, [users]);

  const payrollByBranch = useMemo(() => {
    const m = new Map<string, PayrollRow[]>();
    for (const p of payroll) {
      const list = m.get(p.branchId) ?? [];
      list.push(p);
      m.set(p.branchId, list);
    }
    return m;
  }, [payroll]);

  const attendanceByBranch = useMemo(() => {
    const m = new Map<string, AttendanceRow[]>();
    for (const a of attendance) {
      if (!a.branchId) continue;
      const list = m.get(a.branchId) ?? [];
      list.push(a);
      m.set(a.branchId, list);
    }
    return m;
  }, [attendance]);

  if (error) {
    return (
      <div className="msp-message msp-message--error">
        <h1>التقرير الشهري الموسّع</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="msp-message">
        <h1>التقرير الشهري الموسّع</h1>
        <p>جاري تحضير الملف للطباعة...</p>
      </div>
    );
  }

  const c = summary.consolidated;

  // Branches shown in the main per-branch flow — skip the administrative
  // cost-centre so the owner sees 4 operating branches.
  const operatingBranches = summary.branches.filter((b) => !b.isAdministrative);
  const adminBranch = summary.branches.find((b) => b.isAdministrative) ?? null;

  return (
    <div
      id="monthly-report-full-print"
      className="monthly-summary-print mrf-print"
    >
      <div className="no-print px-4 pt-3">
        <OperatorRouteHint />
      </div>
      <div className="monthly-summary-print__toolbar no-print">
        <div className="msp-toolbar__hint">
          {!packReady
            ? 'جاري تحميل كل أقسام التقرير (الفروع، الحضور، السواقين، الكول سنتر)...'
            : ready
              ? 'تم التحميل — إذا لم تفتح نافذة الطباعة تلقائياً اضغط الزر. في حوار الطباعة اختر «حجم فعلي 100٪» وليس «ملاءمة الصفحة» حتى لا يُضغط كل شيء في صفحة واحدة.'
              : 'جاري التحضير للطباعة...'}
        </div>
        <button
          type="button"
          className="msp-toolbar__btn"
          onClick={() => window.print()}
        >
          <Printer size={14} />
          <span>طباعة</span>
        </button>
      </div>

      <div className="monthly-summary-print__sheet">
        {/* ============ 1 · COVER =============================== */}
        <div className="msp-cover mrf-print-cover-page">
          <header className="monthly-summary-print__header">
            <div>
              <div className="monthly-summary-print__brand">{brandName}</div>
              <h1 className="monthly-summary-print__title">
                التقرير الشهري الموسّع
              </h1>
              <p className="monthly-summary-print__range">
                الفترة:{' '}
                <span dir="ltr">
                  {formatArabicDate(from)} → {formatArabicDate(to)}
                </span>
              </p>
              <p className="msp-cover__hint">
                ملخص الشهر في الصفحة الأولى، ثم فهرس الصفحات وشرح الأرقام،
                ثم تقرير مستقل لكل فرع (كشف الحضور، مسير الرواتب، أداء السواقين،
                المديونيات)، ثم تحصيل الكول سنتر.
              </p>
            </div>
            <div className="monthly-summary-print__meta">
              <div className="monthly-summary-print__metric">
                <span className="monthly-summary-print__metric-label">
                  إجمالي الإيرادات
                </span>
                <span className="monthly-summary-print__metric-value">
                  {formatKwdLabel(c.grossRevenueKd)}
                </span>
              </div>
              <div className="monthly-summary-print__metric">
                <span className="monthly-summary-print__metric-label">
                  صافي الربح
                </span>
                <span className="monthly-summary-print__metric-value">
                  {formatKwdLabel(c.netProfitKd)}
                </span>
              </div>
              <div className="monthly-summary-print__metric">
                <span className="monthly-summary-print__metric-label">
                  المديونية المتبقية
                </span>
                <span className="monthly-summary-print__metric-value">
                  {formatKwdLabel(c.outstandingDebtKd)}
                </span>
              </div>
              <div className="monthly-summary-print__generated">
                تم التوليد: {generatedAt.toLocaleString('en-GB')}
              </div>
            </div>
          </header>

          <section className="monthly-summary-print__section msp-section--cover-only">
            <h2 className="monthly-summary-print__section-title">
              ملخص الفترة — الإجمالي
            </h2>
            <p className="msp-section__intro">
              أداء المجموعة خلال الفترة: الإيرادات والمصروفات وصافي الربح،
              وأرقام التحصيل الرئيسية.
            </p>
            <PnlTable row={c} />
            <h3 className="monthly-summary-print__subheading">ملخّص التحصيل</h3>
            <CollectionsTable row={c} />
          </section>

          <footer className="monthly-summary-print__footer msp-cover__footer">
            <span>
              تقرير تم توليده آلياً من نظام سفاري للمحاسبة — للاستخدام الداخلي.
            </span>
          </footer>
        </div>

        {/* ============ 2 · TOC ================================== */}
        <div className="mrf-toc">
          <h2 className="monthly-summary-print__section-title">
            الفهرس / Contents
          </h2>
          <p className="msp-section__intro">
            يمثّل هذا الفهرس خريطة قراءة التقرير. كل فرع يأخذ قسماً مستقلاً يجمع
            بياناته المالية والبشرية معاً.
          </p>
          <ol className="mrf-toc__list">
            <li>
              <span className="mrf-toc__label">
                ١. الغلاف — إجمالي الشهر وصافي الربح
              </span>
            </li>
            <li>
              <span className="mrf-toc__label">٢. الفهرس</span>
            </li>
            <li>
              <span className="mrf-toc__label">
                ٣. شرح الأرقام — ماذا يعني كل بند ولماذا يتحرّك
              </span>
            </li>
            {operatingBranches.map((b, idx) => (
              <li key={b.branchId}>
                <span className="mrf-toc__label">
                  {`${4 + idx}. فرع ${b.branchName}`}
                </span>
                <span className="mrf-toc__sub">
                  الحالة الشهرية · مدير الفرع · مسير الرواتب · كشف الحضور ·
                  أداء السواقين ومديونيّاتهم
                </span>
              </li>
            ))}
            {adminBranch ? (
              <li>
                <span className="mrf-toc__label">
                  {`${4 + operatingBranches.length}. مركز تكلفة — الإدارة`}
                </span>
                <span className="mrf-toc__sub">
                  {adminBranch.branchName} (لا يُنسب له إيراد تشغيلي)
                </span>
              </li>
            ) : null}
            <li>
              <span className="mrf-toc__label">
                {`${4 + operatingBranches.length + (adminBranch ? 1 : 0)}. تحصيل الكول سنتر`}
              </span>
              <span className="mrf-toc__sub">
                حركة ديون العملاء يومياً خلال الفترة
              </span>
            </li>
            <li>
              <span className="mrf-toc__label">
                {`${5 + operatingBranches.length + (adminBranch ? 1 : 0)}. ملحقات — مصروفات ورواتب ودفتر قيود ومخزون`}
              </span>
            </li>
          </ol>
        </div>

        {/* ============ 3 · EXPLANATION ========================= */}
        <section className="mrf-explain">
          <h2 className="monthly-summary-print__section-title">
            شرح الأرقام وأسبابها
          </h2>
          <p className="msp-section__intro">
            هذا الجزء يوضّح ما الذي يحسبه النظام خلف كل رقم في الملخص، وما
            العوامل التشغيلية التي ترفعه أو تخفضه، كي يكون قراءة التقرير
            مستقلة عن شرح شفهي.
          </p>
          <ExplainTable />
        </section>

        {/* ============ 4 · PER-BRANCH =========================== */}
        {operatingBranches.map((branch) => {
          const branchUsers = usersByBranch.get(branch.branchId) ?? [];
          const manager =
            branchUsers.find(
              (u) => u.isActive && u.safariRole === 'MANAGER',
            ) ??
            branchUsers.find((u) => u.safariRole === 'MANAGER') ??
            null;
          const branchPayroll = payrollByBranch.get(branch.branchId) ?? [];
          const branchAttendance =
            attendanceByBranch.get(branch.branchId) ?? [];
          const attendanceAgg = aggregateAttendance(branchAttendance);
          const branchDrivers = branchUsers.filter(
            (u) => u.isActive && u.safariRole === 'DRIVER',
          );
          return (
            <BranchSection
              key={branch.branchId}
              branch={branch}
              manager={manager}
              branchUsers={branchUsers}
              payroll={branchPayroll}
              attendanceAgg={attendanceAgg}
              drivers={branchDrivers}
              driverLedgers={driverLedgers}
            />
          );
        })}

        {/* ============ 5 · CALL CENTER ========================= */}
        <section className="mrf-branch mrf-branch--cc">
          <header className="mrf-branch__head">
            <div>
              <div className="mrf-branch__brand">{brandName}</div>
              <h2 className="mrf-branch__title">تحصيل الكول سنتر</h2>
              <p className="msp-section__intro mrf-branch__intro">
                حركة تحصيل الديون يومياً خلال الفترة، كمصدر رئيسي لتقييم أداء
                فريق خدمة العملاء. المبالغ هي ما تم سداده من ديون مفتوحة على
                العملاء داخل التطبيق.
              </p>
            </div>
            {debtRecovery ? (
              <div className="mrf-branch__chip">
                الإجمالي المُحصّل:{' '}
                <span dir="ltr">
                  {formatKwdLabel(debtRecovery.totalRecoveredKd)}
                </span>
              </div>
            ) : null}
          </header>
          {!debtRecovery || debtRecovery.days.length === 0 ? (
            <p className="msp-empty">
              لا توجد حركات تحصيل ديون مسجلة خلال الفترة.
            </p>
          ) : (
            <table className="msp-list">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th className="num">تسويات كاملة</th>
                  <th className="num">اشتراكات مرتبطة</th>
                  <th className="num">المُحصّل (د.ك)</th>
                </tr>
              </thead>
              <tbody>
                {debtRecovery.days.map((d) => (
                  <tr key={d.dayIso}>
                    <td dir="ltr">{d.dayIso}</td>
                    <td className="num">{d.settlementCount}</td>
                    <td className="num">{d.subscriptionCount}</td>
                    <td className="num" dir="ltr">
                      {formatKwdLabel(d.recoveredKd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="mrf-foot">
                    إجمالي الفترة
                  </td>
                  <td className="num mrf-foot" dir="ltr">
                    {formatKwdLabel(debtRecovery.totalRecoveredKd)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* ============ 6 · APPENDIX ============================ */}
        <div className="msp-appendix">
          <div className="msp-runhead">
            <div className="msp-runhead__brand">{brandName}</div>
            <div className="msp-runhead__title">ملحقات — بيانات تفصيلية</div>
            <div className="msp-runhead__range" dir="ltr">
              {formatArabicDate(from)} → {formatArabicDate(to)}
            </div>
          </div>

          <section className="monthly-summary-print__section msp-section--flow">
            <h2 className="monthly-summary-print__section-title">
              المصروفات (الإجمالي){' '}
              <span className="monthly-summary-print__chip">
                المعتمد:{' '}
                {formatKwdLabel(
                  expenses
                    .filter((r) => r.status === 'APPROVED')
                    .reduce((s, r) => s + f(r.amount), 0)
                    .toFixed(4),
                )}
              </span>
            </h2>
            {expenses.length === 0 ? (
              <p className="msp-empty">لا توجد مصروفات مسجلة للفترة.</p>
            ) : (
              <table className="msp-list">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الفرع</th>
                    <th>البيان</th>
                    <th>الفئة</th>
                    <th>الحالة</th>
                    <th className="num">المبلغ</th>
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
              الرواتب (الإجمالي){' '}
              <span className="monthly-summary-print__chip">
                المدفوع:{' '}
                {formatKwdLabel(
                  payroll
                    .filter((r) => r.status === 'PAID')
                    .reduce(
                      (s, r) =>
                        s +
                        f(r.basicSalary) +
                        f(r.allowances) -
                        f(r.deductions),
                      0,
                    )
                    .toFixed(4),
                )}
              </span>
            </h2>
            {payroll.length === 0 ? (
              <p className="msp-empty">لا توجد رواتب مسجلة للفترة.</p>
            ) : (
              <table className="msp-list">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>الفرع</th>
                    <th className="num">أساسي</th>
                    <th className="num">بدلات</th>
                    <th className="num">خصومات</th>
                    <th className="num">الصافي</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((r) => {
                    const net = (
                      f(r.basicSalary) +
                      f(r.allowances) -
                      f(r.deductions)
                    ).toFixed(4);
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

          {summary.ledgerRollup ? (
            <section className="monthly-summary-print__section msp-section--flow">
              <h2 className="monthly-summary-print__section-title">
                سجل الحركات
              </h2>
              <p className="msp-section__intro">
                كل قيد مالي دخل النظام خلال الفترة — مفيد للتحقق والمطابقة.
              </p>
              <LedgerTable
                title="الدفتر الموحّد"
                rows={summary.ledgerRollup.generalLedger.map((g) => ({
                  code: g.entryType,
                  totalKd: g.totalKd,
                  count: g.movementCount,
                }))}
              />
              <LedgerTable
                title="سجل المحفظة"
                rows={summary.ledgerRollup.walletJournal.map((g) => ({
                  code: g.type,
                  totalKd: g.totalKd,
                  count: g.movementCount,
                }))}
              />
              <LedgerTable
                title="دفتر الذمم"
                rows={summary.ledgerRollup.debtLedger.map((g) => ({
                  code: g.source,
                  totalKd: g.totalKd,
                  count: g.movementCount,
                }))}
              />
            </section>
          ) : null}

          <section className="monthly-summary-print__section msp-section--flow">
            <h2 className="monthly-summary-print__section-title">
              استهلاك المخزون
            </h2>
            <p className="msp-section__intro">
              مجموع حركات «صرف مخزون» لكل صنف خلال الفترة، معزولاً حسب الفرع.
            </p>
            {summary.inventoryConsumption.branches.length === 0 ? (
              <p className="msp-empty">لا توجد حركات صرف مخزون للفترة.</p>
            ) : (
              summary.inventoryConsumption.branches.map((block) => (
                <div key={block.branchId} className="msp-inventory-branch">
                  <h3 className="msp-inventory-branch__title">
                    {block.branchName}
                  </h3>
                  <table className="msp-list msp-list--inventory">
                    <thead>
                      <tr>
                        <th>الرمز</th>
                        <th>الصنف</th>
                        <th>الوحدة</th>
                        <th className="num">الكمية المستهلكة</th>
                        <th className="num">عدد الحركات</th>
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
              تقرير تم توليده آلياً من نظام سفاري للمحاسبة — للاستخدام الداخلي.
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function LedgerTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ code: string; totalKd: string; count: number }>;
}) {
  return (
    <div className="msp-inventory-branch">
      <h3 className="msp-inventory-branch__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="msp-empty">لا توجد حركات.</p>
      ) : (
        <table className="msp-list">
          <thead>
            <tr>
              <th>البند</th>
              <th className="num">الحركات</th>
              <th className="num">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td>
                <td className="num">{r.count}</td>
                <td className="num" dir="ltr">
                  {formatSignedKwdLabel(r.totalKd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExplainTable() {
  const rows: Array<{ k: string; v: string; why: string }> = [
    {
      k: 'إجمالي الإيرادات',
      v: 'مجموع قيم الفواتير المكتملة خلال الفترة (POS + مبيعات موقع/تطبيق)، قبل خصم أي مصروف.',
      why: 'يرتفع مع كثافة العمل الميدانية (اشتراكات فعّالة، حملات كول سنتر)، وينخفض مع العطلات والإجازات الطارئة.',
    },
    {
      k: 'رسوم بنكية',
      v: 'رسوم KNET / بطاقات على الفواتير المحصّلة بالقنوات غير النقدية (معايرة حسب قنوات الدفع).',
      why: 'تنمو تلقائياً مع ارتفاع التحصيل الإلكتروني، وتقل إذا ارتفعت نسبة التحصيل النقدي.',
    },
    {
      k: 'مصروفات متغيرة',
      v: 'صرف المواد المباشرة: وقود، صابون، مواد مساعدة (مرتبطة بحجم التشغيل الفعلي).',
      why: 'الارتفاع المفاجئ يؤشّر على هدر في الميدان أو زيادة أسعار الموردين.',
    },
    {
      k: 'مصروفات متنوعة',
      v: 'مصروفات تشغيلية صغيرة معتمَدة خارج البنود المتغيرة الأساسية.',
      why: 'تقفز عادة عند استبدال أدوات أو مصاريف صيانة طارئة.',
    },
    {
      k: 'مصروفات ثابتة',
      v: 'إيجارات، كهرباء، ليّز — مجدولة شهرياً ومضافة بقيمتها المستحقّة.',
      why: 'ثابتة نسبياً؛ أي قفزة تعني تعديل عقد أو إضافة فرع.',
    },
    {
      k: 'رواتب مدفوعة',
      v: 'مجموع صافي الرواتب التي تم اعتمادها ودفعها خلال الفترة (أساسي + بدلات − خصم).',
      why: 'تنمو مع التوسّع البشري أو العمولات/المكافآت الشهرية.',
    },
    {
      k: 'دعم الاشتراكات',
      v: 'الفارق المالي الذي تتحمّله الشركة عندما يستهلك العميل قيمة أكبر من باقته (زيادة استهلاك).',
      why: 'يكشف هل الاشتراكات مربحة أم تخسر الشركة عند تفعيل خصم الاشتراك.',
    },
    {
      k: 'صافي الربح',
      v: 'الإيرادات بعد خصم كل ما سبق: (إيرادات − رسوم − مصروفات − رواتب − دعم اشتراكات).',
      why: 'هذا هو الخط الأهم — سلبياً يعني الفرع يستهلك سيولة الشركة.',
    },
    {
      k: 'المحصّل',
      v: 'ما تم تحصيله فعلياً مقابل فواتير الفترة (نقدي + إلكتروني).',
      why: 'انخفاضه مع ثبات الإيراد يعني زيادة في الديون المفتوحة على العملاء.',
    },
    {
      k: 'المديونية المتبقية',
      v: 'ديون غير مسدّدة من فواتير سابقة أو اشتراكات زيادة (باقية حتى تاريخ التقرير).',
      why: 'يتحرك مع جهد التحصيل للكول سنتر وقدرة الفريق على إقفال الديون القديمة.',
    },
  ];
  return (
    <table className="mrf-explain__table">
      <thead>
        <tr>
          <th>البند</th>
          <th>ماذا يمثّل</th>
          <th>لماذا يتحرّك</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.k}>
            <td className="mrf-explain__k">{r.k}</td>
            <td>{r.v}</td>
            <td className="mrf-explain__w">{r.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BranchSection({
  branch,
  manager,
  branchUsers,
  payroll,
  attendanceAgg,
  drivers,
  driverLedgers,
}: {
  branch: BranchRow;
  manager: TeamUserRow | null;
  branchUsers: TeamUserRow[];
  payroll: PayrollRow[];
  attendanceAgg: Map<string, AttendanceAgg>;
  drivers: TeamUserRow[];
  driverLedgers: Map<string, DriverLedgerReport>;
}) {
  const payrollByUser = useMemo(() => {
    const m = new Map<string, PayrollRow>();
    for (const p of payroll) {
      if (!m.has(p.userId)) m.set(p.userId, p);
    }
    return m;
  }, [payroll]);

  const totalPayrollNet = payroll.reduce(
    (s, p) => s + f(p.basicSalary) + f(p.allowances) - f(p.deductions),
    0,
  );

  const driverDebtTotal = drivers.reduce((s, d) => {
    const l = driverLedgers.get(d.id);
    return s + (l ? f(l.owedToOfficeKd) : 0);
  }, 0);

  // Active staff for the payroll roster on this page (include all active
  // users, not just those with payroll rows, so the sheet matches the
  // printed roster even for unpaid rows).
  const rosterUsers = branchUsers.filter((u) => u.isActive);
  rosterUsers.sort((a, b) => {
    const oa = a.payrollRosterLineOrder ?? Number.POSITIVE_INFINITY;
    const ob = b.payrollRosterLineOrder ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return a.fullName.localeCompare(b.fullName, 'ar');
  });

  return (
    <section className="mrf-branch">
      <header className="mrf-branch__head">
        <div>
          <div className="mrf-branch__brand">تقرير فرع</div>
          <h2 className="mrf-branch__title">فرع {branch.branchName}</h2>
          <p className="msp-section__intro mrf-branch__intro">
            كل أرقام هذا الفرع معزولة هنا: الحالة المالية، مدير الفرع، مسير
            الرواتب، كشف الحضور، أداء السواقين وديون كل واحد منهم.
          </p>
        </div>
        <div className="mrf-branch__metrics">
          <div className="mrf-branch__metric">
            <span>صافي الفرع</span>
            <strong>{formatKwdLabel(branch.netProfitKd)}</strong>
          </div>
          <div className="mrf-branch__metric">
            <span>الإيرادات</span>
            <strong>{formatKwdLabel(branch.grossRevenueKd)}</strong>
          </div>
          <div className="mrf-branch__metric">
            <span>المديونية المتبقية</span>
            <strong>{formatKwdLabel(branch.outstandingDebtKd)}</strong>
          </div>
        </div>
      </header>

      {/* Monthly state report */}
      <div className="mrf-branch__block">
        <h3 className="mrf-branch__block-title">تقرير الحالة الشهرية</h3>
        <PnlTable row={branch} />
        <h4 className="monthly-summary-print__subheading">ملخص التحصيل</h4>
        <CollectionsTable row={branch} />
      </div>

      {/* Manager */}
      <div className="mrf-branch__block">
        <h3 className="mrf-branch__block-title">مدير الفرع</h3>
        {manager ? (
          <table className="mrf-mgr">
            <tbody>
              <tr>
                <th>الاسم</th>
                <td>{manager.fullName}</td>
                <th>اسم المستخدم</th>
                <td dir="ltr">{manager.username}</td>
              </tr>
              <tr>
                <th>المهنة</th>
                <td>{manager.jobTitle ?? '—'}</td>
                <th>الهاتف</th>
                <td dir="ltr">{manager.phone ?? '—'}</td>
              </tr>
              <tr>
                <th>الحالة</th>
                <td>{manager.isActive ? 'نشط' : 'موقوف'}</td>
                <th>رقم الحساب</th>
                <td dir="ltr">{manager.bankIban ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="msp-empty">لا يوجد مستخدم بدور «مدير الفرع» مرتبط.</p>
        )}
      </div>

      {/* Payroll roster */}
      <div className="mrf-branch__block">
        <h3 className="mrf-branch__block-title">
          مسير الرواتب{' '}
          <span className="monthly-summary-print__chip">
            الصافي: {formatKwdLabel(totalPayrollNet.toFixed(4))}
          </span>
        </h3>
        {rosterUsers.length === 0 ? (
          <p className="msp-empty">لا يوجد موظفون نشطون في هذا الفرع.</p>
        ) : (
          <table className="msp-list">
            <thead>
              <tr>
                <th>#</th>
                <th>الاسم</th>
                <th>الدور</th>
                <th>المهنة</th>
                <th>رقم الحساب</th>
                <th className="num">أساسي</th>
                <th className="num">بدلات</th>
                <th className="num">خصومات</th>
                <th className="num">الصافي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rosterUsers.map((u, idx) => {
                const p = payrollByUser.get(u.id);
                const basic = p ? f(p.basicSalary) : f(u.basicMonthlySalary);
                const allow = p
                  ? f(p.allowances)
                  : f(u.monthlyAllowances);
                const deduct = p ? f(p.deductions) : 0;
                const net = (basic + allow - deduct).toFixed(4);
                const status = p
                  ? p.status === 'PAID'
                    ? 'مدفوع'
                    : 'قيد الاعتماد'
                  : 'بدون مسير';
                return (
                  <tr key={u.id}>
                    <td>{u.payrollRosterLineOrder ?? idx + 1}</td>
                    <td>{u.fullName}</td>
                    <td>{roleLabel(u.safariRole)}</td>
                    <td>{u.jobTitle ?? '—'}</td>
                    <td dir="ltr">{u.bankIban ?? '—'}</td>
                    <td className="num">{formatKwdLabel(basic.toFixed(4))}</td>
                    <td className="num">{formatKwdLabel(allow.toFixed(4))}</td>
                    <td className="num is-neg">
                      {deduct > 0 ? '− ' + formatKwdLabel(deduct.toFixed(4)) : '—'}
                    </td>
                    <td className="num">{formatKwdLabel(net)}</td>
                    <td>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Attendance */}
      <div className="mrf-branch__block">
        <h3 className="mrf-branch__block-title">كشف الحضور</h3>
        {rosterUsers.length === 0 ? (
          <p className="msp-empty">لا يوجد موظفون.</p>
        ) : (
          <table className="msp-list">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th className="num">أيام الحضور</th>
                <th className="num">إجمالي الساعات</th>
                <th>آخر يوم حضور</th>
              </tr>
            </thead>
            <tbody>
              {rosterUsers.map((u) => {
                const a = attendanceAgg.get(u.id);
                return (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td>{roleLabel(u.safariRole)}</td>
                    <td className="num">{a?.daysPresent ?? 0}</td>
                    <td className="num">
                      {formatMinutesAsHours(a?.totalMinutes ?? 0)}
                    </td>
                    <td dir="ltr">{a?.lastDay ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drivers performance & debt */}
      <div className="mrf-branch__block">
        <h3 className="mrf-branch__block-title">
          أداء السواقين ومديونيّاتهم{' '}
          <span className="monthly-summary-print__chip">
            الإجمالي المديون: {formatKwdLabel(driverDebtTotal.toFixed(4))}
          </span>
        </h3>
        {drivers.length === 0 ? (
          <p className="msp-empty">لا يوجد سواقون نشطون في هذا الفرع.</p>
        ) : (
          <table className="msp-list">
            <thead>
              <tr>
                <th>السائق</th>
                <th className="num">عدد الطلبات</th>
                <th className="num">مكتملة</th>
                <th className="num">طلبات قيد الإغلاق</th>
                <th className="num">مديونية على المكتب (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const l = driverLedgers.get(d.id);
                const total = l?.ordersInPeriod.length ?? 0;
                const completed = l
                  ? l.ordersInPeriod.filter((o) => o.status === 'COMPLETED')
                      .length
                  : 0;
                return (
                  <tr key={d.id}>
                    <td>{d.fullName}</td>
                    <td className="num">{total}</td>
                    <td className="num">{completed}</td>
                    <td className="num">
                      {l?.pendingSettlementOrderCount ?? 0}
                    </td>
                    <td className="num is-neg" dir="ltr">
                      {l ? formatKwdLabel(l.owedToOfficeKd) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
