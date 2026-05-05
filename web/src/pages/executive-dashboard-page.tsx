/**
 * Executive Dashboard — the SINGLE unified read-only landing surface.
 *
 * One dashboard for every operator in the building:
 *   - OWNER / GENERAL_MANAGER → group-level overview + top risk only
 *     when financial risk exists. The driver list stays hidden when
 *     everything is GREEN so the owner sees a clean "all clear" view.
 *   - MANAGER → branch-clamped automatically by the backend (the JWT
 *     branchId is enforced on every read), so the same component
 *     renders the manager's branch only.
 *   - ACCOUNTANT → all branches; same layout as the executive pair.
 *
 * Everything on this page comes from the cash-classifier (the single
 * source of truth). The page is strictly READ-ONLY: no buttons, no
 * forms, no POSTs. Auto-poll happens every 60 seconds inside the
 * `useCashIntelligence` hook.
 *
 * Comprehension target: < 3 seconds. The header alone tells an
 * executive whether to keep walking or stop and read.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useCashIntelligence } from '@/modules/manager/hooks/useCashIntelligence';
import { formatKwdLabel } from '@/lib/kwd';
import {
  ApiError,
  runCashIntelIntegrityAudit,
  verifyCashIntelSystem,
  type CashIntelClassifiedAlert,
  type CashIntelClassifiedDriver,
  type CashIntelClassifiedDriverStatus,
  type CashIntelExecutiveTopRisk,
  type CashIntelIntegrityIssue,
  type CashIntelIntegrityResponse,
  type CashIntelTrafficLight,
  type CashIntelVerifyResponse,
} from '@/lib/api';

// ─── Copy ─────────────────────────────────────────────────────────

const STATUS_VERDICT_AR: Record<CashIntelTrafficLight, string> = {
  GREEN: 'العمليات المالية تحت السيطرة',
  YELLOW: 'تأخيرات تشغيلية فقط — لا أثر مالي',
  RED: 'يوجد خطر مالي يستدعي الانتباه',
};

const STATUS_PILL_LABEL_AR: Record<CashIntelTrafficLight, string> = {
  GREEN: 'مستقر',
  YELLOW: 'انتباه تشغيلي',
  RED: 'خطر مالي',
};

const STATUS_PILL_TONE: Record<CashIntelTrafficLight, string> = {
  GREEN: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  YELLOW: 'bg-amber-100 text-amber-900 ring-amber-200',
  RED: 'bg-rose-100 text-rose-900 ring-rose-200',
};

const STATUS_BORDER_TONE: Record<CashIntelTrafficLight, string> = {
  GREEN: 'border-emerald-200',
  YELLOW: 'border-amber-200',
  RED: 'border-rose-200',
};

const DRIVER_STATUS_AR: Record<
  CashIntelClassifiedDriverStatus,
  { label: string; chip: string; dot: string }
> = {
  AT_RISK: {
    label: 'خطر',
    chip: 'bg-rose-50 text-rose-900 ring-rose-200',
    dot: 'bg-rose-500',
  },
  COMPLIANCE_ONLY: {
    label: 'تأخير',
    chip: 'bg-amber-50 text-amber-900 ring-amber-200',
    dot: 'bg-amber-500',
  },
  NORMAL: {
    label: 'طبيعي',
    chip: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
};

// ─── Component ────────────────────────────────────────────────────

export function ExecutiveDashboardPage() {
  const { user } = useAuth();
  const intel = useCashIntelligence();

  // Owner-tier = OWNER + GENERAL_MANAGER. They get the summary-only
  // experience (driver list hidden when GREEN). Manager + Accountant
  // always see the driver list because they act on it operationally.
  const isOwnerTier =
    user?.safariRole === 'OWNER' || user?.safariRole === 'GENERAL_MANAGER';

  const status = intel.classified?.systemStatus ?? null;
  const financialAlerts = intel.classified?.financialAlerts ?? [];
  const complianceAlerts = intel.classified?.complianceAlerts ?? [];
  // Stable identity so downstream useMemo deps don't churn every
  // render (an inline `?? []` allocates a fresh array each pass).
  const drivers = useMemo(
    () => intel.classified?.drivers ?? [],
    [intel.classified],
  );
  const topRisk = intel.executive?.topRisk ?? null;

  // SSoT: the header KD figure is Σ classified.drivers[].amount. We
  // never source it from executive.auditReference.totalCashInFlight —
  // that field exists for backwards compatibility but the truth lives
  // in `/classified`.
  const totalCashKd = useMemo(() => {
    if (!intel.classified) return null;
    return intel.classified.drivers
      .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
      .toFixed(4);
  }, [intel.classified]);

  const hasAlerts = financialAlerts.length > 0 || complianceAlerts.length > 0;

  // Split holders by role so the dashboard never renders a manager and
  // a driver in the same table again. Anything that isn't tagged
  // MANAGER falls through to the drivers table (DRIVER, null/orphan,
  // and any back-office user that ends up tagged as a cash holder via
  // legacy data — they all read as "field cash" for the operator).
  const driverRows = useMemo(
    () =>
      drivers
        .filter((d) => d.holderRole !== 'MANAGER')
        .sort((a, b) => severityRank(b.status) - severityRank(a.status)),
    [drivers],
  );
  const managerRows = useMemo(
    () =>
      drivers
        .filter((d) => d.holderRole === 'MANAGER')
        .sort((a, b) => severityRank(b.status) - severityRank(a.status)),
    [drivers],
  );

  const showHolderLists =
    drivers.length > 0 && (status !== 'GREEN' || !isOwnerTier);
  const showDriverList = showHolderLists && driverRows.length > 0;
  const showManagerList = showHolderLists && managerRows.length > 0;

  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl space-y-6 px-1 py-1">
      {/* ─── 1. HEADER ─────────────────────────────────────────── */}
      <Header
        status={status}
        totalCashKd={totalCashKd}
        loading={intel.loading}
        branchScoped={!isOwnerTier && user?.safariRole === 'MANAGER'}
        hasBranch={!!user?.branchId}
      />

      {intel.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-semibold">تعذّر تحميل اللوحة</div>
            <div className="text-xs">{intel.error}</div>
          </div>
        </div>
      ) : null}

      {/* ─── 2. ALERTS (conditional) ──────────────────────────── */}
      {hasAlerts ? (
        <AlertsSection
          financial={financialAlerts}
          compliance={complianceAlerts}
        />
      ) : null}

      {/* ─── 3a. DRIVERS (cash held by field drivers) ────────── */}
      {showDriverList ? (
        <DriverList drivers={driverRows} loading={intel.loading} />
      ) : null}

      {/* ─── 3b. MANAGERS (cash held by branch managers) ─────── */}
      {showManagerList ? (
        <ManagerList managers={managerRows} loading={intel.loading} />
      ) : null}

      {/* ─── 4. TOP RISK (conditional) ────────────────────────── */}
      {topRisk ? <TopRiskCard topRisk={topRisk} /> : null}

      {/* Empty state — only when nothing else is rendering */}
      {!intel.loading &&
      !intel.error &&
      !hasAlerts &&
      !showDriverList &&
      !showManagerList &&
      !topRisk ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center text-base font-medium text-muted-foreground">
          لا يوجد أي نشاط مالي اليوم
        </div>
      ) : null}

      {/* ─── 5. SAFETY LAYERS (OWNER + GM only, manual trigger) ── */}
      {isOwnerTier ? (
        <div className="space-y-3">
          <VerifySystemPanel />
          <IntegrityAuditPanel />
        </div>
      ) : null}
    </div>
  );
}

// ─── 1. HEADER ───────────────────────────────────────────────────

type HeaderProps = {
  status: CashIntelTrafficLight | null;
  totalCashKd: string | null;
  loading: boolean;
  branchScoped: boolean;
  hasBranch: boolean;
};

function Header({
  status,
  totalCashKd,
  loading,
  branchScoped,
  hasBranch,
}: HeaderProps) {
  return (
    <header
      className={`flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between ${status ? STATUS_BORDER_TONE[status] : 'border-border'}`}
    >
      <div className="space-y-2">
        {status ? (
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_PILL_TONE[status]}`}
          >
            <span className="h-2 w-2 rounded-full bg-current opacity-80" />
            {STATUS_PILL_LABEL_AR[status]}
          </span>
        ) : loading ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري التحميل
          </span>
        ) : null}

        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          {status ? STATUS_VERDICT_AR[status] : 'لوحة التنفيذ'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {branchScoped
            ? hasBranch
              ? 'عرض حيّ مرتبط بفرعك — كل الأرقام مباشرة من الباك‌اند.'
              : 'لم يتم ربط حسابك بأي فرع.'
            : 'عرض شامل على مستوى المجموعة — تحديث تلقائي كل دقيقة.'}
        </p>
      </div>

      <div className="text-end">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          إجمالي نقد اليوم
        </div>
        <div
          dir="ltr"
          className="text-3xl font-bold tabular-nums text-foreground sm:text-4xl"
        >
          {totalCashKd !== null ? formatKwdLabel(totalCashKd) : '—'}
        </div>
      </div>
    </header>
  );
}

// ─── 2. ALERTS ────────────────────────────────────────────────────

type AlertsSectionProps = {
  financial: CashIntelClassifiedAlert[];
  compliance: CashIntelClassifiedAlert[];
};

function AlertsSection({ financial, compliance }: AlertsSectionProps) {
  const sortedFinancial = useMemo(
    () =>
      [...financial].sort(
        (a, b) => alertSeverityRank(b.severity) - alertSeverityRank(a.severity),
      ),
    [financial],
  );

  return (
    <section className="space-y-3">
      {sortedFinancial.length > 0 ? (
        <ul className="space-y-2">
          {sortedFinancial.map((a, idx) => (
            <li
              key={`fin-${idx}`}
              className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                a.severity === 'CRITICAL'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">
                  {a.driverName ?? 'سائق غير معروف'}
                </div>
                <div className="text-xs opacity-90">{a.reason}</div>
              </div>
              <div
                dir="ltr"
                className="shrink-0 text-sm font-bold tabular-nums"
              >
                {formatKwdLabel(a.amount)}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {compliance.length > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span aria-hidden>⚠️</span>
          <span>
            {compliance.length} ملاحظة تشغيلية{' '}
            <span className="text-amber-800/80">— بدون أثر مالي</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

// ─── 3a. DRIVERS LIST (table) ────────────────────────────────────

type HolderListProps = {
  drivers: CashIntelClassifiedDriver[];
  loading: boolean;
};

function DriverList({ drivers, loading }: HolderListProps) {
  if (loading && drivers.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        جاري تحميل بيانات السائقين...
      </div>
    );
  }
  if (drivers.length === 0) return null;

  return (
    <section
      aria-label="عُهد السائقين"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="rounded-md bg-zinc-100 p-1.5 text-zinc-700"
          >
            <Truck className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              عُهد السائقين
            </h2>
            <p className="text-xs text-muted-foreground">
              نقد ميداني بحوزة السائقين — لم يُسلَّم بعد لمدير الفرع.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
          {drivers.length}
        </span>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-start font-medium">السائق</th>
            <th className="px-4 py-2 text-start font-medium">الحالة</th>
            <th className="px-4 py-2 text-end font-medium">إجمالي النقد</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {drivers.map((d) => {
            const meta = DRIVER_STATUS_AR[d.status];
            return (
              <tr key={d.driverId}>
                <td className="px-4 py-3 font-medium text-foreground">
                  {d.driverName ?? d.driverId}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.chip}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </td>
                <td
                  dir="ltr"
                  className="px-4 py-3 text-end font-semibold tabular-nums text-foreground"
                >
                  {formatKwdLabel(d.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ─── 3b. MANAGERS LIST (cards, never a table) ────────────────────

type ManagerListProps = {
  managers: CashIntelClassifiedDriver[];
  loading: boolean;
};

function ManagerList({ managers, loading }: ManagerListProps) {
  if (loading && managers.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-8 text-center text-sm text-emerald-900">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        جاري تحميل بيانات مدراء الفروع...
      </div>
    );
  }
  if (managers.length === 0) return null;

  return (
    <section aria-label="كاش مدراء الفروع" className="space-y-3">
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="rounded-md bg-emerald-100 p-1.5 text-emerald-700"
          >
            <Briefcase className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              كاش مدراء الفروع
            </h2>
            <p className="text-xs text-muted-foreground">
              نقد في عُهدة المدير جاهز للإيداع البنكي.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          {managers.length}
        </span>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {managers.map((m) => {
          const meta = DRIVER_STATUS_AR[m.status];
          const isAtRisk = m.status === 'AT_RISK';
          return (
            <li
              key={m.driverId}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm ${
                isAtRisk
                  ? 'border-rose-200 bg-rose-50/60'
                  : 'border-emerald-200 bg-emerald-50/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`rounded-lg p-2 ${
                    isAtRisk
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <Briefcase className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {m.driverName ?? m.driverId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    مدير الفرع
                  </div>
                  <span
                    className={`mt-1 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.chip}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                    />
                    {meta.label}
                  </span>
                </div>
              </div>
              <div className="text-end">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  إجمالي العُهدة
                </div>
                <div
                  dir="ltr"
                  className={`text-xl font-bold tabular-nums ${
                    isAtRisk ? 'text-rose-950' : 'text-emerald-900'
                  }`}
                >
                  {formatKwdLabel(m.amount)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── 4. TOP RISK ─────────────────────────────────────────────────

function TopRiskCard({ topRisk }: { topRisk: CashIntelExecutiveTopRisk }) {
  return (
    <section
      aria-label="أولوية المتابعة"
      className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            أولوية المتابعة الآن
          </div>
          <div className="text-lg font-semibold text-rose-950">
            {topRisk.driverName ?? 'سائق غير معروف'}
          </div>
          <div className="text-sm text-rose-900">{topRisk.issue}</div>
        </div>
        <div
          dir="ltr"
          className="text-end text-2xl font-bold tabular-nums text-rose-950 sm:text-3xl"
        >
          {formatKwdLabel(topRisk.amount)}
        </div>
      </div>
    </section>
  );
}

// ─── 5. VERIFY SYSTEM ────────────────────────────────────────────

/**
 * Manual safety-layer trigger. OWNER + GM only.
 *
 * Runs `/api/cash-intelligence/verify` on demand and renders the
 * PASS/FAIL verdict inside a collapsible panel. Strictly read-only:
 * the backend synthesises in-memory scenarios and never touches
 * Prisma. The panel is collapsed by default so the dashboard stays
 * uncluttered for the executive view.
 */
function VerifySystemPanel() {
  const { token } = useAuth();
  const [result, setResult] = useState<CashIntelVerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const runVerify = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyCashIntelSystem(token);
      setResult(res);
      setOpen(true);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'تعذّر تشغيل الفحص';
      setError(msg);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const verdictTone =
    result === null
      ? 'border-border bg-card'
      : result.status === 'PASS'
        ? 'border-emerald-200 bg-emerald-50/50'
        : 'border-rose-200 bg-rose-50/60';

  return (
    <section
      aria-label="فحص سلامة النظام"
      className={`rounded-2xl border p-4 shadow-sm transition-colors ${verdictTone}`}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <div className="font-semibold text-foreground">فحص سلامة النظام</div>
            <div className="text-xs text-muted-foreground">
              يشغّل سيناريوهات اختبارية على طبقات التصنيف والمخاطر والقرار —
              للقراءة فقط، بدون أي تغيير على البيانات.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
            >
              {open ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={runVerify}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                جاري الفحص...
              </>
            ) : (
              <>تشغيل الفحص</>
            )}
          </button>
        </div>
      </div>

      {open && error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">تعذّر تشغيل الفحص</div>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      ) : null}

      {open && result ? <VerifyResult result={result} /> : null}
    </section>
  );
}

function VerifyResult({ result }: { result: CashIntelVerifyResponse }) {
  if (result.status === 'PASS') {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-2">
          <div className="font-semibold">
            النظام سليم — لا يوجد أي تعارض بين الطبقات.
          </div>
          <ul className="space-y-1 text-xs">
            {result.checks.map((c) => (
              <li key={c.scenario} dir="ltr" className="text-emerald-900/80">
                <span className="font-mono">
                  {c.scenario}: classified={c.classified} risk={c.risk}{' '}
                  executive={c.executive} (expected={c.expected})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <div className="font-semibold">
            رُصد تعارض في طبقات الذكاء المالي — يُمنع النشر.
          </div>
          <div className="text-xs">
            الطبقات لا تتفق على نفس النتيجة المتوقعة. راجع التفاصيل أدناه.
          </div>
        </div>
      </div>
      {result.mismatches.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {result.mismatches.map((m, idx) => (
            <li key={idx} className="rounded bg-rose-100/60 px-2 py-1 font-mono">
              {m}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-rose-200 bg-white/60">
        <table className="w-full text-xs">
          <thead className="bg-rose-100/40 text-rose-900/80">
            <tr>
              <th className="px-2 py-1 text-start font-semibold">السيناريو</th>
              <th className="px-2 py-1 text-start font-semibold">المتوقع</th>
              <th className="px-2 py-1 text-start font-semibold">classified</th>
              <th className="px-2 py-1 text-start font-semibold">risk</th>
              <th className="px-2 py-1 text-start font-semibold">executive</th>
              <th className="px-2 py-1 text-start font-semibold">النتيجة</th>
            </tr>
          </thead>
          <tbody>
            {result.checks.map((c) => (
              <tr key={c.scenario} className="border-t border-rose-100">
                <td className="px-2 py-1">{c.scenario}</td>
                <td dir="ltr" className="px-2 py-1 font-mono">
                  {c.expected}
                </td>
                <td dir="ltr" className="px-2 py-1 font-mono">
                  {c.classified}
                </td>
                <td dir="ltr" className="px-2 py-1 font-mono">
                  {c.risk}
                </td>
                <td dir="ltr" className="px-2 py-1 font-mono">
                  {c.executive}
                </td>
                <td className="px-2 py-1 font-semibold">
                  {c.ok ? 'سليم' : 'فشل'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 6. INTEGRITY AUDIT (cross-layer consistency) ───────────────

function IntegrityAuditPanel() {
  const { token } = useAuth();
  const [result, setResult] = useState<CashIntelIntegrityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const runAudit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runCashIntelIntegrityAudit(token);
      setResult(res);
      setOpen(true);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'تعذّر تشغيل الفحص الشامل';
      setError(msg);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const verdictTone =
    result === null
      ? 'border-border bg-card'
      : result.status === 'PASS'
        ? 'border-emerald-200 bg-emerald-50/50'
        : 'border-rose-200 bg-rose-50/60';

  return (
    <section
      aria-label="فحص اتساق الطبقات"
      className={`rounded-2xl border p-4 shadow-sm transition-colors ${verdictTone}`}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <div className="font-semibold text-foreground">
              فحص اتساق الطبقات (Integrity Audit)
            </div>
            <div className="text-xs text-muted-foreground">
              يقارن الأرقام والحالات بين <span dir="ltr">/classified</span>{' '}
              و<span dir="ltr">/risk</span> و<span dir="ltr">/executive</span>{' '}
              و<span dir="ltr">/live</span> — للقراءة فقط.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
            >
              {open ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={runAudit}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                جاري الفحص...
              </>
            ) : (
              <>تشغيل الفحص الشامل</>
            )}
          </button>
        </div>
      </div>

      {open && error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">تعذّر تشغيل الفحص الشامل</div>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      ) : null}

      {open && result ? <IntegrityResult result={result} /> : null}
    </section>
  );
}

function IntegrityResult({ result }: { result: CashIntelIntegrityResponse }) {
  const isPass = result.status === 'PASS';
  return (
    <div className="mt-3 space-y-3">
      <div
        className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
          isPass
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-rose-200 bg-rose-50 text-rose-900'
        }`}
      >
        {isPass ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="space-y-1">
          <div className="font-semibold">
            {isPass
              ? 'الطبقات متطابقة — لا يوجد أي تعارض في الأرقام أو الحالة.'
              : 'رُصد تعارض بين الطبقات — يجب المراجعة قبل الاعتماد على لوحة المعلومات.'}
          </div>
          <div className="text-xs opacity-80" dir="ltr">
            drivers={result.summary.driversChecked} · alerts=
            {result.summary.alertsChecked} · layers=
            {result.summary.layersChecked} · mismatches=
            {result.summary.mismatches} · warnings=
            {result.summary.warnings}
          </div>
        </div>
      </div>

      {result.criticalIssues.length > 0 ? (
        <IssueList
          title="تعارضات حرجة"
          tone="critical"
          issues={result.criticalIssues}
        />
      ) : null}
      {result.warnings.length > 0 ? (
        <IssueList
          title="ملاحظات (Warnings)"
          tone="warning"
          issues={result.warnings}
        />
      ) : null}
    </div>
  );
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'critical' | 'warning';
  issues: CashIntelIntegrityIssue[];
}) {
  const toneClasses =
    tone === 'critical'
      ? 'border-rose-200 bg-white/60 text-rose-900'
      : 'border-amber-200 bg-white/70 text-amber-900';
  return (
    <div className={`overflow-hidden rounded-lg border ${toneClasses}`}>
      <div
        className={`border-b px-3 py-1.5 text-xs font-semibold ${
          tone === 'critical'
            ? 'border-rose-200 bg-rose-100/50'
            : 'border-amber-200 bg-amber-100/50'
        }`}
      >
        {title} ({issues.length})
      </div>
      <ul className="divide-y divide-border/40 text-xs">
        {issues.map((issue, idx) => (
          <li key={`${issue.type}-${idx}`} className="space-y-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                {issue.type}
              </span>
              <span dir="ltr" className="text-muted-foreground">
                {issue.sourceA}
                {issue.sourceB ? ` ↔ ${issue.sourceB}` : ''}
              </span>
              {issue.delta ? (
                <span dir="ltr" className="text-muted-foreground/80">
                  Δ {issue.delta}
                </span>
              ) : null}
            </div>
            <div className="leading-relaxed">{issue.message}</div>
            {issue.expected || issue.found ? (
              <div className="text-[11px] opacity-80" dir="ltr">
                expected={issue.expected ?? '—'} · found={issue.found ?? '—'}
                {issue.driverId ? ` · driverId=${issue.driverId}` : ''}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

function severityRank(status: CashIntelClassifiedDriverStatus): number {
  if (status === 'AT_RISK') return 2;
  if (status === 'COMPLIANCE_ONLY') return 1;
  return 0;
}

function alertSeverityRank(s: 'INFO' | 'WARNING' | 'CRITICAL'): number {
  if (s === 'CRITICAL') return 3;
  if (s === 'WARNING') return 2;
  return 1;
}

export default ExecutiveDashboardPage;
