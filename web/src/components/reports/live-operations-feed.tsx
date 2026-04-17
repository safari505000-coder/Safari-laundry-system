import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Loader2, Receipt } from 'lucide-react';
import {
  type LiveFeedOrder,
  type LiveFeedResponse,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { useRelativeTime } from '@/modules/shared/hooks/use-relative-time';
import { formatKwdLabel } from '@/lib/kwd';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const POLL_MS = 12_000;

type Props = {
  token: string | null;
  className?: string;
  /** Larger type and stronger frame (e.g. owner executive layout). */
  prominent?: boolean;
};

function FeedRowTime({ createdAt }: { createdAt: string }) {
  const dateLocale = useAppLocale();
  const rel = useRelativeTime(createdAt, dateLocale, 25_000);
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">{rel}</span>
  );
}

export function LiveOperationsFeed({
  token,
  className,
  prominent = false,
}: Props) {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const [orders, setOrders] = useState<LiveFeedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LiveFeedOrder | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiJson<LiveFeedResponse>(
        '/api/reports/live-feed?limit=10',
        { token },
      );
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) {
        /* avoid toast spam on background poll */
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetchFeed();
    const id = window.setInterval(() => {
      if (!cancelled) void fetchFeed();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, fetchFeed]);

  return (
    <>
      <Card
        className={cn(
          'print:hidden',
          prominent ?
            'border-primary/30 bg-gradient-to-b from-primary/[0.06] to-card shadow-md ring-1 ring-primary/15'
          : 'border-primary/15 shadow-sm',
          className,
        )}
      >
        <CardHeader className={cn('space-y-1', prominent ? 'pb-3 pt-1' : 'pb-2')}>
          <div className="flex items-center justify-between gap-2">
            <CardTitle
              className={cn(
                'flex items-center gap-2 font-semibold',
                prominent ? 'text-base' : 'text-sm',
              )}
            >
              <Activity
                className={cn(
                  'shrink-0 text-primary',
                  prominent ? 'h-5 w-5' : 'h-4 w-4',
                )}
                aria-hidden
              />
              {t('liveOps.title')}
            </CardTitle>
            <Badge
              variant="secondary"
              className={cn(
                'gap-1 font-normal',
                prominent ? 'text-[11px]' : 'text-[10px]',
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              {t('liveOps.live')}
            </Badge>
          </div>
          <p
            className={cn(
              'text-muted-foreground',
              prominent ? 'text-sm' : 'text-xs',
            )}
          >
            {t('liveOps.subtitle')}
          </p>
        </CardHeader>
        <CardContent
          className={cn('px-2 pb-3 pt-0 sm:px-3', prominent && 'sm:px-4')}
        >
          {loading && orders.length === 0 ?
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          : orders.length === 0 ?
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('liveOps.empty')}
            </p>
          : (
            <ScrollArea
              className={cn(
                prominent ?
                  'h-[min(520px,58vh)] sm:h-[min(560px,62vh)]'
                : 'h-[min(420px,50vh)] sm:h-[min(480px,55vh)]',
              )}
            >
              <ul className={cn('pe-2', prominent ? 'space-y-1.5' : 'space-y-1')}>
                {orders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setDetail(o)}
                      className={cn(
                        'flex w-full flex-col rounded-lg border border-transparent text-start transition-colors',
                        prominent ?
                          'gap-1 px-3 py-2.5 hover:border-primary/20 hover:bg-primary/[0.04]'
                        : 'gap-0.5 px-2 py-2 hover:border-border hover:bg-muted/50 active:bg-muted',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'font-mono font-medium text-foreground',
                            prominent ? 'text-sm' : 'text-xs',
                          )}
                        >
                          {o.invoiceNumber?.trim() || `#${o.id.slice(0, 8)}`}
                        </span>
                        <FeedRowTime createdAt={o.createdAt} />
                      </div>
                      <div
                        className={cn(
                          'flex items-center justify-between gap-2 text-muted-foreground',
                          prominent ? 'text-xs' : 'text-[11px]',
                        )}
                      >
                        <span className="truncate">
                          {o.branchName ?
                            <span className="text-foreground/90">{o.branchName}</span>
                          : '—'}{' '}
                          آ· {o.customerName}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'font-semibold tabular-nums text-primary',
                          prominent ? 'text-sm' : 'text-xs',
                        )}
                      >
                        {formatKwdLabel(o.totalPrice)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-8 w-full text-xs"
            onClick={() => void fetchFeed()}
          >
            {t('liveOps.refresh')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pe-8">
              <Receipt className="h-4 w-4 shrink-0" aria-hidden />
              {detail ?
                detail.invoiceNumber?.trim() || `#${detail.id.slice(0, 8)}`
              : ''}
            </DialogTitle>
            {detail ?
              <p className="text-xs text-muted-foreground">
                {detail.branchName ?? '—'} آ· {detail.customerName} آ·{' '}
                {formatKwdLabel(detail.totalPrice)} آ·{' '}
                {new Date(detail.createdAt).toLocaleString(dateLocale)}
              </p>
            : null}
          </DialogHeader>
          {detail ?
            <ScrollArea className="max-h-[50vh]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="py-1.5 pe-2 font-medium">
                      {t('liveOps.colItem')}
                    </th>
                    <th className="py-1.5 pe-2 text-end font-medium">
                      {t('liveOps.colQty')}
                    </th>
                    <th className="py-1.5 text-end font-medium">
                      {t('liveOps.colPrice')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line, idx) => (
                    <tr
                      key={`${detail.id}-${idx}-${line.label ?? ''}`}
                      className="border-b border-border/50"
                    >
                      <td className="py-1.5 pe-2">
                        {line.label?.trim() || t('liveOps.unnamedLine')}
                      </td>
                      <td className="py-1.5 pe-2 text-end tabular-nums">
                        {line.quantity}
                      </td>
                      <td className="py-1.5 text-end tabular-nums">
                        {formatKwdLabel(line.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.lineItemCount > detail.lines.length ?
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t('liveOps.moreLines', {
                    count: detail.lineItemCount - detail.lines.length,
                  })}
                </p>
              : null}
            </ScrollArea>
          : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

