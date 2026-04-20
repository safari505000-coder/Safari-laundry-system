import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
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
  getManagerCustodyAging,
  type BranchRow,
  type DriverBalanceResponse,
  type DriverBalanceRow,
  type ManagerCashCustodyRow,
  type ManagerCustodyAgingResponse,
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
import { Label } from '@/modules/shared/components/ui/label';
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
import { cn } from '@/lib/utils';

type DebtStatus = 'ALL' | 'OVERDUE' | 'CURRENT';

const HOUR_MS = 60 * 60 * 1000;
const OVERDUE_MS = 24 * HOUR_MS;

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function driverShiftAgeMs(row: DriverBalanceRow, now: number): number | null {
  if (!row.shiftStartedAt) return null;
  const started = Date.parse(row.shiftStartedAt);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, now - started);
}

/**
 * Dastur §3 — Combined "pending invoice" liability per driver: every
 * COMPLETED invoice (CASH + K-Net + Payment Link + Online) that is still in
 * PAID_TO_DRIVER state (not yet accountant-verified). Returns the total in KD.
 */
function driverPendingTotalKd(row: DriverBalanceRow): number {
  return toNum(row.pendingTotalKd);
}

/**
 * Dastur §3 — Driver is "overdue" if they still have ANY pending unverified
 * invoice AND either:
 *   • no active shift (shift ended without reconciliation), OR
 *   • the active shift has been running for ≥ 24h without reconciliation.
 * Otherwise, any non-zero pending total is flagged as "current" (in-flight).
 */
function isDriverOverdue(row: DriverBalanceRow, now: number): boolean {
  if (driverPendingTotalKd(row) <= 0) return false;
  if (!row.currentShiftId) return true;
  const age = driverShiftAgeMs(row, now);
  return age != null && age >= OVERDUE_MS;
}

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

  const [drivers, setDrivers] = useState<DriverBalanceRow[] | null>(null);
  const [custody, setCustody] = useState<ManagerCashCustodyRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
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
      const [drv, agingRes, branchRows] = await Promise.all([
        apiJson<DriverBalanceResponse>('/api/finance/driver-balance', { token }),
        getManagerCustodyAging(token),
        apiJson<BranchRow[]>('/api/branches', { token }),
      ]);
      setDrivers(drv.drivers ?? []);
      setCustody(
        (agingRes as ManagerCustodyAgingResponse).rows.filter(
          (r) => r.status !== 'VERIFIED',
        ),
      );
      setBranches(branchRows ?? []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => Date.now(), [drivers, custody]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches ?? []) map.set(b.id, b.name);
    return map;
  }, [branches]);

  const trimmedName = nameFilter.trim().toLocaleLowerCase();

  /*
   * V19.4 — Decode employeeFilter once so downstream logic doesn't repeat
   * the string split. 'ALL' → no employee constraint; otherwise one of
   * { kind: 'driver' | 'manager', id }.
   */
  const employeePick = useMemo<
    { kind: 'driver' | 'manager'; id: string } | null
  >(() => {
    if (!employeeFilter || employeeFilter === 'ALL') return null;
    const [kind, id] = employeeFilter.split(':');
    if ((kind === 'driver' || kind === 'manager') && id) {
      return { kind, id };
    }
    return null;
  }, [employeeFilter]);

  /*
   * V19.4 — Unified employee picker. Drivers with pending balance and
   * unique managers with open custody are merged, deduped by (kind, id),
   * and narrowed to the active branch if one is selected. This is what
   * populates the "الموظف" dropdown; when a branch is picked, only
   * employees belonging to that branch remain, exactly as requested.
   */
  type EmployeeOption = {
    value: string;
    label: string;
    branchId: string | null;
    kind: 'driver' | 'manager';
  };

  const employeeOptions = useMemo<EmployeeOption[]>(() => {
    const seen = new Set<string>();
    const out: EmployeeOption[] = [];
    for (const d of drivers ?? []) {
      if (driverPendingTotalKd(d) <= 0) continue;
      const value = `driver:${d.driverId}`;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({
        value,
        label: d.fullName,
        branchId: d.branchId,
        kind: 'driver',
      });
    }
    for (const c of custody ?? []) {
      const value = `manager:${c.managerId}`;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({
        value,
        label: c.managerName,
        branchId: c.branchId,
        kind: 'manager',
      });
    }
    const scoped =
      branchFilter !== 'ALL'
        ? out.filter((o) => o.branchId === branchFilter)
        : out;
    return scoped.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [drivers, custody, branchFilter]);

  const selectedEmployee = useMemo<EmployeeOption | null>(() => {
    if (!employeePick) return null;
    return (
      employeeOptions.find((o) => o.value === employeeFilter) ??
      // fall back: the employee may belong to a branch that has since
      // been excluded by the branch filter; look them up globally so
      // the picked row still renders correctly.
      (() => {
        for (const d of drivers ?? []) {
          if (employeePick.kind === 'driver' && d.driverId === employeePick.id)
            return {
              value: employeeFilter,
              label: d.fullName,
              branchId: d.branchId,
              kind: 'driver' as const,
            };
        }
        for (const c of custody ?? []) {
          if (
            employeePick.kind === 'manager' &&
            c.managerId === employeePick.id
          )
            return {
              value: employeeFilter,
              label: c.managerName,
              branchId: c.branchId,
              kind: 'manager' as const,
            };
        }
        return null;
      })()
    );
  }, [employeeOptions, employeeFilter, employeePick, drivers, custody]);

  /*
   * V19.4 — When an employee is picked, hide the branch select entirely
   * (the employee's branch is implicit). Accountant/GM still see the
   * branch on each row in the table, so no information is lost.
   */
  const showBranchFilter = !employeePick;

  const driverRows = useMemo(() => {
    const list = (drivers ?? []).filter((d) => driverPendingTotalKd(d) > 0);
    return list.filter((d) => {
      // Employee lock trumps every other filter in its own section.
      if (employeePick) {
        if (employeePick.kind !== 'driver') return false;
        if (d.driverId !== employeePick.id) return false;
      } else if (branchFilter !== 'ALL' && d.branchId !== branchFilter) {
        return false;
      }
      if (trimmedName && !d.fullName.toLocaleLowerCase().includes(trimmedName))
        return false;
      const overdue = isDriverOverdue(d, now);
      if (statusFilter === 'OVERDUE' && !overdue) return false;
      if (statusFilter === 'CURRENT' && overdue) return false;
      return true;
    });
  }, [drivers, branchFilter, employeePick, trimmedName, statusFilter, now]);

  const managerRows = useMemo(() => {
    return (custody ?? []).filter((c) => {
      if (employeePick) {
        if (employeePick.kind !== 'manager') return false;
        if (c.managerId !== employeePick.id) return false;
      } else if (branchFilter !== 'ALL' && c.branchId !== branchFilter) {
        return false;
      }
      if (
        trimmedName &&
        !c.managerName.toLocaleLowerCase().includes(trimmedName)
      )
        return false;
      if (statusFilter === 'OVERDUE' && !c.isOverdue) return false;
      if (statusFilter === 'CURRENT' && c.isOverdue) return false;
      return true;
    });
  }, [custody, branchFilter, employeePick, trimmedName, statusFilter]);

  const driverTotal = useMemo(
    () => driverRows.reduce((sum, r) => sum + driverPendingTotalKd(r), 0),
    [driverRows],
  );

  const driverBreakdownTotals = useMemo(() => {
    return driverRows.reduce(
      (acc, r) => {
        acc.cash += toNum(r.pendingCashKd);
        acc.knet += toNum(r.pendingKnetKd);
        acc.link += toNum(r.pendingLinkKd);
        acc.online += toNum(r.pendingOnlineKd);
        return acc;
      },
      { cash: 0, knet: 0, link: 0, online: 0 },
    );
  }, [driverRows]);

  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  const managerTotal = useMemo(
    () => managerRows.reduce((sum, r) => sum + toNum(r.amountKd), 0),
    [managerRows],
  );

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
    () => new Date(now).toLocaleString(),
    [now],
  );

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div id="staff-debts-print-root" className="space-y-6">
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

      <header className="sd-screen-only flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <HandCoins className="h-6 w-6 text-primary" aria-hidden />
            {t('staffDebts.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('staffDebts.subtitle')}</p>
        </div>
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
      </header>

      {/* Filters — interactive; hidden in print (summary appears in print header) */}
      <Card className="sd-screen-only border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t('staffDebts.filtersTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/*
           * V19.4 — Branch select is hidden when a specific employee is
           * picked, because the employee's branch is already implied and
           * rendered on every row. Picking a branch resets the employee
           * filter so the two pickers never disagree.
           */}
          {showBranchFilter ? (
            <div className="space-y-1.5">
              <Label htmlFor="sd-branch">{t('staffDebts.filterBranch')}</Label>
              <Select
                value={branchFilter}
                onValueChange={(v) => {
                  setBranchFilter(v ?? 'ALL');
                  setEmployeeFilter('ALL');
                }}
              >
                <SelectTrigger id="sd-branch">
                  <SelectValue />
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
            </div>
          ) : null}
          {/*
           * V19.4 — Employee dropdown. Populated from drivers with pending
           * balance + managers with open custody, narrowed to the active
           * branch when one is set. Selecting a specific employee hides
           * the branch picker above.
           */}
          <div className="space-y-1.5">
            <Label htmlFor="sd-employee">
              {t('staffDebts.filterEmployee')}
            </Label>
            <Select
              value={employeeFilter}
              onValueChange={(v) => setEmployeeFilter(v ?? 'ALL')}
            >
              <SelectTrigger id="sd-employee">
                <SelectValue
                  placeholder={t('staffDebts.filterEmployeePlaceholder')}
                />
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sd-name">{t('staffDebts.filterName')}</Label>
            <Input
              id="sd-name"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={t('staffDebts.filterNamePlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sd-status">{t('staffDebts.filterStatus')}</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter((v as DebtStatus) ?? 'ALL')}
            >
              <SelectTrigger id="sd-status">
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
          </div>
        </CardContent>
      </Card>

      {/* SECTION A — Drivers (Combined Pending Invoices: Cash + K-Net + Link + Online) */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-primary" aria-hidden />
              {t('staffDebts.driversSectionTitle')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('staffDebts.driversSectionHintCombined')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-sm font-semibold tabular-nums text-foreground/80">
              {t('staffDebts.sectionTotal')}:{' '}
              <span className="text-foreground">
                {formatKwdLabel(driverTotal.toFixed(4))}
              </span>
            </p>
            <p className="flex flex-wrap justify-end gap-x-3 text-xs tabular-nums text-muted-foreground">
              <span>
                {t('staffDebts.methodCash')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(driverBreakdownTotals.cash.toFixed(4))}
                </span>
              </span>
              <span>
                {t('staffDebts.methodKnet')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(driverBreakdownTotals.knet.toFixed(4))}
                </span>
              </span>
              <span>
                {t('staffDebts.methodLink')}:{' '}
                <span className="text-foreground/90">
                  {formatKwdLabel(driverBreakdownTotals.link.toFixed(4))}
                </span>
              </span>
              {driverBreakdownTotals.online > 0 ? (
                <span>
                  {t('staffDebts.methodOnline')}:{' '}
                  <span className="text-foreground/90">
                    {formatKwdLabel(driverBreakdownTotals.online.toFixed(4))}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading && !drivers ? (
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
                  const overdue = isDriverOverdue(d, now);
                  const total = driverPendingTotalKd(d);
                  const cash = toNum(d.pendingCashKd);
                  const knet = toNum(d.pendingKnetKd);
                  const link = toNum(d.pendingLinkKd);
                  const online = toNum(d.pendingOnlineKd);
                  const breakdownTitle = [
                    `${t('staffDebts.methodCash')}: ${formatKwdLabel(cash.toFixed(4))}`,
                    `${t('staffDebts.methodKnet')}: ${formatKwdLabel(knet.toFixed(4))}`,
                    `${t('staffDebts.methodLink')}: ${formatKwdLabel(link.toFixed(4))}`,
                    online > 0
                      ? `${t('staffDebts.methodOnline')}: ${formatKwdLabel(online.toFixed(4))}`
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
                          {formatKwdLabel(total.toFixed(4))}
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
                              {formatKwdLabel(cash.toFixed(4))}
                            </span>
                            <span>
                              <span className="text-muted-foreground">
                                {t('staffDebts.methodKnet')}:
                              </span>{' '}
                              {formatKwdLabel(knet.toFixed(4))}
                            </span>
                            <span>
                              <span className="text-muted-foreground">
                                {t('staffDebts.methodLink')}:
                              </span>{' '}
                              {formatKwdLabel(link.toFixed(4))}
                            </span>
                            {online > 0 ? (
                              <span>
                                <span className="text-muted-foreground">
                                  {t('staffDebts.methodOnline')}:
                                </span>{' '}
                                {formatKwdLabel(online.toFixed(4))}
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
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              {t('staffDebts.managersSectionTitle')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('staffDebts.managersSectionHint')}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-foreground/80">
            {t('staffDebts.sectionTotal')}:{' '}
            <span className="text-foreground">
              {formatKwdLabel(managerTotal.toFixed(4))}
            </span>
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading && !custody ? (
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
function BreakdownItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums text-foreground">
        {formatKwdLabel(value.toFixed(4))}
      </div>
    </div>
  );
}
