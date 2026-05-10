import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  Building2,
  ChevronDown,
  ChevronRight,
  HandCoins,
  Loader2,
  Printer,
  RefreshCw,
  Truck,
  Users,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  apiJson,
  type StaffDebtsResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import {
  FilterBar,
  FilterField,
  KpiCard,
  PageHeader,
} from '@/modules/shared/components/page';
import { cn } from '@/lib/utils';

type DebtStatus = 'ALL' | 'OVERDUE' | 'CURRENT';

/**
 * Dastur §3 — Staff Debts page (ACCOUNTANT + OWNER).
 * Strict scope: internal cash liabilities only.
 *   SECTION A — drivers holding field cash.
 *   SECTION B — branch managers with pending custody.
 * Customer debts, expenses, and profit metrics are intentionally excluded.
 */
export function StaffDebtsPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();

  // V19.2 — GENERAL_MANAGER inherits Accountant + Owner audit scope for
  // internal-cash liabilities. Sole source of truth = access-matrix
  // (`staffDebts.view`), so updates to who can see this page happen in
  // exactly one place.
  const allowed = can(user, 'staffDebts.view');

  const [report, setReport] = useState<StaffDebtsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();

  const [branchFilter, setBranchFilter] = useState<string>(
    () => searchParams.get('branch') || 'ALL',
  );
  const [nameFilter, setNameFilter] = useState<string>(
    () => searchParams.get('name') || '',
  );
  /*
   * V19.4 — Employee selector (GM + Accountant feature).
   * Encoded as 'ALL' | 'driver:<driverId>' | 'manager:<managerId>'. When a
   * specific employee is picked, the branch dropdown auto-hides (the
   * employee's branch is already implied).
   */
  const [employeeFilter, setEmployeeFilter] = useState<string>(
    () => searchParams.get('employee') || 'ALL',
  );
  const [statusFilter, setStatusFilter] = useState<DebtStatus>(() => {
    const raw = (searchParams.get('status') || 'ALL').toUpperCase();
    return raw === 'OVERDUE' || raw === 'CURRENT' ? (raw as DebtStatus) : 'ALL';
  });

  /*
   * Keep the URL in sync with active filters so the print-only QR points at
   * the exact same view. Scanning the code on a phone reopens the live
   * report with identical scope and up-to-the-second balances.
   */
  useEffect(() => {
    const next = new URLSearchParams();
    if (branchFilter && branchFilter !== 'ALL') next.set('branch', branchFilter);
    if (nameFilter.trim()) next.set('name', nameFilter.trim());
    if (employeeFilter && employeeFilter !== 'ALL')
      next.set('employee', employeeFilter);
    if (statusFilter !== 'ALL') next.set('status', statusFilter);
    setSearchParams(next, { replace: true });
  }, [branchFilter, nameFilter, employeeFilter, statusFilter, setSearchParams]);

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchFilter && branchFilter !== 'ALL') params.set('branch', branchFilter);
      if (nameFilter.trim()) params.set('name', nameFilter.trim());
      if (employeeFilter && employeeFilter !== 'ALL') {
        params.set('employee', employeeFilter);
      }
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const qs = params.toString();
      const data = await apiJson<StaffDebtsResponse>(
        `/api/manager-custody/staff-debts${qs ? `?${qs}` : ''}`,
        { token },
      );
      setReport(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, allowed, branchFilter, nameFilter, employeeFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const driverRows = report?.drivers ?? [];
  const managerRows = report?.managers ?? [];
  const branches = useMemo(() => report?.branches ?? [], [report?.branches]);
  const employeeOptions = report?.employeeOptions ?? [];
  const selectedEmployee = report?.selectedEmployee ?? null;
  const showBranchFilter = report?.showBranchFilter ?? employeeFilter === 'ALL';
  const totals = report?.totals;
  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) map.set(branch.id, branch.name);
    return map;
  }, [branches]);

  /*
   * Dastur §3 — QR verification URL.
   * Encodes the live `/staff-debts` route including the current filter query
   * string. Scanning the printed report on any authorised device reopens the
   * same view with real-time balances, so a printed snapshot can always be
   * cross-checked against the source of truth.
   */
  const qrUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams();
    if (branchFilter && branchFilter !== 'ALL') params.set('branch', branchFilter);
    if (nameFilter.trim()) params.set('name', nameFilter.trim());
    if (employeeFilter && employeeFilter !== 'ALL')
      params.set('employee', employeeFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    const qs = params.toString();
    return `${window.location.origin}/staff-debts${qs ? `?${qs}` : ''}`;
  }, [branchFilter, nameFilter, employeeFilter, statusFilter]);

  const appliedFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    /*
     * V19.4 — When an employee is locked, their own label replaces the
     * branch line on the printed header (the employee's branch is
     * already implied and shown per-row in the table).
     */
    if (selectedEmployee) {
      const kindLabel =
        selectedEmployee.kind === 'driver'
          ? t('staffDebts.employeeKindDriver')
          : t('staffDebts.employeeKindManager');
      parts.push(
        `${t('staffDebts.filterEmployee')}: ${selectedEmployee.label} (${kindLabel})`,
      );
    } else if (branchFilter && branchFilter !== 'ALL') {
      parts.push(
        `${t('staffDebts.filterBranch')}: ${
          branchNameById.get(branchFilter) ?? branchFilter
        }`,
      );
    }
    if (nameFilter.trim()) {
      parts.push(`${t('staffDebts.filterName')}: ${nameFilter.trim()}`);
    }
    if (statusFilter !== 'ALL') {
      parts.push(
        `${t('staffDebts.filterStatus')}: ${
          statusFilter === 'OVERDUE'
            ? t('staffDebts.statusOverdue')
            : t('staffDebts.statusCurrent')
        }`,
      );
    }
    if (parts.length === 0) return t('staffDebts.statusAll');
    return parts.join(' · ');
  }, [
    branchFilter,
    nameFilter,
    statusFilter,
    selectedEmployee,
    branchNameById,
    t,
  ]);

  const generatedAtLabel = useMemo(
    () => new Date(report?.generatedAt ?? Date.now()).toLocaleString('en-GB'),
    [report?.generatedAt],
  );

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div id="staff-debts-print-root" className="space-y-5">
      {/*
       * Print-only header with QR verification code. Hidden on screen via the
       * `.sd-print-only` utility and revealed only inside @media print.
       */}
      <div className="sd-print-only" aria-hidden>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            borderBottom: '2px solid #0f172a',
            paddingBottom: 8,
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#475569' }}>
              {t('staffDebts.printBrand')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {t('staffDebts.printReportTitle')}
            </div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              <strong>{t('staffDebts.printGeneratedAt')}:</strong>{' '}
              {generatedAtLabel}
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <strong>{t('staffDebts.printFiltersLabel')}:</strong>{' '}
              {appliedFiltersLabel}
            </div>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            {qrUrl ? (
              <QRCodeSVG
                value={qrUrl}
                size={76}
                includeMargin={false}
                level="M"
              />
            ) : null}
            <div
              style={{
                fontSize: 9,
                marginTop: 4,
                color: '#0f172a',
                maxWidth: 80,
                lineHeight: 1.2,
              }}
            >
              {t('staffDebts.printQrCaption')}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 10, color: '#475569', marginBottom: 12 }}>
          {t('staffDebts.printVerifyNote')}
        </p>
      </div>

      <div className="sd-screen-only space-y-5">
        <PageHeader
          className="!mb-0 border-0 pb-3"
          tone="orange"
          title={
            <span className="inline-flex items-center gap-2">
              <HandCoins
                className="h-6 w-6 shrink-0 text-orange-600 dark:text-orange-400"
                aria-hidden
              />
              {t('staffDebts.title')}
            </span>
          }
          subtitle={t('staffDebts.subtitle')}
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" aria-hidden />
                {t('staffDebts.print')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
                {t('staffDebts.refresh')}
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            tone="orange"
            label={t('staffDebts.kpiTotalPipeline', 'النقد قيد المسار')}
            value={formatKwdLabel(totals?.pipelineTotalKd ?? '0.0000')}
            icon={<Banknote className="h-4 w-4" aria-hidden />}
            loading={loading && report === null}
            deltaBadge={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t('staffDebts.kpiPipelineHint', {
                  defaultValue: '{{d}} سائق · {{m}} مدير/عهدة',
                  d: String(totals?.driverRowCount ?? 0),
                  m: String(totals?.managerRowCount ?? 0),
                })}
              </span>
            }
          />
          <KpiCard
            tone="blue"
            label={t('staffDebts.kpiWithDrivers', 'عند السائقين')}
            value={formatKwdLabel(totals?.driverTotalKd ?? '0.0000')}
            icon={<Truck className="h-4 w-4" aria-hidden />}
            loading={loading && report === null}
            deltaBadge={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t('staffDebts.kpiDriversHint', {
                  defaultValue: 'كاش + كي نت + رابط + أونلاين',
                })}
              </span>
            }
          />
          <KpiCard
            tone="purple"
            label={t('staffDebts.kpiWithManagers', 'عهدة المدراء')}
            value={formatKwdLabel(totals?.managerTotalKd ?? '0.0000')}
            icon={<Building2 className="h-4 w-4" aria-hidden />}
            loading={loading && report === null}
            deltaBadge={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t('staffDebts.kpiManagersHint', {
                  defaultValue: 'قبل اعتماد المحاسب',
                })}
              </span>
            }
          />
          <KpiCard
            tone="red"
            label={t('staffDebts.kpiOverdue', 'يحتاج متابعة عاجلة')}
            value={String(totals?.totalOverdueCount ?? 0)}
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            loading={loading && report === null}
            deltaBadge={
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t('staffDebts.kpiOverdueHint', {
                  defaultValue: '{{d}} سائق · {{m}} مدير',
                  d: String(totals?.overdueDriverCount ?? 0),
                  m: String(totals?.overdueManagerCount ?? 0),
                })}
              </span>
            }
          />
        </div>

        {/*
         * V19.4 — Branch hidden when a specific employee is picked. Employee
         * list merges drivers w/ pending balance + managers w/ open custody.
         */}
        <FilterBar
          className="mb-0"
          actions={
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('staffDebts.filterResultCount', {
                defaultValue: '{{d}} + {{m}} سطر',
                d: String(driverRows.length),
                m: String(managerRows.length),
              })}
            </span>
          }
        >
          {showBranchFilter ? (
            <FilterField
              className="min-w-[10rem] max-w-full sm:max-w-xs"
              label={t('staffDebts.filterBranch')}
            >
              <Select
                value={branchFilter}
                onValueChange={(v) => {
                  setBranchFilter(v ?? 'ALL');
                  setEmployeeFilter('ALL');
                }}
              >
                <SelectTrigger id="sd-branch" className="h-9 w-full min-w-0">
                  <SelectValue placeholder={t('staffDebts.allBranches')}>
                    {branchFilter === 'ALL'
                      ? t('staffDebts.allBranches')
                      : ((branches ?? []).find((b) => b.id === branchFilter)
                          ?.name ?? t('staffDebts.allBranches'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">
                    {t('staffDebts.allBranches')}
                  </SelectItem>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          ) : null}
          <FilterField
            className="min-w-[12rem] max-w-full sm:min-w-[14rem]"
            label={t('staffDebts.filterEmployee')}
          >
            <Select
              value={employeeFilter}
              onValueChange={(v) => setEmployeeFilter(v ?? 'ALL')}
            >
              <SelectTrigger id="sd-employee" className="h-9 w-full min-w-0">
                <SelectValue
                  placeholder={t('staffDebts.filterEmployeePlaceholder')}
                >
                  {employeeFilter === 'ALL'
                    ? t('staffDebts.allEmployees')
                    : (employeeOptions.find((o) => o.value === employeeFilter)
                        ?.label ?? t('staffDebts.filterEmployeePlaceholder'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  {t('staffDebts.allEmployees')}
                </SelectItem>
                {employeeOptions.map((o) => {
                  const branchLabel = o.branchId
                    ? branchNameById.get(o.branchId) ?? ''
                    : '';
                  const kindLabel =
                    o.kind === 'driver'
                      ? t('staffDebts.employeeKindDriver')
                      : t('staffDebts.employeeKindManager');
                  return (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex flex-col">
                        <span>{o.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {[kindLabel, branchLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField
            className="min-w-[8rem] max-w-full sm:max-w-[11rem]"
            label={t('staffDebts.filterName')}
          >
            <Input
              id="sd-name"
              className="h-9"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={t('staffDebts.filterNamePlaceholder')}
              autoComplete="off"
            />
          </FilterField>
          <FilterField
            className="min-w-[8.5rem] max-w-full sm:max-w-[10rem]"
            label={t('staffDebts.filterStatus')}
          >
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter((v as DebtStatus) ?? 'ALL')}
            >
              <SelectTrigger id="sd-status" className="h-9 w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('staffDebts.statusAll')}</SelectItem>
                <SelectItem value="OVERDUE">
                  {t('staffDebts.statusOverdue')}
                </SelectItem>
                <SelectItem value="CURRENT">
                  {t('staffDebts.statusCurrent')}
                </SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </FilterBar>
      </div>

      {/* SECTION A — Drivers (Combined Pending Invoices: Cash + K-Net + Link + Online) */}
      <Card className="overflow-hidden border border-border border-l-4 border-l-sky-500 bg-card shadow-sm sm:rounded-2xl">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <span className="inline-flex items-center gap-2 text-sky-700 dark:text-sky-300">
                <Truck className="h-4 w-4 shrink-0" aria-hidden />
                {t('staffDebts.driversSectionTitle')}
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {driverRows.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('staffDebts.driversSectionHintCombined')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-sm font-semibold tabular-nums text-foreground/80">
              {t('staffDebts.sectionTotal')}:{' '}
              <span className="text-foreground">
                {formatKwdLabel(totals?.driverTotalKd ?? '0.0000')}
              </span>
            </p>
            <p className="flex flex-wrap justify-end gap-x-3 text-xs tabular-nums text-muted-foreground">
              <span>
                {t('staffDebts.methodCash')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(totals?.driverBreakdown.cashKd ?? '0.0000')}
                </span>
              </span>
              <span>
                {t('staffDebts.methodKnet')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(totals?.driverBreakdown.knetKd ?? '0.0000')}
                </span>
              </span>
              <span>
                {t('staffDebts.methodLink')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(totals?.driverBreakdown.linkKd ?? '0.0000')}
                </span>
              </span>
              {totals?.driverBreakdown.onlineKd !== '0.0000' ? (
                <span>
                  {t('staffDebts.methodOnline')}:{' '}
                  <span className="text-foreground/90">
                    {formatKwdLabel(totals?.driverBreakdown.onlineKd ?? '0.0000')}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading && !report ? (
            <div className="p-6">
              <Skeleton className="h-24 w-full rounded" />
            </div>
          ) : driverRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t('staffDebts.driversEmptyCombined')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 sd-screen-only" />
                  <TableHead>{t('staffDebts.colName')}</TableHead>
                  <TableHead>{t('staffDebts.colBranch')}</TableHead>
                  <TableHead className="text-end">
                    {t('staffDebts.colPendingInvoices')}
                  </TableHead>
                  <TableHead className="text-end sd-screen-only">
                    {t('staffDebts.colInvoiceCount')}
                  </TableHead>
                  <TableHead>{t('staffDebts.colBreakdown')}</TableHead>
                  <TableHead>{t('staffDebts.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverRows.map((d) => {
                  const overdue = d.isOverdue;
                  const total = d.pendingTotalKd;
                  const cash = d.pendingCashKd;
                  const knet = d.pendingKnetKd;
                  const link = d.pendingLinkKd;
                  const online = d.pendingOnlineKd;
                  const breakdownTitle = [
                    `${t('staffDebts.methodCash')}: ${formatKwdLabel(cash)}`,
                    `${t('staffDebts.methodKnet')}: ${formatKwdLabel(knet)}`,
                    `${t('staffDebts.methodLink')}: ${formatKwdLabel(link)}`,
                    online !== '0.0000'
                      ? `${t('staffDebts.methodOnline')}: ${formatKwdLabel(online)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const isOpen = expandedDriver === d.driverId;
                  return (
                    <Fragment key={d.driverId}>
                      <TableRow
                        className={cn(overdue && 'bg-red-50/60 sd-row-overdue')}
                      >
                        <TableCell className="sd-screen-only w-8 align-top">
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-muted"
                            aria-label={
                              isOpen
                                ? t('staffDebts.collapse')
                                : t('staffDebts.expand')
                            }
                            onClick={() =>
                              setExpandedDriver((cur) =>
                                cur === d.driverId ? null : d.driverId,
                              )
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {d.fullName}
                          <span className="block text-xs text-muted-foreground/70">
                            @{d.username}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-foreground/80">
                          {d.branchId
                            ? branchNameById.get(d.branchId) ?? '—'
                            : '—'}
                        </TableCell>
                        <TableCell
                          className="text-end font-semibold tabular-nums"
                          title={`${t('staffDebts.breakdownTooltip')} — ${breakdownTitle}`}
                        >
                          {formatKwdLabel(total)}
                        </TableCell>
                        <TableCell className="sd-screen-only text-end tabular-nums">
                          {d.pendingInvoiceCount}
                        </TableCell>
                        <TableCell
                          className="whitespace-normal text-xs text-foreground/80"
                          title={breakdownTitle}
                        >
                          <span className="inline-flex flex-wrap gap-x-2 gap-y-1 tabular-nums">
                            <span>
                              <span className="text-muted-foreground">
                                {t('staffDebts.methodCash')}:
                              </span>{' '}
                              {formatKwdLabel(cash)}
                            </span>
                            <span>
                              <span className="text-muted-foreground">
                                {t('staffDebts.methodKnet')}:
                              </span>{' '}
                              {formatKwdLabel(knet)}
                            </span>
                            <span>
                              <span className="text-muted-foreground">
                                {t('staffDebts.methodLink')}:
                              </span>{' '}
                              {formatKwdLabel(link)}
                            </span>
                            {online !== '0.0000' ? (
                              <span>
                                <span className="text-muted-foreground">
                                  {t('staffDebts.methodOnline')}:
                                </span>{' '}
                                {formatKwdLabel(online)}
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={overdue ? 'destructive' : 'secondary'}
                            className={cn(
                              'font-normal',
                              overdue ? 'sd-badge-overdue' : 'sd-badge-current',
                            )}
                          >
                            {overdue
                              ? t('staffDebts.statusOverdue')
                              : t('staffDebts.statusCurrent')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow className="sd-screen-only bg-muted/50">
                          <TableCell />
                          <TableCell colSpan={6} className="py-3">
                            <div className="grid gap-2 sm:grid-cols-4">
                              <BreakdownItem
                                label={t('staffDebts.methodCash')}
                                value={cash}
                              />
                              <BreakdownItem
                                label={t('staffDebts.methodKnet')}
                                value={knet}
                              />
                              <BreakdownItem
                                label={t('staffDebts.methodLink')}
                                value={link}
                              />
                              <BreakdownItem
                                label={t('staffDebts.methodOnline')}
                                value={online}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SECTION B — Managers */}
      <Card className="overflow-hidden border border-border border-l-4 border-l-violet-500 bg-card shadow-sm sm:rounded-2xl">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
              <span className="inline-flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                {t('staffDebts.managersSectionTitle')}
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {managerRows.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('staffDebts.managersSectionHint')}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-foreground/80">
            {t('staffDebts.sectionTotal')}:{' '}
            <span className="text-foreground">
              {formatKwdLabel(totals?.managerTotalKd ?? '0.0000')}
            </span>
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading && !report ? (
            <div className="p-6">
              <Skeleton className="h-24 w-full rounded" />
            </div>
          ) : managerRows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t('staffDebts.managersEmpty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('staffDebts.colName')}</TableHead>
                  <TableHead>{t('staffDebts.colBranch')}</TableHead>
                  <TableHead className="text-end">
                    {t('staffDebts.colPendingCustody')}
                  </TableHead>
                  <TableHead className="text-end">
                    {t('staffDebts.colAgeHours')}
                  </TableHead>
                  <TableHead>{t('staffDebts.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managerRows.map((c) => (
                  <TableRow
                    key={c.id}
                    className={cn(c.isOverdue && 'bg-red-50/60 sd-row-overdue')}
                  >
                    <TableCell className="font-medium">
                      {c.managerName}
                      <span className="block text-xs text-muted-foreground/70">
                        @{c.managerUsername}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground/80">
                      {c.branchName ?? '—'}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(c.amountKd)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {c.ageHours.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.isOverdue ? 'destructive' : 'secondary'}
                        className={cn(
                          'font-normal',
                          c.isOverdue ? 'sd-badge-overdue' : 'sd-badge-current',
                        )}
                      >
                        {c.isOverdue
                          ? t('staffDebts.statusOverdue')
                          : t('staffDebts.statusCurrent')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/*
       * Dastur §3 — Print-only signature block. Rendered at the bottom of the
       * A4 page so the printed report carries the three-way sign-off required
       * before any manual adjustment: issuing employee, reconciling
       * accountant, and management approval.
       */}
      <div className="sd-print-only sd-signature-block" aria-hidden>
        <div
          style={{
            marginTop: 24,
            paddingTop: 12,
            borderTop: '1px solid #0f172a',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
          }}
        >
          {[
            t('staffDebts.signEmployee'),
            t('staffDebts.signAccountant'),
            t('staffDebts.signManagement'),
          ].map((label) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div
                style={{
                  height: 40,
                  borderBottom: '1px solid #0f172a',
                  marginBottom: 4,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dastur §3 — Single payment-method cell in the expanded driver row.
 * Renders a labelled, tabular-aligned amount so every method sits in a
 * consistent grid regardless of which methods are non-zero.
 */
function BreakdownItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums text-foreground">
        {formatKwdLabel(value)}
      </div>
    </div>
  );
}
