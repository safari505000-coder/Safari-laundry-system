import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  CheckCircle2,
  Hash,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  type DriverPrefixRow,
  type SerialLog,
  apiJson,
  ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * Dastur §1 (V1.5) — Owner-only Serial Management.
 *
 * Left panel: assign / clear single-letter prefixes to drivers.
 * Right panel: live global serial log (most recent `<Prefix>-<N>` orders).
 */
export function OwnerSerialsPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, hasRole } = useAuth();
  const isOwner = hasRole('OWNER');

  const [drivers, setDrivers] = useState<DriverPrefixRow[] | null>(null);
  const [log, setLog] = useState<SerialLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const dateTimeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !isOwner) return;
      if (!opts?.silent) setLoading(true);
      try {
        const [ds, lg] = await Promise.all([
          apiJson<DriverPrefixRow[]>('/api/owner/serials/drivers', { token }),
          apiJson<SerialLog>('/api/owner/serials/log?limit=50', { token }),
        ]);
        setDrivers(ds);
        setLog(lg);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, isOwner],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (row: DriverPrefixRow) => {
    setEditingId(row.id);
    setEditValue(row.driverPrefix ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const commitEdit = async (userId: string) => {
    const normalised = editValue.trim().toUpperCase();
    if (normalised && !/^[A-Z]$/.test(normalised)) {
      toast.error(t('ownerSerials.invalidPrefix'));
      return;
    }
    if (!token) return;
    setSaving(true);
    try {
      const updated = await apiJson<DriverPrefixRow>(
        `/api/owner/serials/drivers/${userId}`,
        {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            driverPrefix: normalised.length === 1 ? normalised : null,
          }),
        },
      );
      setDrivers((prev) =>
        prev ? prev.map((d) => (d.id === userId ? updated : d)) : prev,
      );
      toast.success(t('ownerSerials.prefixSaved'));
      cancelEdit();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            <Hash className="h-5 w-5 text-primary" aria-hidden />
            {t('ownerSerials.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('ownerSerials.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {log ? (
            <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium tabular-nums">
              {t('ownerSerials.currentCounter')}:{' '}
              <strong>{log.currentCounter}</strong>
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="default"
            className="h-11 min-h-11 gap-2"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn('h-4 w-4', loading && 'animate-spin')}
              aria-hidden
            />
            {t('ownerSerials.refresh')}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="min-w-0 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-border dark:bg-card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">
            {t('ownerSerials.driversHeading')}
          </h2>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('ownerSerials.driverCol')}</TableHead>
                <TableHead>{t('ownerSerials.branchCol')}</TableHead>
                <TableHead className="text-center">
                  {t('ownerSerials.prefixCol')}
                </TableHead>
                <TableHead className="text-end">
                  {t('ownerSerials.actionCol')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers === null ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {loading ? t('ownerSerials.loading') : t('ownerSerials.unable')}
                  </TableCell>
                </TableRow>
              ) : drivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {t('ownerSerials.emptyDrivers')}
                  </TableCell>
                </TableRow>
              ) : (
                drivers.map((d) => (
                  <TableRow key={d.id} className={cn(!d.isActive && 'opacity-60')}>
                    <TableCell className="font-medium">
                      {d.fullName || d.username}
                      {!d.isActive ? (
                        <span className="ms-2 text-[11px] text-muted-foreground">
                          ({t('ownerSerials.inactive')})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.branchName ?? '—'}
                    </TableCell>
                    <TableCell className="text-center text-lg font-semibold tabular-nums">
                      {editingId === d.id ? (
                        <Input
                          autoFocus
                          maxLength={1}
                          value={editValue}
                          onChange={(e) =>
                            setEditValue(
                              e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase(),
                            )
                          }
                          className="mx-auto h-9 w-14 text-center font-semibold"
                          aria-label={t('ownerSerials.prefixCol')}
                        />
                      ) : (
                        d.driverPrefix ?? (
                          <span className="text-muted-foreground">—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {editingId === d.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            disabled={saving}
                            onClick={() => void commitEdit(d.id)}
                            aria-label={t('ownerSerials.save')}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={cancelEdit}
                            aria-label={t('ownerSerials.cancel')}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => startEdit(d)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          {t('ownerSerials.edit')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        <section className="min-w-0 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-border dark:bg-card lg:col-span-3">
          <h2 className="mb-2 text-sm font-semibold">
            {t('ownerSerials.logHeading')}
          </h2>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('ownerSerials.serialCol')}</TableHead>
                <TableHead>{t('ownerSerials.driverCol')}</TableHead>
                <TableHead>{t('ownerSerials.customerCol')}</TableHead>
                <TableHead className="text-end tabular-nums">
                  {t('ownerSerials.totalCol')}
                </TableHead>
                <TableHead>{t('ownerSerials.dateCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log === null ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {loading ? t('ownerSerials.loading') : t('ownerSerials.unable')}
                  </TableCell>
                </TableRow>
              ) : log.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {t('ownerSerials.emptyLog')}
                  </TableCell>
                </TableRow>
              ) : (
                log.rows.map((r) => (
                  <TableRow key={r.orderId}>
                    <TableCell className="font-mono font-semibold tracking-tight">
                      {r.serialNumber}
                    </TableCell>
                    <TableCell className="text-sm">{r.driverName ?? '—'}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-sm">
                      {r.customerName ?? '—'}
                    </TableCell>
                    <TableCell className="text-end text-sm tabular-nums">
                      {formatKwdLabel(r.totalPriceKd)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {dateTimeFmt.format(new Date(r.createdAtIso))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}

export default OwnerSerialsPage;
