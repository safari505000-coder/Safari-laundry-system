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
  Upload,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  attachDepositSlip,
  listMyManagerCustody,
  uploadDepositSlipImage,
  type ManagerCashCustodyRow,
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
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Dastur §3 — Manager Accountability: my custody bags + deposit slip upload. */
export function MyCustodyPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const [rows, setRows] = useState<ManagerCashCustodyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ManagerCashCustodyRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const canUse = hasRole('MANAGER', 'OWNER') ?? false;

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    try {
      const d = await listMyManagerCustody(token);
      setRows(d);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
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
    return () => {
      c = true;
    };
  }, [token, canUse]);

  useEffect(() => {
    if (!file) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    previewUrlRef.current = u;
    setPreviewUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [file]);

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

  async function onSubmit() {
    if (!token || !target || !file) return;
    setSubmitting(true);
    try {
      const { depositSlipUrl } = await uploadDepositSlipImage(token, file);
      await attachDepositSlip(token, target.id, {
        depositSlipUrl,
        note: note.trim() || undefined,
      });
      toast.success(t('managerCustody.slipUploaded'));
      setTarget(null);
      setFile(null);
      setNote('');
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
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
            <CustodyCard
              key={r.id}
              row={r}
              dateLocale={dateLocale}
              onUploadSlip={() => {
                setFile(null);
                setNote('');
                setTarget(r);
              }}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setFile(null);
            setNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('managerCustody.uploadSlipTitle')}</DialogTitle>
          </DialogHeader>
          {target ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {t('managerCustody.colDriver')}
                </p>
                <p className="font-medium">{target.driverName}</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {t('managerCustody.colAmount')}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatKwdLabel(target.amountKd)}
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custody-slip">
                  {t('managerCustody.slipLabel')}
                </Label>
                <Input
                  id="custody-slip"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="cursor-pointer"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {previewUrl ? (
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-48 w-full bg-zinc-100 object-contain"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="custody-note">
                  {t('managerCustody.noteLabel')}
                </Label>
                <Textarea
                  id="custody-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('managerCustody.notePlaceholder')}
                  rows={2}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={submitting}
            >
              {t('managerCustody.cancel')}
            </Button>
            <Button
              type="button"
              disabled={submitting || !file}
              onClick={() => void onSubmit()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('managerCustody.submitSlip')
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
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CustodyCard({
  row,
  dateLocale,
  onUploadSlip,
}: {
  row: ManagerCashCustodyRow;
  dateLocale: string | undefined;
  onUploadSlip: () => void;
}) {
  const { t } = useTranslation();
  const canUpload = row.status === 'PENDING_DEPOSIT' || row.status === 'REJECTED';
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
          {canUpload ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
              onClick={onUploadSlip}
            >
              <Upload className="h-4 w-4" />
              {row.status === 'REJECTED'
                ? t('managerCustody.reuploadSlip')
                : t('managerCustody.uploadSlipCta')}
            </Button>
          ) : null}
          {row.status === 'VERIFIED' ? (
            <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('managerCustody.closed')}
            </Badge>
          ) : null}
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
