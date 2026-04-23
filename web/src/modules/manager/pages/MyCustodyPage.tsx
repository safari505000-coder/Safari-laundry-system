import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock,
  HandCoins,
  Landmark,
  Loader2,
  Printer,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  apiJson,
  approveReceiptFromDriver,
  attachDepositSlip,
  listMyManagerCustody,
  uploadDepositSlipImage,
  type DriverBalanceResponse,
  type DriverBalanceRow,
  type ManagerCashCustodyRow,
} from '@/lib/api';
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
import { Textarea } from '@/modules/shared/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Dastur §3 — Manager Accountability.
 *
 * Flow on this page (top → bottom):
 *   1. "Driver Handover Approval" list — each row has a تأكيد الاستلام
 *      button that calls POST /manager-custody/approve-receipt INLINE
 *      (no redirect). Liability flips from Driver → Manager in the
 *      background and the list refreshes on the same page.
 *   2. Summary tiles (pending / awaiting / overdue counts).
 *   3. Read-only list of custody bags for visibility (no per-bag upload
 *      button any more — the redundant individual-slip dialog was removed).
 *   4. Bulk "Bank deposit / Submit to accountant" section at the bottom —
 *      one photo, one submit, applied to every PENDING_DEPOSIT + REJECTED
 *      bag the manager currently holds. Backend is unchanged: we loop over
 *      the existing POST /manager-custody/:id/upload-slip endpoint, which
 *      flips each bag to AWAITING_VERIFICATION (== PENDING_ACCOUNTANT_
 *      VERIFICATION in business terms).
 */
export function MyCustodyPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<ManagerCashCustodyRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Dastur §2.1 / §3 — "Driver Handover Approval" pre-flight list.
   * MANAGER-role endpoint /api/finance/driver-balance already exposes every
   * driver's pending field cash. We surface just the ones in this manager's
   * branch with a non-zero CASH balance; the Confirm-Receipt action calls
   * POST /manager-custody/approve-receipt INLINE (no redirect) — the whole
   * flow now lives on this single page.
   */
  const [driverBalances, setDriverBalances] = useState<
    DriverBalanceRow[] | null
  >(null);
  const [balancesLoading, setBalancesLoading] = useState(true);
  /*
   * Per-row in-flight state for the inline "Confirm Receipt" action. We
   * track by driverId (one button at a time) so clicking one doesn't
   * spinner-lock the rest of the list.
   */
  const [approvingDriverId, setApprovingDriverId] = useState<string | null>(
    null,
  );

  /* Bulk bank-deposit section state (bottom of page). */
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const bulkPreviewRef = useRef<string | null>(null);
  const [bulkPreviewUrl, setBulkPreviewUrl] = useState<string | null>(null);

  const canUse = can(user, 'managerCustody.view');
  const isManager = can(user, 'managerCustody.act');
  const managerBranchId = user?.branchId ?? null;

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    try {
      const d = await listMyManagerCustody(token);
      setRows(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, canUse]);

  const loadDriverBalances = useCallback(async () => {
    if (!token || !canUse) return;
    setBalancesLoading(true);
    try {
      const d = await apiJson<DriverBalanceResponse>(
        '/api/finance/driver-balance',
        { token },
      );
      setDriverBalances(d.drivers);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBalancesLoading(false);
    }
  }, [token, canUse]);

  useEffect(() => {
    if (!token || !canUse) {
      setLoading(false);
      return;
    }
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        const d = await listMyManagerCustody(token);
        if (!c) setRows(d);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    void loadDriverBalances();
    return () => {
      c = true;
    };
  }, [token, canUse, loadDriverBalances]);

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

  const driversReadyForHandover = useMemo(() => {
    const list = driverBalances ?? [];
    return list
      .filter((d) => Number.parseFloat(d.heldCashTotal) > 0)
      .filter((d) =>
        managerBranchId && isManager
          ? d.branchId === managerBranchId
          : true,
      )
      .sort(
        (a, b) =>
          Number.parseFloat(b.heldCashTotal) -
          Number.parseFloat(a.heldCashTotal),
      );
  }, [driverBalances, managerBranchId, isManager]);

  const totalAwaitingHandoverKd = useMemo(
    () =>
      driversReadyForHandover.reduce(
        (acc, d) => acc + Number.parseFloat(d.heldCashTotal),
        0,
      ),
    [driversReadyForHandover],
  );

  const summary = useMemo(() => {
    const list = rows ?? [];
    let pendingCount = 0;
    let awaitingCount = 0;
    let overdueCount = 0;
    let pendingMinor = 0;
    for (const r of list) {
      if (r.status === 'PENDING_DEPOSIT') pendingCount += 1;
      if (r.status === 'AWAITING_VERIFICATION') awaitingCount += 1;
      if (r.isOverdue) overdueCount += 1;
      if (r.status !== 'VERIFIED') {
        pendingMinor += Number.parseFloat(r.amountKd);
      }
    }
    return { pendingCount, awaitingCount, overdueCount, pendingMinor };
  }, [rows]);

  /*
   * Bulk-deposit eligible bags = everything the manager is still "holding":
   * PENDING_DEPOSIT (fresh handovers) + REJECTED (kicked back by accountant,
   * need a new slip). Backend's POST :id/upload-slip accepts exactly these
   * two statuses, so the loop will never 400.
   */
  const bulkEligible = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => r.status === 'PENDING_DEPOSIT' || r.status === 'REJECTED',
      ),
    [rows],
  );

  const bulkTotalKd = useMemo(
    () =>
      bulkEligible.reduce((acc, r) => acc + Number.parseFloat(r.amountKd), 0),
    [bulkEligible],
  );

  /*
   * Inline Driver-Receipt approval. Replaces the old redirect to
   * /collect-driver-cash. Transfers liability Driver → Manager via the
   * existing atomic endpoint POST /manager-custody/approve-receipt, then
   * silently refreshes both the driver-balance list (row should disappear)
   * and the manager's custody bags (new PENDING_DEPOSIT bag appears below).
   */
  async function approveReceipt(driverId: string) {
    if (!token) return;
    setApprovingDriverId(driverId);
    try {
      await approveReceiptFromDriver(token, { driverId });
      toast.success(t('managerCustody.approveReceiptInlineSuccess'));
      await Promise.all([load(), loadDriverBalances()]);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setApprovingDriverId(null);
    }
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

      /*
       * Attach the SAME slip URL to every eligible bag. Using allSettled so
       * a single failure doesn't swallow the partial success of the rest.
       */
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
        toast.success(
          t('managerCustody.bulkSuccess', { count: succeeded }),
        );
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

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('managerCustody.myTitle')}
          </h1>
          <p className="text-sm text-zinc-500">
            {t('managerCustody.mySubtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void load();
            void loadDriverBalances();
          }}
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

      {/* Dastur §2.1 / §3 — Driver Handover Approval pre-flight list (Image 1). */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {t('managerCustody.handoverSectionTitle')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('managerCustody.handoverSectionHint')}
            </p>
          </div>
          {driversReadyForHandover.length > 0 ? (
            <div className="text-sm text-muted-foreground">
              {t('managerCustody.handoverTotalAwaiting')}:{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatKwdLabel(totalAwaitingHandoverKd)}
              </span>
            </div>
          ) : null}
        </div>

        {balancesLoading && driverBalances === null ? (
          <div className="grid gap-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : driversReadyForHandover.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="py-6 text-center text-sm text-zinc-500">
              {t('managerCustody.handoverEmpty')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {driversReadyForHandover.map((d) => (
              <DriverHandoverRow
                key={d.driverId}
                row={d}
                approving={approvingDriverId === d.driverId}
                disabled={
                  approvingDriverId !== null && approvingDriverId !== d.driverId
                }
                onConfirm={() => void approveReceipt(d.driverId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={<Clock className="h-4 w-4 text-amber-600" aria-hidden />}
          label={t('managerCustody.tilePending')}
          value={String(summary.pendingCount)}
        />
        <SummaryTile
          icon={<Upload className="h-4 w-4 text-sky-600" aria-hidden />}
          label={t('managerCustody.tileAwaiting')}
          value={String(summary.awaitingCount)}
        />
        <SummaryTile
          icon={
            <AlertTriangle
              className={cn(
                'h-4 w-4',
                summary.overdueCount > 0 ? 'text-red-600' : 'text-zinc-400',
              )}
              aria-hidden
            />
          }
          label={t('managerCustody.tileOverdue')}
          value={String(summary.overdueCount)}
          tone={summary.overdueCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Read-only visibility of my custody bags (no per-bag upload button). */}
      {loading && !rows ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <Card className="border-zinc-200 bg-white">
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            {t('managerCustody.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((r) => (
            <CustodyCard key={r.id} row={r} dateLocale={dateLocale} />
          ))}
        </div>
      )}

      {/* Bulk bank-deposit section — replaces the per-bag upload dialog. */}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {t('managerCustody.bulkHeldCash')}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-900">
                {formatKwdLabel(bulkTotalKd)}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('managerCustody.bulkBagsCount', {
                count: bulkEligible.length,
              })}
            </div>
          </div>

          {bulkEligible.length === 0 ? (
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
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                  disabled={bulkSubmitting}
                />
              </div>
              {bulkPreviewUrl ? (
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  <img
                    src={bulkPreviewUrl}
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
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder={t('managerCustody.bulkNotePlaceholder')}
                  rows={2}
                  disabled={bulkSubmitting}
                />
              </div>
              <Button
                type="button"
                className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={bulkSubmitting || !bulkFile}
                onClick={() => void onBulkSubmit()}
              >
                {bulkSubmitting ? (
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
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <Card
      className={cn(
        'border shadow-sm',
        tone === 'danger'
          ? 'border-red-200 bg-red-50/60'
          : 'border-zinc-200 bg-white',
      )}
    >
      <CardContent className="flex items-center gap-3 py-4">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

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
          {/* V19.17 — same "سند استلام" voucher the driver sees. Opens
              the shared printable A4 sheet (RBAC is re-enforced on
              the backend for each bag). */}
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

function DriverHandoverRow({
  row,
  approving,
  disabled,
  onConfirm,
}: {
  row: DriverBalanceRow;
  approving: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="rounded-lg bg-white p-1.5 text-amber-700 shadow-sm"
        >
          <HandCoins className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-900">
            {row.fullName}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              @{row.username}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {row.pendingSettlementOrderCount}{' '}
            {t('managerCustody.ordersSettled')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-end">
          <p className="text-xs text-muted-foreground">
            {t('managerCustody.colAmount')}
          </p>
          <p className="text-base font-semibold tabular-nums text-zinc-900">
            {formatKwdLabel(row.heldCashTotal)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          disabled={approving || disabled}
          onClick={onConfirm}
        >
          {approving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckSquare className="h-4 w-4" aria-hidden />
          )}
          {t('managerCustody.confirmReceiptCta')}
        </Button>
      </div>
    </div>
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
