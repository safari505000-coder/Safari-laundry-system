import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/hooks/use-app-locale';
import {
  type SubscriberListRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';

const POLL_MS = 12_000;

function rowTone(status: SubscriberListRow['rowStatus']): string {
  switch (status) {
    case 'expired':
      return 'border-s-4 border-slate-400 bg-slate-50/90 text-muted-foreground';
    case 'active_warn':
      return 'border-s-4 border-red-500 bg-red-50/60';
    case 'active_ok':
    case 'open_credit':
      return 'border-s-4 border-emerald-600 bg-emerald-50/50';
    default:
      return '';
  }
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
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return dateFmt.format(d);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t('subscribers.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('subscribers.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
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

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('subscribers.colCustomer')}</TableHead>
              <TableHead>{t('subscribers.colPlan')}</TableHead>
              <TableHead>{t('subscribers.colStart')}</TableHead>
              <TableHead>{t('subscribers.colExpiry')}</TableHead>
              <TableHead className="text-end tabular-nums">
                {t('subscribers.colRemaining')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
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
                <TableRow key={r.customerId} className={cn(rowTone(r.rowStatus))}>
                  <TableCell className="font-medium">{r.customerName}</TableCell>
                  <TableCell>{r.subscriptionType}</TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {formatDate(r.startDate)}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {formatDate(r.expiryDate)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm">
                    {r.remainingDays === null ? '—' : r.remainingDays}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm font-medium">
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
