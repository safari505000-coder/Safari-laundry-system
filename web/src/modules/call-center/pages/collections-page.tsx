import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  type CollectionUnpaidOnlineRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { collectionsUnpaidWhatsAppHref } from '@/modules/shared/lib/whatsapp-links';
import { Button } from '@/modules/shared/components/ui/button';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';

/** Faster refresh for debt-radar follow-up (WhatsApp triggers). */
const POLL_MS = 8_000;

export function CollectionsPage() {
  const { t } = useTranslation();
  const { token, hasRole, user } = useAuth();
  const allowed = hasMasterIslandAccess(user) || hasRole('CALL_CENTER');
  const [rows, setRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        const data = await apiJson<CollectionUnpaidOnlineRow[]>(
          '/api/orders/collections/unpaid-online',
          { token },
        );
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts?.silent) setLoading(false);
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 py-4 sm:space-y-6 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t('collections.title')}
            </h1>
            <Badge variant="secondary" className="font-normal">
              {rows.length} {t('collections.radarBadge')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t('collections.subtitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('collections.debtRadarHint', { seconds: POLL_MS / 1000 })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load({ silent: false })}
        >
          {loading ?
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          : <RefreshCw className="me-2 h-4 w-4" />}
          {t('collections.refresh')}
        </Button>
      </header>

      <div className="md:hidden">
        {loading && rows.length === 0 ?
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        : null}
        {!loading && rows.length === 0 ?
          <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
            {t('collections.empty')}
          </p>
        : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const href = collectionsUnpaidWhatsAppHref(row);
            return (
              <li
                key={row.orderId}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="font-mono text-[11px] text-muted-foreground">{row.orderId}</p>
                <p className="mt-1 font-semibold text-foreground">{row.customerName}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{row.customerPhone}</p>
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground">
                  {row.amountKd} KWD
                </p>
                {href ?
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.99]"
                  >
                    <MessageCircle className="h-5 w-5 shrink-0" />
                    {t('collections.whatsapp')}
                  </a>
                : <p className="mt-2 text-xs text-muted-foreground">—</p>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('collections.colOrderId')}</TableHead>
              <TableHead>{t('collections.colCustomer')}</TableHead>
              <TableHead>{t('collections.colPhone')}</TableHead>
              <TableHead className="text-end">
                {t('collections.colAmount')}
              </TableHead>
              <TableHead className="w-[140px] text-center">
                {t('collections.colWhatsapp')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ?
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            : null}
            {!loading && rows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t('collections.empty')}
                </TableCell>
              </TableRow>
            : null}
            {rows.map((row) => {
              const href = collectionsUnpaidWhatsAppHref(row);
              return (
                <TableRow key={row.orderId}>
                  <TableCell className="font-mono text-xs">
                    {row.orderId}
                  </TableCell>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell className="tabular-nums">{row.customerPhone}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.amountKd}
                  </TableCell>
                  <TableCell className="text-center">
                    {href ?
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-10 min-w-[120px] items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                      >
                        <MessageCircle className="me-1.5 h-4 w-4" />
                        {t('collections.whatsapp')}
                      </a>
                    : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
