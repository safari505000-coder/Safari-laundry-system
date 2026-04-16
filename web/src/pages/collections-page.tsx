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
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const POLL_MS = 12_000;

function buildCollectionsWhatsAppText(row: CollectionUnpaidOnlineRow): string {
  return [
    `مرحباً ${row.customerName} \u{1F339}،`,
    `طلبك رقم ${row.orderId} من مصبغتنا أصبح جاهزاً.`,
    `إجمالي الحساب: ${row.amountKd} د.ك.`,
    'يرجى إتمام عملية الدفع عبر الرابط الآمن التالي لتأكيد التوصيل وتسوية الحساب:',
    row.paymentUrl,
    'شكراً لاختياركم خدماتنا!',
  ].join('\n');
}

function whatsappChatNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 8) return `965${d}`;
  if (d.startsWith('965') && d.length >= 11) return d.slice(0, 12);
  if (d.startsWith('0') && d.length === 9) return `965${d.slice(1)}`;
  if (d.length >= 8) return d;
  return null;
}

function whatsappHref(row: CollectionUnpaidOnlineRow): string | null {
  const n = whatsappChatNumber(row.customerPhone);
  if (!n) return null;
  const text = buildCollectionsWhatsAppText(row);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function CollectionsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const allowed = hasRole('CALL_CENTER') ?? false;
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
    <div className="mx-auto max-w-6xl space-y-6 px-2 py-4 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('collections.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('collections.subtitle')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('collections.pollingHint', { seconds: POLL_MS / 1000 })}
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

      <div className="rounded-xl border border-border bg-card">
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
              const href = whatsappHref(row);
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
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[#25D366] px-3 text-xs font-medium text-white hover:bg-[#20bd5a]"
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
