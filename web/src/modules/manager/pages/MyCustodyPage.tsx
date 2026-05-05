import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  CheckSquare,
  Clock,
  HandCoins,
  Landmark,
  Loader2,
  MessageSquare,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Truck,
  Upload,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  approveReceiptFromDriver,
  attachDepositSlip,
  getManagerCashStatus,
  listMyManagerCustody,
  uploadDepositSlipImage,
  type ManagerCashCustodyRow,
  type ManagerCashStatusActivityRow,
  type ManagerCashStatusDriverRow,
  type ManagerCashStatusResponse,
} from '@/lib/api';
import { formatRelativeTime } from '@/modules/shared/hooks/use-relative-time';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Button,
  buttonVariants,
} from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Branch-Manager Cash Dashboard.
 *
 * Layout (top → bottom; risk first, control second):
 *   1. HeaderSummary       — total under control + system status pill + 3 quick indicators
 *   2. DriverSection       — drivers with cash STILL ON THEM (high-risk; red/yellow tones)
 *   3. ManagerSection      — manager's own POS cash (controlled; neutral green)
 *   4. DepositPanel        — bank-deposit slip upload (consumes the same SSoT total)
 *   5. CustodyBagsList     — read-only bags currently in manager's drawer (printable receipts)
 *   6. ActivityTimeline    — last 10 ledger events touching this manager / branch drivers
 *
 * STRICT (Dastur §3 / brief §"NO UI CALCULATIONS"):
 *   - EVERY KD figure on this page comes from the server-aggregated
 *     `/api/manager/cash-status` snapshot. The frontend never sums,
 *     subtracts, or aggregates money. The ESLint rules
 *     `Identifier[totalCashInFlight]` and `parseFloat(...Kd)` block
 *     this at lint time.
 *   - Per-driver risk classification (NORMAL / WARNING / CRITICAL) is
 *     computed server-side from the driver's open shift age. The UI
 *     only reads `riskLevel`.
 */
export function MyCustodyPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<ManagerCashCustodyRow[] | null>(null);
  const [cashStatus, setCashStatus] =
    useState<ManagerCashStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingDriverId, setApprovingDriverId] = useState<string | null>(
    null,
  );

  // Bulk bank-deposit section state.
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const bulkPreviewRef = useRef<string | null>(null);
  const [bulkPreviewUrl, setBulkPreviewUrl] = useState<string | null>(null);

  const canUse = can(user, 'managerCustody.view');
  const isManager = can(user, 'managerCustody.act');

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    try {
      const [bagsRes, statusRes] = await Promise.all([
        listMyManagerCustody(token),
        isManager
          ? getManagerCashStatus(token).catch(() => null)
          : Promise.resolve(null),
      ]);
      setRows(bagsRes);
      setCashStatus(statusRes);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, canUse, isManager]);

  useEffect(() => {
    if (!token || !canUse) {
      setLoading(false);
      return;
    }
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        const [bags, status] = await Promise.all([
          listMyManagerCustody(token),
          isManager
            ? getManagerCashStatus(token).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!c) {
          setRows(bags);
          setCashStatus(status);
        }
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, canUse, isManager]);

  useEffect(() => {
    if (!bulkFile) {
      if (bulkPreviewRef.current) URL.revokeObjectURL(bulkPreviewRef.current);
      bulkPreviewRef.current = null;
      setBulkPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(bulkFile);
    bulkPreviewRef.current = u;
    setBulkPreviewUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [bulkFile]);

  // STATUS COUNT (not money), allowed from the bag list.
  const overdueCount = useMemo(
    () => (rows ?? []).filter((r) => r.isOverdue).length,
    [rows],
  );

  /*
   * Bulk-deposit eligible bags = everything the manager is still
   * "holding": PENDING_DEPOSIT (fresh handovers) + REJECTED (kicked back
   * by accountant, need a new slip). The KD figure shown next to the
   * uploader is `cashStatus.pendingDepositKd` — the SSoT total — not a
   * client-side reduce.
   */
  const bulkEligible = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => r.status === 'PENDING_DEPOSIT' || r.status === 'REJECTED',
      ),
    [rows],
  );

  async function approveReceipt(driverId: string) {
    if (!token) return;
    setApprovingDriverId(driverId);
    try {
      await approveReceiptFromDriver(token, { driverId });
      toast.success(t('managerCustody.approveReceiptInlineSuccess'));
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setApprovingDriverId(null);
    }
  }

  function remindDriver(driver: ManagerCashStatusDriverRow) {
    if (!driver.driverPhone) {
      toast.warning(t('managerCustody.driverRemindNoPhone'));
      return;
    }
    const phone = driver.driverPhone.replace(/[^\d+]/g, '');
    const message = t('managerCustody.driverRemindWhatsAppMessage', {
      name: driver.driverName,
      amount: formatKwdLabel(driver.heldCashKd),
    });
    const url = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function onBulkSubmit() {
    if (!token) return;
    if (!bulkFile) {
      toast.error(t('managerCustody.bulkNeedFile'));
      return;
    }
    if (bulkEligible.length === 0) {
      toast.error(t('managerCustody.bulkNoBags'));
      return;
    }
    setBulkSubmitting(true);
    try {
      const { depositSlipUrl } = await uploadDepositSlipImage(token, bulkFile);
      const trimmedNote = bulkNote.trim() || undefined;
      const results = await Promise.allSettled(
        bulkEligible.map((r) =>
          attachDepositSlip(token, r.id, {
            depositSlipUrl,
            note: trimmedNote,
          }),
        ),
      );
      const succeeded = results.filter((x) => x.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (failed === 0) {
        toast.success(t('managerCustody.bulkSuccess', { count: succeeded }));
      } else if (succeeded === 0) {
        const first = results.find((x) => x.status === 'rejected') as
          | PromiseRejectedResult
          | undefined;
        const reason = first?.reason;
        toast.error(
          reason instanceof ApiError ? reason.message : 'Submission failed',
        );
      } else {
        toast.warning(
          t('managerCustody.bulkPartial', {
            done: succeeded,
            total: results.length,
          }),
        );
      }
      setBulkFile(null);
      setBulkNote('');
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBulkSubmitting(false);
    }
  }

  if (!canUse) return <Navigate to="/" replace />;

  const list = rows ?? [];
  const isRtl = i18n.dir() === 'rtl';

  // Header status pill: WARNING when there are overdue manager bags
  // OR any driver in WARNING/CRITICAL risk, NORMAL otherwise.
  const systemWarning =
    overdueCount > 0 ||
    (cashStatus?.drivers ?? []).some((d) => d.riskLevel !== 'NORMAL');

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('managerCustody.myTitle')}
          </h1>
          <p className="text-sm text-zinc-500">
            {t('managerCustody.mySubtitle')}
            {!isManager ? (
              <>
                {' '}
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  ({t('managerCustody.readOnlyOversightHint')})
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('managerCustody.refresh')}
        </Button>
      </header>

      <HeaderSummary
        cashStatus={cashStatus}
        loading={loading && !cashStatus}
        warning={systemWarning}
        overdueCount={overdueCount}
        i18nLanguage={i18n.language}
        nowMs={
          cashStatus
            ? new Date(cashStatus.generatedAt).getTime()
            : null
        }
      />

      {isManager ? (
        <DriverSection
          drivers={cashStatus?.drivers ?? null}
          loading={loading && !cashStatus}
          totalKd={cashStatus?.driversAwaitingHandoverKd ?? null}
          approvingDriverId={approvingDriverId}
          onApprove={(d) => void approveReceipt(d.driverId)}
          onRemind={remindDriver}
        />
      ) : null}

      <ManagerSection
        managerName={cashStatus?.managerName ?? user?.fullName ?? ''}
        amountKd={cashStatus?.pendingDepositKd ?? null}
        delayed={systemWarning}
        loading={loading && !cashStatus}
      />

      {isManager ? (
        <DepositPanel
          totalKd={cashStatus?.pendingDepositKd ?? null}
          custodyBagsTotalKd={cashStatus?.custodyBagsTotalKd ?? null}
          eligibleCount={bulkEligible.length}
          submitting={bulkSubmitting}
          file={bulkFile}
          previewUrl={bulkPreviewUrl}
          note={bulkNote}
          onFile={setBulkFile}
          onNote={setBulkNote}
          onSubmit={() => void onBulkSubmit()}
        />
      ) : null}

      {/* Read-only visibility of my custody bags (printable receipts). */}
      {loading && !rows ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : list.length === 0 ? null : (
        <div className="grid gap-3">
          {list.map((r) => (
            <CustodyCard key={r.id} row={r} dateLocale={dateLocale} />
          ))}
        </div>
      )}

      <ActivityTimeline
        events={cashStatus?.recentActivity ?? null}
        loading={loading && !cashStatus}
        i18nLanguage={i18n.language}
        nowMs={
          cashStatus
            ? new Date(cashStatus.generatedAt).getTime()
            : null
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────── HeaderSummary
function HeaderSummary({
  cashStatus,
  loading,
  warning,
  overdueCount,
  i18nLanguage,
  nowMs,
}: {
  cashStatus: ManagerCashStatusResponse | null;
  loading: boolean;
  warning: boolean;
  overdueCount: number;
  i18nLanguage: string;
  nowMs: number | null;
}) {
  const { t } = useTranslation();
  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }
  return (
    <Card
      className={cn(
        'border shadow-sm',
        warning ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200 bg-white',
      )}
    >
      <CardContent className="grid gap-4 py-5 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              warning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
            )}
            aria-hidden
          >
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('managerCustody.headerTotalUnderControl')}
            </p>
            <p className="text-3xl font-semibold tabular-nums text-zinc-900">
              {cashStatus
                ? formatKwdLabel(cashStatus.pendingDepositKd)
                : '—'}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {warning ? (
                <Badge className="gap-1 border-amber-300 bg-amber-100 text-amber-900">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {t('managerCustody.headerStatusWarning')}
                </Badge>
              ) : (
                <Badge className="gap-1 border-emerald-300 bg-emerald-100 text-emerald-900">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t('managerCustody.headerStatusNormal')}
                </Badge>
              )}
              {overdueCount > 0 ? (
                <Badge variant="outline" className="border-red-300 text-red-800">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t('managerCustody.tileOverdue')}: {overdueCount}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <Indicator
          icon={<Truck className="h-4 w-4 text-amber-700" aria-hidden />}
          label={t('managerCustody.headerDriversPending')}
          value={
            cashStatus
              ? formatKwdLabel(cashStatus.driversAwaitingHandoverKd)
              : '—'
          }
          sub={
            cashStatus
              ? `${cashStatus.driversAtRiskCount} ${t('managerCustody.colDriver')}`
              : undefined
          }
        />
        <Indicator
          icon={<Briefcase className="h-4 w-4 text-emerald-700" aria-hidden />}
          label={t('managerCustody.headerManagerCash')}
          value={
            cashStatus ? formatKwdLabel(cashStatus.managerOwnPosKd) : '—'
          }
          sub={t('managerCustody.managerSectionSource')}
        />
        <Indicator
          icon={<Clock className="h-4 w-4 text-sky-700" aria-hidden />}
          label={t('managerCustody.headerLastActivity')}
          value={
            cashStatus?.lastActivityAt && nowMs !== null
              ? formatRelativeTime(
                  cashStatus.lastActivityAt,
                  i18nLanguage,
                  nowMs,
                )
              : '—'
          }
        />
      </CardContent>
    </Card>
  );
}

function Indicator({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── <Section />
/**
 * Reusable section wrapper used by both the drivers and the manager
 * blocks. Keeps the title row + optional action/total slot consistent
 * across the dashboard so the visual hierarchy is uniform.
 *
 * No business logic, no money math — pure layout.
 */
function Section({
  title,
  hint,
  action,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
            {title}
          </h2>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────── DriverSection
function DriverSection({
  drivers,
  loading,
  totalKd,
  approvingDriverId,
  onApprove,
  onRemind,
}: {
  drivers: ManagerCashStatusDriverRow[] | null;
  loading: boolean;
  totalKd: string | null;
  approvingDriverId: string | null;
  onApprove: (d: ManagerCashStatusDriverRow) => void;
  onRemind: (d: ManagerCashStatusDriverRow) => void;
}) {
  const { t } = useTranslation();
  // Brief: "Sorted by highest cash". Single-value ordering only — no
  // aggregation, no client-side recomputation of money. The KD figures
  // themselves are still rendered as-is from the server-aggregated
  // `heldCashKd` strings.
  const sortedDrivers = useMemo(
    () =>
      [...(drivers ?? [])].sort(
        (a, b) => Number(b.heldCashKd) - Number(a.heldCashKd),
      ),
    [drivers],
  );

  return (
    <Section
      title={
        <>
          <span aria-hidden role="img">
            🚚
          </span>
          {t('managerCustody.driverSectionTitle')}
        </>
      }
      hint={t('managerCustody.handoverSectionHint')}
      action={
        totalKd && totalKd !== '0.0000' ? (
          <div className="text-sm text-muted-foreground">
            {t('managerCustody.handoverTotalAwaiting')}:{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatKwdLabel(totalKd)}
            </span>
          </div>
        ) : null
      }
    >
      {loading && drivers === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      ) : sortedDrivers.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="flex items-center gap-2 py-5 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            {t('managerCustody.driverSectionEmpty')}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('managerCustody.colDriver')}</TableHead>
                    <TableHead className="text-end">
                      {t('managerCustody.colAmount')}
                    </TableHead>
                    <TableHead>{t('managerCustody.colStatus')}</TableHead>
                    <TableHead className="text-end">
                      {t('managerCustody.colActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDrivers.map((d) => (
                    <DriverRow
                      key={d.driverId}
                      driver={d}
                      approving={approvingDriverId === d.driverId}
                      disabled={
                        approvingDriverId !== null &&
                        approvingDriverId !== d.driverId
                      }
                      onApprove={() => onApprove(d)}
                      onRemind={() => onRemind(d)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </Section>
  );
}

// Brief: badge "green = normal, red = delayed". Server grades the
// risk (NORMAL / WARNING / CRITICAL); the client only maps to the
// two-state badge palette and a single row tone.
function DriverRow({
  driver,
  approving,
  disabled,
  onApprove,
  onRemind,
}: {
  driver: ManagerCashStatusDriverRow;
  approving: boolean;
  disabled: boolean;
  onApprove: () => void;
  onRemind: () => void;
}) {
  const { t } = useTranslation();
  const isDelayed = driver.riskLevel !== 'NORMAL';
  return (
    <TableRow
      className={cn(isDelayed && 'bg-red-50/60 hover:bg-red-50/80')}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'rounded-md p-1.5',
              isDelayed
                ? 'bg-red-100 text-red-700'
                : 'bg-zinc-100 text-zinc-600',
            )}
          >
            <Truck className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="font-medium">{driver.driverName}</div>
            <div className="text-xs text-muted-foreground">
              @{driver.driverUsername}
              {driver.ageHours !== null ? (
                <> · {t('managerCustody.age', { hours: driver.ageHours })}</>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-end font-semibold tabular-nums">
        {formatKwdLabel(driver.heldCashKd)}
      </TableCell>
      <TableCell>
        <StatusBadge delayed={isDelayed} />
      </TableCell>
      <TableCell className="text-end">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!driver.driverPhone}
            onClick={onRemind}
            title={
              driver.driverPhone
                ? undefined
                : t('managerCustody.driverRemindNoPhone')
            }
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {t('managerCustody.driverRemind')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            disabled={approving || disabled}
            onClick={onApprove}
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('managerCustody.driverHandoverNow')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ delayed }: { delayed: boolean }) {
  const { t } = useTranslation();
  return delayed ? (
    <Badge
      variant="outline"
      className="gap-1 border-red-300 bg-red-100 text-red-900"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {t('managerCustody.driverRiskWarning')}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-300 bg-emerald-100 text-emerald-900"
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      {t('managerCustody.driverRiskNormal')}
    </Badge>
  );
}

// ─────────────────────────────────────────────── ManagerSection
function ManagerSection({
  managerName,
  amountKd,
  delayed,
  loading,
}: {
  managerName: string;
  amountKd: string | null;
  delayed: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Section
      title={
        <>
          <span aria-hidden role="img">
            👨‍💼
          </span>
          {t('managerCustody.managerSectionTitle')}
        </>
      }
      hint={t('managerCustody.managerSectionHint')}
    >
      <ManagerCard
        managerName={managerName}
        amountKd={amountKd}
        delayed={delayed}
        loading={loading}
      />
    </Section>
  );
}

function ManagerCard({
  managerName,
  amountKd,
  delayed,
  loading,
}: {
  managerName: string;
  amountKd: string | null;
  delayed: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading && amountKd === null) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }
  return (
    <Card
      className={cn(
        'shadow-sm',
        delayed
          ? 'border-red-200 bg-red-50/60'
          : 'border-emerald-200 bg-emerald-50/40',
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              'rounded-lg p-2.5',
              delayed
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700',
            )}
          >
            <Briefcase className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-900">
              {managerName || t('managerCustody.colManager')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('managerCustody.managerSectionSource')}
            </p>
            <div className="mt-1.5">
              <StatusBadge delayed={delayed} />
            </div>
          </div>
        </div>
        <div className="text-end">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('managerCustody.managerCardTotalLabel')}
          </p>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums',
              delayed ? 'text-red-900' : 'text-emerald-900',
            )}
          >
            {amountKd ? formatKwdLabel(amountKd) : '—'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────── DepositPanel
function DepositPanel({
  totalKd,
  custodyBagsTotalKd,
  eligibleCount,
  submitting,
  file,
  previewUrl,
  note,
  onFile,
  onNote,
  onSubmit,
}: {
  totalKd: string | null;
  custodyBagsTotalKd: string | null;
  eligibleCount: number;
  submitting: boolean;
  file: File | null;
  previewUrl: string | null;
  note: string;
  onFile: (f: File | null) => void;
  onNote: (s: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-slate-200 bg-slate-50/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-slate-700" aria-hidden />
          <CardTitle className="text-lg font-semibold text-zinc-900">
            {t('managerCustody.bulkDepositTitle')}
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('managerCustody.bulkDepositSubtitle')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t('managerCustody.bulkHeldCash')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-zinc-900">
              {totalKd ? formatKwdLabel(totalKd) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('managerCustody.bulkBagsCount', { count: eligibleCount })}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t('managerCustody.custodyBagsSubtotalLabel')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-zinc-900">
              {custodyBagsTotalKd ? formatKwdLabel(custodyBagsTotalKd) : '—'}
            </p>
          </div>
        </div>

        {eligibleCount === 0 ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {t('managerCustody.bulkNoBags')}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="bulk-slip">
                {t('managerCustody.bulkSlipLabel')}
              </Label>
              <Input
                id="bulk-slip"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="cursor-pointer"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
              />
            </div>
            {previewUrl ? (
              <div className="overflow-hidden rounded-lg border border-zinc-200">
                <img
                  src={previewUrl}
                  alt=""
                  className="max-h-56 w-full bg-zinc-100 object-contain"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="bulk-note">
                {t('managerCustody.bulkNoteLabel')}
              </Label>
              <Textarea
                id="bulk-note"
                value={note}
                onChange={(e) => onNote(e.target.value)}
                placeholder={t('managerCustody.bulkNotePlaceholder')}
                rows={2}
                disabled={submitting}
              />
            </div>
            <Button
              type="button"
              className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={submitting || !file}
              onClick={onSubmit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t('managerCustody.bulkSubmitCta')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────── ActivityTimeline
function ActivityTimeline({
  events,
  loading,
  i18nLanguage,
  nowMs,
}: {
  events: ManagerCashStatusActivityRow[] | null;
  loading: boolean;
  i18nLanguage: string;
  nowMs: number | null;
}) {
  const { t } = useTranslation();
  if (loading && events === null) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }
  const list = events ?? [];
  return (
    <Card className="border-zinc-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-zinc-900 flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-500" aria-hidden />
          {t('managerCustody.activityTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {list.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t('managerCustody.activityEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.map((e) => {
              const style = ACTIVITY_STYLE[e.kind];
              return (
                <li
                  key={e.txId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn('rounded-md p-1.5', style.iconWrap)}
                    >
                      {style.icon}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {t(style.labelKey)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nowMs !== null
                          ? formatRelativeTime(e.at, i18nLanguage, nowMs)
                          : ''}
                        {e.actorAccountId ? <> · {e.actorAccountId}</> : null}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold tabular-nums text-zinc-900">
                      {formatKwdLabel(e.amountKd)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const ACTIVITY_STYLE: Record<
  ManagerCashStatusActivityRow['kind'],
  { iconWrap: string; icon: React.ReactNode; labelKey: string }
> = {
  POS_SALE: {
    iconWrap: 'bg-sky-100 text-sky-700',
    icon: <HandCoins className="h-3.5 w-3.5" />,
    labelKey: 'managerCustody.activityKindPosSale',
  },
  DRIVER_HANDOVER: {
    iconWrap: 'bg-amber-100 text-amber-700',
    icon: <Truck className="h-3.5 w-3.5" />,
    labelKey: 'managerCustody.activityKindDriverHandover',
  },
  BANK_DEPOSIT: {
    iconWrap: 'bg-emerald-100 text-emerald-700',
    icon: <Landmark className="h-3.5 w-3.5" />,
    labelKey: 'managerCustody.activityKindBankDeposit',
  },
  OTHER: {
    iconWrap: 'bg-zinc-100 text-zinc-700',
    icon: <Wallet className="h-3.5 w-3.5" />,
    labelKey: 'managerCustody.activityKindOther',
  },
};

// ─────────────────────────────────────────────── CustodyCard (existing)
function CustodyCard({
  row,
  dateLocale,
}: {
  row: ManagerCashCustodyRow;
  dateLocale: string | undefined;
}) {
  const { t } = useTranslation();
  const statusStyle = statusTone(row);
  return (
    <Card
      className={cn(
        'border shadow-sm',
        row.isOverdue
          ? 'border-red-300 bg-red-50/70'
          : 'border-zinc-200 bg-white',
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-medium text-zinc-900">
              {row.driverName}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                @{row.driverUsername}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('managerCustody.receivedAt')}:{' '}
              {new Date(row.receivedFromDriverAt).toLocaleString(dateLocale)}
              {' · '}
              {t('managerCustody.age', { hours: row.ageHours })}
            </p>
          </div>
          <Badge variant="outline" className={statusStyle}>
            {t(`managerCustody.status.${row.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {t('managerCustody.colAmount')}
          </p>
          <p className="text-lg font-semibold tabular-nums text-zinc-900">
            {formatKwdLabel(row.amountKd)}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.settledOrderCount} {t('managerCustody.ordersSettled')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.depositSlipUrl ? (
            <a
              href={row.depositSlipUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium underline underline-offset-2 text-sky-700 hover:text-sky-900"
            >
              {t('managerCustody.viewSlip')}
            </a>
          ) : null}
          {row.status === 'VERIFIED' ? (
            <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('managerCustody.closed')}
            </Badge>
          ) : null}
          <Link
            to={`/my-cash-receipts/${row.id}/print`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'gap-1',
            )}
          >
            <Printer className="h-3.5 w-3.5" />
            {t('managerCustody.printReceipt')}
          </Link>
        </div>
      </CardContent>
      {row.status === 'REJECTED' && row.rejectionReason ? (
        <CardContent className="pt-0">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <span className="font-semibold">
              {t('managerCustody.rejectedReason')}:
            </span>{' '}
            {row.rejectionReason}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function statusTone(row: ManagerCashCustodyRow): string {
  if (row.isOverdue) return 'border-red-300 bg-red-100 text-red-800';
  switch (row.status) {
    case 'PENDING_DEPOSIT':
      return 'border-amber-300 bg-amber-100 text-amber-800';
    case 'AWAITING_VERIFICATION':
      return 'border-sky-300 bg-sky-100 text-sky-800';
    case 'VERIFIED':
      return 'border-emerald-300 bg-emerald-100 text-emerald-800';
    case 'REJECTED':
      return 'border-red-300 bg-red-100 text-red-800';
    default:
      return '';
  }
}
