import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  CheckCircle2,
  HandCoins,
  Info,
  Landmark,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { ApiError, apiJson, type OrderRow } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { cn } from '@/lib/utils';

/*
 * Dastur §3 — Driver's personal custody ("عهدتي الشخصية") as a LIVE STATEMENT.
 *
 * This page is DRIVER-only (see RequireRoles below). The manager-side
 * bank-deposit flow (photo of slip + accountant verification) lives on a
 * completely separate route (/manager/custody → MyCustodyPage) and is NOT
 * affected by this refactor.
 *
 * Shape of the page:
 *   1. Instruction banner — describes the driver's liability in plain Arabic.
 *   2. Method tiles (Cash / K-Net / Payment link) + grand-total strip.
 *   3. Unified invoice list across all methods.
 *   4. A single "Notify Manager for Handover" CTA — UI-only handshake.
 *
 * Why no deposit form?
 *   Drivers hand cash physically to the branch manager; they don't submit
 *   bank slips. All slip uploads and accountant verification happen on the
 *   manager's dashboard AFTER the manager presses "Confirm Receipt" on
 *   /collect-driver-cash. The 24h aging clock starts there too — not here.
 */

type PendingMethod = 'CASH' | 'KNET' | 'PAYMENT_LINK';

function whatsappHref(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('965') ? digits : `965${digits}`}`;
}

function sumTotals(list: OrderRow[]): number {
  let n = 0;
  for (const r of list) n += Number.parseFloat(r.totalPrice) || 0;
  return n;
}

function MyCustodyContent() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiJson<OrderRow[]>('/api/orders', { token });
      setOrders(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => o.status === 'COMPLETED' && o.cashStatus === 'PAID_TO_DRIVER',
      ),
    [orders],
  );

  const cashRows = useMemo(
    () => pending.filter((o) => o.posPaymentMethod === 'CASH'),
    [pending],
  );
  const knetRows = useMemo(
    () => pending.filter((o) => o.posPaymentMethod === 'KNET'),
    [pending],
  );
  const linkRows = useMemo(
    () => pending.filter((o) => o.posPaymentMethod === 'PAYMENT_LINK'),
    [pending],
  );

  const cashTotal = useMemo(() => sumTotals(cashRows), [cashRows]);
  const knetTotal = useMemo(() => sumTotals(knetRows), [knetRows]);
  const linkTotal = useMemo(() => sumTotals(linkRows), [linkRows]);
  const grandTotal = cashTotal + knetTotal + linkTotal;

  /*
   * Merge all three methods into a single chronological table for the
   * driver's "Live Statement" view — most recent invoices first. Keep the
   * method column so it still maps back to the three tiles above.
   */
  const allRows = useMemo(
    () =>
      [...cashRows, ...knetRows, ...linkRows].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [cashRows, knetRows, linkRows],
  );

  const hasAnyPending = grandTotal > 0;

  function notifyManager() {
    /*
     * Strict "no-backend-change" constraint (current mission): this button
     * is a pure UI handshake. The branch manager already sees the driver's
     * live totals via /api/finance/driver-balance on their own dashboard
     * (MyCustodyPage → "Driver Handover Approval" section). So "notifying"
     * them really just means reassuring the driver + closing the dialog.
     */
    toast.success(t('myDeposits.notifyManagerSuccess'));
    setNotifyOpen(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-2 py-4 sm:px-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('myDeposits.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('myDeposits.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
          aria-label="refresh"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </header>

      {/* Dastur §3 — explicit driver-facing liability instruction. */}
      <div
        role="note"
        className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm"
      >
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <p>{t('myDeposits.alert')}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MethodTile
          icon={<HandCoins className="h-4 w-4" aria-hidden />}
          label={t('myDeposits.methodCash')}
          total={cashTotal}
          count={cashRows.length}
          tone="amber"
        />
        <MethodTile
          icon={<Landmark className="h-4 w-4" aria-hidden />}
          label={t('myDeposits.methodKnet')}
          total={knetTotal}
          count={knetRows.length}
          tone="sky"
        />
        <MethodTile
          icon={<Link2 className="h-4 w-4" aria-hidden />}
          label={t('myDeposits.methodLink')}
          total={linkTotal}
          count={linkRows.length}
          tone="violet"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <Banknote className="h-4 w-4" aria-hidden />
          {t('myDeposits.grandTotalLabel')}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold tabular-nums text-zinc-900">
            {formatKwdLabel(grandTotal)}
          </div>
          <Button
            type="button"
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!hasAnyPending || orders === null}
            onClick={() => setNotifyOpen(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t('myDeposits.notifyManagerCta')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('myDeposits.invoicesTitle')}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('myDeposits.invoicesHint')}
          </p>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          {orders !== null && allRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2
                className="h-10 w-10 text-emerald-600"
                aria-hidden
              />
              <p className="max-w-sm text-sm text-emerald-700">
                {t('myDeposits.invoicesEmpty')}
              </p>
            </div>
          ) : null}
          {allRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('myDeposits.colCustomer')}</TableHead>
                  <TableHead>{t('myDeposits.colPhone')}</TableHead>
                  <TableHead>{t('myDeposits.colMethod')}</TableHead>
                  <TableHead className="text-end">
                    {t('myDeposits.colAmount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRows.map((r) => {
                  const phone = r.customer.phone || r.customer.phone2 || '';
                  const href = whatsappHref(phone);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.customer.displayName || phone || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-2">
                          <span>{phone || '-'}</span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#25D366]"
                              aria-label="whatsapp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={r.posPaymentMethod as PendingMethod | null | undefined} />
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatKwdLabel(r.totalPrice)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={notifyOpen}
        onOpenChange={(open) => setNotifyOpen(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('myDeposits.notifyManagerTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t('myDeposits.notifyManagerBody')}
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 tabular-nums">
              <DialogLine
                label={t('myDeposits.methodCash')}
                value={cashTotal}
                count={cashRows.length}
              />
              <DialogLine
                label={t('myDeposits.methodKnet')}
                value={knetTotal}
                count={knetRows.length}
              />
              <DialogLine
                label={t('myDeposits.methodLink')}
                value={linkTotal}
                count={linkRows.length}
              />
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{t('myDeposits.grandTotalLabel')}</span>
                <span>{formatKwdLabel(grandTotal)}</span>
              </div>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('myDeposits.notifyManagerHint24h')}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNotifyOpen(false)}
            >
              {t('myDeposits.notifyManagerCancel')}
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={notifyManager}
            >
              {t('myDeposits.notifyManagerOk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MethodTile({
  icon,
  label,
  total,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  total: number;
  count: number;
  tone: 'amber' | 'sky' | 'violet';
}) {
  const { t } = useTranslation();
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/60 text-amber-900'
      : tone === 'sky'
        ? 'border-sky-200 bg-sky-50/60 text-sky-900'
        : 'border-violet-200 bg-violet-50/60 text-violet-900';
  return (
    <Card className={cn('border shadow-sm', toneClass)}>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="rounded-md bg-white/70 p-1.5 text-current shadow-sm"
          >
            {icon}
          </span>
          <div>
            <p className="text-xs opacity-80">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatKwdLabel(total)}
            </p>
          </div>
        </div>
        <div className="text-xs opacity-75">
          {count} {t('myDeposits.invoiceCountSuffix')}
        </div>
      </CardContent>
    </Card>
  );
}

function DialogLine({
  label,
  value,
  count,
}: {
  label: string;
  value: number;
  count: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        {label}
        <span className="ms-1 opacity-70">
          ({count} {t('myDeposits.invoiceCountSuffix')})
        </span>
      </span>
      <span>{formatKwdLabel(value)}</span>
    </div>
  );
}

function MethodBadge({
  method,
}: {
  method?: PendingMethod | null | undefined;
}) {
  const { t } = useTranslation();
  if (method === 'KNET') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
        <Landmark className="h-3 w-3" aria-hidden />
        {t('myDeposits.methodKnet')}
      </span>
    );
  }
  if (method === 'PAYMENT_LINK') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
        <Link2 className="h-3 w-3" aria-hidden />
        {t('myDeposits.methodLink')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <HandCoins className="h-3 w-3" aria-hidden />
      {t('myDeposits.methodCash')}
    </span>
  );
}

export function MyDepositsPage() {
  return (
    <RequireRoles roles={['DRIVER']}>
      <MyCustodyContent />
    </RequireRoles>
  );
}
