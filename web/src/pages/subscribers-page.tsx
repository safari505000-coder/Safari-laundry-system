import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
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
import { type SubscriberListRow, apiJson, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';

const POLL_MS = 12_000;

function rowTone(status: SubscriberListRow['rowStatus']): string {
  switch (status) {
    case 'expired':
      return 'border-s-4 border-slate-400 bg-slate-100/90 text-muted-foreground dark:bg-slate-900/40';
    case 'active_warn':
      return 'border-s-4 border-red-600 bg-red-50/90 text-foreground dark:bg-red-950/40 dark:text-red-50';
    case 'active_ok':
    case 'open_credit':
      return 'border-s-4 border-emerald-600 bg-emerald-50/80 text-foreground dark:bg-emerald-950/35 dark:text-emerald-50';
    default:
      return '';
  }
}

function isCriticalBalance(balance: string): boolean {
  const n = Number.parseFloat(balance);
  return Number.isFinite(n) && n < 10;
}

function SubscriberCard({
  r,
  formatDate,
}: {
  r: SubscriberListRow;
  formatDate: (iso: string | null) => string;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        'rounded-xl border border-border/60 p-4 shadow-sm',
        rowTone(r.rowStatus),
      )}
    >
      <p className="font-semibold text-foreground">{r.customerName}</p>
      <p className="mt-1 text-sm text-muted-foreground">{r.subscriptionType}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-xs sm:text-sm">
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colStart')}</dt>
          <dd className="tabular-nums font-medium">{formatDate(r.startDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colExpiry')}</dt>
          <dd className="tabular-nums font-medium">{formatDate(r.expiryDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colRemaining')}</dt>
          <dd className="tabular-nums font-medium">
            {r.remainingDays === null ? 'â€”' : r.remainingDays}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colBalance')}</dt>
          <dd
            className={cn(
              'tabular-nums font-semibold',
              isCriticalBalance(r.balance) && 'text-red-700',
            )}
          >
            {formatKwdLabel(r.balance)}
          </dd>
          {isCriticalBalance(r.balance) ? (
            <div className="col-span-2 text-xs font-semibold text-red-700">
              {t('subscribers.lowBalanceWarn')}
            </div>
          ) : null}
        </div>
      </dl>
    </article>
  );
}

export function SubscribersPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, hasRole } = useAuth();
  const allowed = hasRole('OWNER', 'CALL_CENTER');

  const [rows, setRows] = useState<SubscriberListRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const data = await apiJson<SubscriberListRow[]>('/api/subscribers', {
          token,
        });
        setRows(data);
      } catch (e) {
        if (e instanceof ApiError) {
          toast.error(e.message);
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [token, allowed],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !allowed) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, allowed, load]);

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'â€”';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'â€”';
    return dateFmt.format(d);
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {t('subscribers.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('subscribers.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="default"
          className="h-11 min-h-11 w-full touch-manipulation gap-2 sm:w-auto"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            className={cn('h-4 w-4', loading && 'animate-spin')}
            aria-hidden
          />
          {t('subscribers.refresh')}
        </Button>
      </header>

      <section className="md:hidden">
        {rows === null ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {loading ? t('subscribers.loading') : t('subscribers.unable')}
          </p>
        : rows.length === 0 ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t('subscribers.empty')}
          </p>
        : <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.customerId}>
                <SubscriberCard r={r} formatDate={formatDate} />
              </li>
            ))}
          </ul>
        }
      </section>

      <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-border dark:bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colCustomer')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colPlan')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colStart')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colExpiry')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colRemaining')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colBalance')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ?
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {loading ? t('subscribers.loading') : t('subscribers.unable')}
                </TableCell>
              </TableRow>
            : rows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {t('subscribers.empty')}
                </TableCell>
              </TableRow>
            : rows.map((r) => (
                <TableRow
                  key={r.customerId}
                  className={cn(rowTone(r.rowStatus), 'align-middle')}
                >
                  <TableCell className="max-w-[10rem] font-medium">
                    {r.customerName}
                  </TableCell>
                  <TableCell className="max-w-[8rem] text-sm">
                    {r.subscriptionType}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {formatDate(r.startDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {formatDate(r.expiryDate)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm">
                    {r.remainingDays === null ? 'â€”' : r.remainingDays}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-end tabular-nums text-sm font-medium',
                      isCriticalBalance(r.balance) && 'text-red-700',
                    )}
                  >
                    {formatKwdLabel(r.balance)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

