import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  HandCoins,
  Landmark,
  Loader2,
  Printer,
  RefreshCw,
  Truck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  apiJson,
  getDriverCashTrace,
  type BranchRow,
  type DriverCashTraceBag,
  type DriverCashTraceDriver,
  type DriverCashTraceResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
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
import { PageHeader } from '@/modules/shared/components/page/page-header';
import { KpiCard } from '@/modules/shared/components/page/kpi-card';
import {
  FilterBar,
  FilterField,
} from '@/modules/shared/components/page/filter-bar';
import { cn } from '@/lib/utils';

const ALL_BRANCHES = 'ALL' as const;
const ALL_DRIVERS = 'ALL' as const;

type QuickRange = 'today' | 'yesterday' | '7d' | '30d';

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toISOString();
}

function endOfDay(iso: string): string {
  return new Date(`${iso}T23:59:59.999`).toISOString();
}

function quickRangeToDates(q: QuickRange): { from: string; to: string } {
  const now = new Date();
  const today = toInputDate(now);
  if (q === 'today') return { from: today, to: today };
  if (q === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = toInputDate(y);
    return { from: ys, to: ys };
  }
  const back = new Date(now);
  back.setDate(back.getDate() - (q === '7d' ? 6 : 29));
  return { from: toInputDate(back), to: today };
}

/**
 * V19.10 — Driver Cash Trace page.
 *
 * Answers: "How much cash did this driver collect on day X, did he hand
 * it to a branch manager, and did it reach the bank?"
 *
 * Stages shown, per driver:
 *   1) Collected from customers (COMPLETED + CASH orders).
 *   2) Handed to branch manager (ManagerCashCustody bag created).
 *   3) Deposit slip uploaded (AWAITING_VERIFICATION).
 *   4) Verified at bank (VERIFIED — cycle closed).
 *   5) Still with driver — `collected − handed`. The red KPI.
 *
 * OWNER / GENERAL_MANAGER / ACCOUNTANT only.
 */
export function DriverCashTracePage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { user, token } = useAuth();
  const canView = can(user, 'driverCashTrace.view');

  const initial = useMemo(() => quickRangeToDates('today'), []);
  const [fromDate, setFromDate] = useState<string>(initial.from);
  const [toDate, setToDate] = useState<string>(initial.to);
  const [branchId, setBranchId] = useState<string>(ALL_BRANCHES);
  const [selectedDriverId, setSelectedDriverId] =
    useState<string>(ALL_DRIVERS);
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [data, setData] = useState<DriverCashTraceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const d = await getDriverCashTrace(token, {
        from: startOfDay(fromDate),
        to: endOfDay(toDate),
        branchId: branchId !== ALL_BRANCHES ? branchId : undefined,
      });
      setData(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('common.networkError', 'Network error'));
    } finally {
      setLoading(false);
    }
  }, [token, canView, fromDate, toDate, branchId, t]);

  useEffect(() => {
    if (!token || !canView) return;
    apiJson<BranchRow[]>('/api/branches', { token })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [token, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return <Navigate to="/" replace />;

  const applyQuick = (q: QuickRange) => {
    const r = quickRangeToDates(q);
    setFromDate(r.from);
    setToDate(r.to);
  };

  const fmtDateTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '—';

  // V19.10 — sorted driver list for the picker. Sorted by name for
  // a stable, scannable dropdown even when the backend returns them
  // by activity.
  const driverOptions = useMemo(() => {
    const arr = [...(data?.drivers ?? [])];
    arr.sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
    );
    return arr;
  }, [data]);

  // If the currently-selected driver drops out of the response
  // (e.g. user changed the date range), fall back to "all drivers"
  // so the Select never shows a stale id.
  useEffect(() => {
    if (selectedDriverId === ALL_DRIVERS) return;
    if (!data) return;
    const exists = data.drivers.some((d) => d.driverId === selectedDriverId);
    if (!exists) setSelectedDriverId(ALL_DRIVERS);
  }, [data, selectedDriverId]);

  const filteredDrivers = useMemo(() => {
    if (!data) return [];
    if (selectedDriverId === ALL_DRIVERS) return data.drivers;
    return data.drivers.filter((d) => d.driverId === selectedDriverId);
  }, [data, selectedDriverId]);

  return (
    <div className="space-y-5">
      <PageHeader
        tone="blue"
        title={t('driverCashTrace.title', 'Driver Cash Trace')}
        subtitle={t(
          'driverCashTrace.subtitle',
          'Follow every KD from the driver\u2019s hand to the corporate bank account.',
        )}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ms-1">{t('common.refresh', 'Refresh')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              <span className="ms-1">{t('common.print', 'Print')}</span>
            </Button>
          </>
        }
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
        {t('accountingHints.cashTraceDates')}
      </div>

      <FilterBar>
        <FilterField label={t('reports.from', 'From')}>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9"
          />
        </FilterField>
        <FilterField label={t('reports.to', 'To')}>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9"
          />
        </FilterField>
        <FilterField label={t('driverCashTrace.branch', 'Branch')}>
          <Select
            value={branchId}
            onValueChange={(v) => setBranchId(v ?? ALL_BRANCHES)}
          >
            <SelectTrigger className="h-9 w-48">
              {/*
               * V19.10 — explicit display so Radix never falls back to
               * rendering the raw UUID when branches load asynchronously
               * after the Select first mounts.
               */}
              <SelectValue
                placeholder={t(
                  'driverCashTrace.allBranches',
                  'All branches',
                )}
              >
                {branchId === ALL_BRANCHES
                  ? t('driverCashTrace.allBranches', 'All branches')
                  : (branches?.find((b) => b.id === branchId)?.name ??
                    t('driverCashTrace.allBranches', 'All branches'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES}>
                {t('driverCashTrace.allBranches', 'All branches')}
              </SelectItem>
              {(branches ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t('driverCashTrace.searchDriver', 'Driver')}>
          <Select
            value={selectedDriverId}
            onValueChange={(v) => setSelectedDriverId(v ?? ALL_DRIVERS)}
          >
            <SelectTrigger className="h-9 w-56">
              <SelectValue
                placeholder={t('driverCashTrace.allDrivers', 'All drivers')}
              >
                {selectedDriverId === ALL_DRIVERS
                  ? t('driverCashTrace.allDrivers', 'All drivers')
                  : (driverOptions.find(
                      (d) => d.driverId === selectedDriverId,
                    )?.fullName ??
                    t('driverCashTrace.allDrivers', 'All drivers'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DRIVERS}>
                {t('driverCashTrace.allDrivers', 'All drivers')}
              </SelectItem>
              {driverOptions.map((d) => (
                <SelectItem key={d.driverId} value={d.driverId}>
                  <span className="flex flex-col">
                    <span>{d.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      @{d.username}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t('reports.quickRange', 'Quick range')}>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyQuick('today')}
            >
              {t('reports.quickRangeToday', 'Today')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyQuick('yesterday')}
            >
              {t('reports.quickRangeYesterday', 'Yesterday')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyQuick('7d')}
            >
              {t('reports.quickRange7d', 'Last 7 days')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyQuick('30d')}
            >
              {t('reports.quickRange30d', 'Last 30 days')}
            </Button>
          </div>
        </FilterField>
      </FilterBar>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          tone="green"
          label={t('driverCashTrace.kpiCollected', 'Collected from customers')}
          icon={<Banknote className="h-4 w-4" />}
          loading={loading}
          value={
            data ? formatKwdLabel(data.kpis.totalCollectedKd) : '—'
          }
          deltaBadge={
            data
              ? t(
                  'driverCashTrace.kpiCollectedHint',
                  '{{count}} order(s) in window',
                  { count: data.kpis.totalCollectedOrderCount },
                )
              : undefined
          }
        />
        <KpiCard
          tone="blue"
          label={t('driverCashTrace.kpiHandedToManager', 'Handed to manager')}
          icon={<HandCoins className="h-4 w-4" />}
          loading={loading}
          value={
            data ? formatKwdLabel(data.kpis.totalHandedToManagerKd) : '—'
          }
          deltaBadge={
            data
              ? t(
                  'driverCashTrace.kpiBagsHint',
                  '{{count}} custody bag(s)',
                  { count: data.kpis.totalBagCount },
                )
              : undefined
          }
        />
        <KpiCard
          tone="red"
          label={t(
            'driverCashTrace.kpiPendingDriver',
            'Still with driver',
          )}
          icon={<Truck className="h-4 w-4" />}
          loading={loading}
          value={
            data ? formatKwdLabel(data.kpis.totalPendingWithDriverKd) : '—'
          }
          deltaBadge={t(
            'driverCashTrace.kpiPendingDriverHint',
            'Not yet handed over',
          )}
        />
        <KpiCard
          tone="orange"
          label={t(
            'driverCashTrace.kpiPendingManager',
            'With manager / awaiting bank',
          )}
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
          value={
            data
              ? formatKwdLabel(
                  (
                    Number(data.kpis.totalPendingAtManagerKd) +
                    Number(data.kpis.totalAwaitingVerificationKd)
                  ).toFixed(4),
                )
              : '—'
          }
          deltaBadge={
            data
              ? t(
                  'driverCashTrace.kpiPendingManagerHint',
                  'Pending {{pending}} · Slip {{slip}}',
                  {
                    pending: formatKwdLabel(data.kpis.totalPendingAtManagerKd),
                    slip: formatKwdLabel(
                      data.kpis.totalAwaitingVerificationKd,
                    ),
                  },
                )
              : undefined
          }
        />
        <KpiCard
          tone="purple"
          label={t('driverCashTrace.kpiAtBank', 'Verified at bank')}
          icon={<Landmark className="h-4 w-4" />}
          loading={loading}
          value={data ? formatKwdLabel(data.kpis.totalAtBankKd) : '—'}
          deltaBadge={
            data && Number(data.kpis.totalRejectedKd) > 0
              ? t(
                  'driverCashTrace.kpiRejectedHint',
                  'Rejected: {{amount}}',
                  {
                    amount: formatKwdLabel(data.kpis.totalRejectedKd),
                  },
                )
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            {t('driverCashTrace.tableTitle', 'Per-driver breakdown')}
          </CardTitle>
          {data ? (
            <span className="text-xs text-muted-foreground">
              {t('driverCashTrace.windowLabel', 'Window: {{from}} \u2192 {{to}}', {
                from: new Date(data.range.from).toLocaleDateString(locale),
                to: new Date(data.range.to).toLocaleDateString(locale),
              })}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredDrivers.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>
                      {t('driverCashTrace.colDriver', 'Driver')}
                    </TableHead>
                    <TableHead className="text-end">
                      {t('driverCashTrace.colCollected', 'Collected')}
                    </TableHead>
                    <TableHead className="text-end">
                      {t('driverCashTrace.colHanded', 'Handed over')}
                    </TableHead>
                    <TableHead className="text-end">
                      {t('driverCashTrace.colPendingDriver', 'With driver')}
                    </TableHead>
                    <TableHead className="text-end">
                      {t(
                        'driverCashTrace.colPendingManager',
                        'Pending / Awaiting',
                      )}
                    </TableHead>
                    <TableHead className="text-end">
                      {t('driverCashTrace.colAtBank', 'Verified at bank')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDrivers.map((d) => (
                    <DriverRow
                      key={d.driverId}
                      driver={d}
                      isOpen={!!expanded[d.driverId]}
                      onToggle={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [d.driverId]: !prev[d.driverId],
                        }))
                      }
                      fmtDateTime={fmtDateTime}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DriverRow(props: {
  driver: DriverCashTraceDriver;
  isOpen: boolean;
  onToggle: () => void;
  fmtDateTime: (iso: string | null) => string;
}) {
  const { t } = useTranslation();
  const { driver, isOpen, onToggle, fmtDateTime } = props;
  const pendingWithDriver = Number(driver.pendingWithDriverKd);
  const pendingTotalManager =
    Number(driver.pendingAtManagerKd) +
    Number(driver.awaitingVerificationKd);

  return (
    <>
      <TableRow className="align-top">
        <TableCell className="py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggle}
            aria-label="toggle"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{driver.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">
              @{driver.username}
              {driver.branchName ? ` · ${driver.branchName}` : ''}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-2 text-end tabular-nums">
          <div>{formatKwdLabel(driver.collectedKd)}</div>
          <div className="text-[11px] text-muted-foreground">
            {t('driverCashTrace.colCollectedHint', '{{n}} order(s)', {
              n: driver.collectedOrderCount,
            })}
          </div>
        </TableCell>
        <TableCell className="py-2 text-end tabular-nums">
          <div>{formatKwdLabel(driver.handedToManagerKd)}</div>
          <div className="text-[11px] text-muted-foreground">
            {t('driverCashTrace.colHandedHint', '{{n}} bag(s)', {
              n: driver.handedToManagerBagCount,
            })}
          </div>
        </TableCell>
        <TableCell
          className={cn(
            'py-2 text-end font-medium tabular-nums',
            pendingWithDriver > 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-muted-foreground',
          )}
        >
          {formatKwdLabel(driver.pendingWithDriverKd)}
        </TableCell>
        <TableCell className="py-2 text-end tabular-nums">
          {formatKwdLabel(pendingTotalManager.toFixed(4))}
        </TableCell>
        <TableCell className="py-2 text-end tabular-nums">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            {formatKwdLabel(driver.atBankKd)}
          </span>
        </TableCell>
      </TableRow>
      {isOpen ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-0">
            <BagDetail driver={driver} fmtDateTime={fmtDateTime} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function BagDetail({
  driver,
  fmtDateTime,
}: {
  driver: DriverCashTraceDriver;
  fmtDateTime: (iso: string | null) => string;
}) {
  const { t } = useTranslation();
  if (driver.bags.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        {t(
          'driverCashTrace.noHandoverYet',
          'This driver has not handed any cash to a branch manager in the window yet.',
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t('driverCashTrace.bag.receivedAt', 'Received from driver')}
            </TableHead>
            <TableHead>
              {t('driverCashTrace.bag.manager', 'Branch manager')}
            </TableHead>
            <TableHead className="text-end">
              {t('driverCashTrace.bag.amount', 'Amount')}
            </TableHead>
            <TableHead className="text-end">
              {t('driverCashTrace.bag.orders', 'Orders')}
            </TableHead>
            <TableHead>
              {t('driverCashTrace.bag.status', 'Status')}
            </TableHead>
            <TableHead>
              {t('driverCashTrace.bag.slipUploaded', 'Slip uploaded')}
            </TableHead>
            <TableHead>
              {t('driverCashTrace.bag.verifiedAt', 'Verified at bank')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {driver.bags.map((bag) => (
            <TableRow key={bag.id}>
              <TableCell className="tabular-nums">
                {fmtDateTime(bag.receivedFromDriverAt)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {bag.managerName ?? '—'}
                  </span>
                  {bag.branchName ? (
                    <span className="text-xs text-muted-foreground">
                      {bag.branchName}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {formatKwdLabel(bag.amountKd)}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {bag.settledOrderCount}
              </TableCell>
              <TableCell>
                <StatusBadge status={bag.status} />
                {bag.rejectionReason ? (
                  <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    {bag.rejectionReason}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="tabular-nums text-xs">
                {fmtDateTime(bag.slipUploadedAt)}
              </TableCell>
              <TableCell className="tabular-nums text-xs">
                {fmtDateTime(bag.verifiedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: DriverCashTraceBag['status'];
}) {
  const { t } = useTranslation();
  if (status === 'VERIFIED') {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
        <CheckCircle2 className="me-1 h-3 w-3" />
        {t('driverCashTrace.status.verified', 'At bank')}
      </Badge>
    );
  }
  if (status === 'AWAITING_VERIFICATION') {
    return (
      <Badge className="bg-sky-600 text-white hover:bg-sky-700">
        <Clock className="me-1 h-3 w-3" />
        {t('driverCashTrace.status.awaiting', 'Awaiting accountant')}
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge variant="destructive">
        <XCircle className="me-1 h-3 w-3" />
        {t('driverCashTrace.status.rejected', 'Rejected')}
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500 text-white hover:bg-amber-600">
      <HandCoins className="me-1 h-3 w-3" />
      {t('driverCashTrace.status.pending', 'With manager (no slip)')}
    </Badge>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
      <Truck className="h-8 w-8" />
      <p className="text-sm">
        {t(
          'driverCashTrace.empty',
          'No cash activity in the selected window.',
        )}
      </p>
      <p className="text-xs">
        {t(
          'driverCashTrace.emptyHint',
          'Pick a different day or widen the date range.',
        )}
      </p>
    </div>
  );
}
