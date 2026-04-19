import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  getManagerCustodyAging,
  rejectManagerCustody,
  verifyManagerCustody,
  type ManagerCashCustodyRow,
  type ManagerCashCustodyStatus,
  type ManagerCustodyAgingResponse,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
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
import { Textarea } from '@/modules/shared/components/ui/textarea';
import { cn } from '@/lib/utils';

const ALL_STATUSES = 'ALL' as const;
type StatusFilter = ManagerCashCustodyStatus | typeof ALL_STATUSES;

/**
 * Dastur §3 — Cash Held by Managers (aging report).
 * Bags >=24h without VERIFIED status are rendered in RED (overdue alert).
 * OWNER gets the global view; ACCOUNTANT can verify / reject slips.
 */
export function ManagerCustodyAgingPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [data, setData] = useState<ManagerCustodyAgingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>(ALL_STATUSES);
  const [verifyTarget, setVerifyTarget] =
    useState<ManagerCashCustodyRow | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<ManagerCashCustodyRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // V19.2 — GENERAL_MANAGER inherits Accountant's audit posture, so GM must
  // see this aging queue just like OWNER and ACCOUNTANT. Backend already
  // allows GM on GET /manager-custody/aging; this gate was the UI lag.
  // Actions (verify/reject) remain ACCOUNTANT-only.
  const canView = hasRole('OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT');
  const canAct = hasRole('ACCOUNTANT');

  const load = useCallback(async () => {
    if (!token || !canView) return;
    try {
      const filters = status === ALL_STATUSES ? undefined : { status };
      const d = await getManagerCustodyAging(token, filters);
      setData(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    }
  }, [token, canView, status]);

  useEffect(() => {
    if (!token || !canView) {
      setLoading(false);
      return;
    }
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        const filters = status === ALL_STATUSES ? undefined : { status };
        const d = await getManagerCustodyAging(token, filters);
        if (!c) setData(d);
      } catch (e) {
        if (!c && e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, canView, status]);

  useEffect(() => {
    if (!token || !canView) return;
    pollRef.current = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [token, canView, load]);

  async function onVerify() {
    if (!token || !verifyTarget) return;
    setSubmitting(true);
    try {
      await verifyManagerCustody(token, verifyTarget.id);
      toast.success(t('managerCustody.verifiedToast'));
      setVerifyTarget(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onReject() {
    if (!token || !rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error(t('managerCustody.rejectReasonRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await rejectManagerCustody(token, rejectTarget.id, {
        rejectionReason: reason,
      });
      toast.success(t('managerCustody.rejectedToast'));
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const overdueRows = useMemo(() => rows.filter((r) => r.isOverdue), [rows]);
  const isRtl = i18n.dir() === 'rtl';

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('managerCustody.agingTitle')}
          </h1>
          <p className="text-sm text-zinc-500">
            {t('managerCustody.agingSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem]">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('managerCustody.statusFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>
                  {t('managerCustody.statusAll')}
                </SelectItem>
                <SelectItem value="PENDING_DEPOSIT">
                  {t('managerCustody.status.PENDING_DEPOSIT')}
                </SelectItem>
                <SelectItem value="AWAITING_VERIFICATION">
                  {t('managerCustody.status.AWAITING_VERIFICATION')}
                </SelectItem>
                <SelectItem value="REJECTED">
                  {t('managerCustody.status.REJECTED')}
                </SelectItem>
                <SelectItem value="VERIFIED">
                  {t('managerCustody.status.VERIFIED')}
                </SelectItem>
              </SelectContent>
            </Select>
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
        </div>
      </header>

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={<Clock className="h-4 w-4 text-amber-600" aria-hidden />}
          label={t('managerCustody.tilePending')}
          value={String(summary?.pendingCount ?? 0)}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4 text-sky-600" aria-hidden />}
          label={t('managerCustody.tileAwaiting')}
          value={String(summary?.awaitingVerificationCount ?? 0)}
        />
        <SummaryTile
          icon={
            <AlertTriangle
              className={cn(
                'h-4 w-4',
                (summary?.overdueCount ?? 0) > 0
                  ? 'text-red-600'
                  : 'text-zinc-400',
              )}
              aria-hidden
            />
          }
          label={t('managerCustody.tileOverdue')}
          value={String(summary?.overdueCount ?? 0)}
          tone={(summary?.overdueCount ?? 0) > 0 ? 'danger' : 'default'}
        />
        <SummaryTile
          icon={<Clock className="h-4 w-4 text-zinc-600" aria-hidden />}
          label={t('managerCustody.tileOverdueKd')}
          value={formatKwdLabel(summary?.totalOverdueKd ?? '0')}
          tone={(summary?.overdueCount ?? 0) > 0 ? 'danger' : 'default'}
        />
      </div>

      {overdueRows.length > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
          <p>
            <span className="font-semibold">
              {t('managerCustody.overdueBanner', {
                count: overdueRows.length,
                total: formatKwdLabel(summary?.totalOverdueKd ?? '0'),
              })}
            </span>
          </p>
        </div>
      ) : null}

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-zinc-900">
            {t('managerCustody.tableTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded" />
              <Skeleton className="h-9 w-full rounded" />
              <Skeleton className="h-9 w-full rounded" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {t('managerCustody.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('managerCustody.colManager')}</TableHead>
                    <TableHead>{t('managerCustody.colDriver')}</TableHead>
                    <TableHead>{t('managerCustody.colBranch')}</TableHead>
                    <TableHead className="text-end">
                      {t('managerCustody.colAmount')}
                    </TableHead>
                    <TableHead>{t('managerCustody.colReceived')}</TableHead>
                    <TableHead>{t('managerCustody.colAge')}</TableHead>
                    <TableHead>{t('managerCustody.colStatus')}</TableHead>
                    <TableHead className="text-end">
                      {t('managerCustody.colActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={cn(
                        r.isOverdue &&
                          'bg-red-50/60 hover:bg-red-50/80',
                      )}
                    >
                      <TableCell>
                        <div className="font-medium">{r.managerName}</div>
                        <div className="text-xs text-muted-foreground">
                          @{r.managerUsername}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{r.driverName}</div>
                        <div className="text-xs text-muted-foreground">
                          @{r.driverUsername}
                        </div>
                      </TableCell>
                      <TableCell>{r.branchName ?? '—'}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(r.amountKd)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(r.receivedFromDriverAt).toLocaleString(
                          dateLocale,
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'tabular-nums',
                            r.isOverdue
                              ? 'font-semibold text-red-700'
                              : 'text-zinc-700',
                          )}
                        >
                          {t('managerCustody.age', { hours: r.ageHours })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(statusTone(r), 'whitespace-nowrap')}
                        >
                          {t(`managerCustody.status.${r.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.depositSlipUrl ? (
                            <a
                              href={r.depositSlipUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-xs font-medium underline underline-offset-2 text-sky-700 hover:text-sky-900"
                            >
                              {t('managerCustody.viewSlip')}
                            </a>
                          ) : null}
                          {canAct &&
                          r.status === 'AWAITING_VERIFICATION' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setVerifyTarget(r)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {t('managerCustody.verifyCta')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1 border-red-300 text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setRejectReason('');
                                  setRejectTarget(r);
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                {t('managerCustody.rejectCta')}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verify dialog */}
      <Dialog
        open={!!verifyTarget}
        onOpenChange={(open) => {
          if (!open) setVerifyTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('managerCustody.verifyTitle')}</DialogTitle>
          </DialogHeader>
          {verifyTarget ? (
            <div className="space-y-3 text-sm">
              <p>
                {t('managerCustody.verifyBody', {
                  manager: verifyTarget.managerName,
                  amount: formatKwdLabel(verifyTarget.amountKd),
                })}
              </p>
              {verifyTarget.depositSlipUrl ? (
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  <img
                    src={verifyTarget.depositSlipUrl}
                    alt=""
                    className="max-h-60 w-full bg-zinc-100 object-contain"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerifyTarget(null)}
              disabled={submitting}
            >
              {t('managerCustody.cancel')}
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void onVerify()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('managerCustody.verifyConfirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('managerCustody.rejectTitle')}</DialogTitle>
          </DialogHeader>
          {rejectTarget ? (
            <div className="space-y-3 text-sm">
              <p>
                {t('managerCustody.rejectBody', {
                  manager: rejectTarget.managerName,
                  amount: formatKwdLabel(rejectTarget.amountKd),
                })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="reject-reason">
                  {t('managerCustody.rejectReasonLabel')}
                </Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder={t('managerCustody.rejectReasonPlaceholder')}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={submitting}
            >
              {t('managerCustody.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={submitting || rejectReason.trim().length < 3}
              onClick={() => void onReject()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('managerCustody.rejectConfirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
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
