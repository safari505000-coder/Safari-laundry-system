import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, Hash, Loader2, RefreshCw } from 'lucide-react';
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
  const isOwner = hasRole('OWNER', 'GENERAL_MANAGER');

  const [drivers, setDrivers] = useState<DriverPrefixRow[] | null>(null);
  const [log, setLog] = useState<SerialLog | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * V1.5.5 — per-row editor state. We keep a parallel map of the current
   * input value for each driver row so the "Prefix" column can always be
   * an editable Input, committing only on blur/Enter instead of on every
   * keystroke. Avoids one PATCH per character.
   */
  const [pendingPrefix, setPendingPrefix] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Flashes a green check next to the input on a successful save. */
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

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

  /**
   * Commit the pending prefix for this driver. Called on blur and on
   * Enter. No-ops if the value hasn't changed so tab-through doesn't
   * generate a storm of PATCHes.
   */
  const commitPrefix = useCallback(
    async (row: DriverPrefixRow) => {
      if (!token) return;
      const raw = (pendingPrefix[row.id] ?? row.driverPrefix ?? '').trim();
      const normalised = raw.toUpperCase();
      const currentSaved = (row.driverPrefix ?? '').toUpperCase();
      if (normalised === currentSaved) {
        return;
      }
      if (normalised && !/^[A-Z]$/.test(normalised)) {
        toast.error(t('ownerSerials.invalidPrefix'));
        setPendingPrefix((prev) => ({ ...prev, [row.id]: currentSaved }));
        return;
      }
      setSavingId(row.id);
      try {
        const updated = await apiJson<DriverPrefixRow>(
          `/api/owner/serials/drivers/${row.id}`,
          {
            method: 'PATCH',
            token,
            body: JSON.stringify({
              driverPrefix: normalised.length === 1 ? normalised : null,
            }),
          },
        );
        setDrivers((prev) =>
          prev ? prev.map((d) => (d.id === row.id ? updated : d)) : prev,
        );
        setPendingPrefix((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        setLastSavedId(row.id);
        window.setTimeout(() => {
          setLastSavedId((current) => (current === row.id ? null : current));
        }, 1200);
        toast.success(t('ownerSerials.prefixSaved'));
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
        // Revert the pending value to the server truth so the UI doesn't
        // drift from the database on failure.
        setPendingPrefix((prev) => ({ ...prev, [row.id]: currentSaved }));
      } finally {
        setSavingId(null);
      }
    },
    [pendingPrefix, token, t],
  );

  const handlePrefixKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, row: DriverPrefixRow) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPendingPrefix((prev) => ({
          ...prev,
          [row.id]: (row.driverPrefix ?? '').toUpperCase(),
        }));
        (e.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <Hash className="h-5 w-5 text-primary" aria-hidden />
            {t('ownerSerials.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('ownerSerials.subtitle')}</p>
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
        <section className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm lg:col-span-2">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers === null ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    {loading ? t('ownerSerials.loading') : t('ownerSerials.unable')}
                  </TableCell>
                </TableRow>
              ) : drivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    {t('ownerSerials.emptyDrivers')}
                  </TableCell>
                </TableRow>
              ) : (
                drivers.map((d) => {
                  const pending = pendingPrefix[d.id];
                  const value =
                    pending !== undefined ? pending : (d.driverPrefix ?? '');
                  const rowSaving = savingId === d.id;
                  const rowJustSaved = lastSavedId === d.id;
                  return (
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
                      <TableCell className="text-center">
                        <div className="inline-flex items-center gap-2">
                          <Input
                            type="text"
                            inputMode="text"
                            maxLength={1}
                            value={value}
                            placeholder="—"
                            disabled={rowSaving}
                            onChange={(e) =>
                              setPendingPrefix((prev) => ({
                                ...prev,
                                [d.id]: e.target.value
                                  .replace(/[^a-zA-Z]/g, '')
                                  .toUpperCase(),
                              }))
                            }
                            onBlur={() => void commitPrefix(d)}
                            onKeyDown={(e) => handlePrefixKeyDown(e, d)}
                            className="h-9 w-14 text-center text-lg font-semibold tabular-nums"
                            aria-label={t('ownerSerials.prefixCol')}
                          />
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center"
                            aria-live="polite"
                          >
                            {rowSaving ? (
                              <Loader2
                                className="h-4 w-4 animate-spin text-muted-foreground"
                                aria-hidden
                              />
                            ) : rowJustSaved ? (
                              <CheckCircle2
                                className="h-4 w-4 text-emerald-600"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </section>

        <section className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm lg:col-span-3">
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
