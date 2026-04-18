import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  HandCoins,
  Landmark,
  Link2,
  MessageCircle,
  Send,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, type OrderRow } from '@/lib/api';
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

function whatsappHref(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.startsWith('965') ? d : `965${d}`}`;
}

function sumTotals(list: OrderRow[]): number {
  let n = 0;
  for (const r of list) n += Number.parseFloat(r.totalPrice) || 0;
  return n;
}

/**
 * Dastur §2.1 / §3 — Driver's "Handover to Manager" dashboard.
 *
 * Surfaces every pending invoice issued by the driver (COMPLETED +
 * cashStatus=PAID_TO_DRIVER) bucketed by POS payment method so the driver
 * can see exactly what they owe the branch manager before handover.
 *
 * NOTE (strict no-backend-change constraint): the "Request Settlement"
 * button is a UI handshake only. It confirms the driver's totals and
 * reminds them to hand the physical cash to their branch manager — the
 * actual status flip (PAID_TO_DRIVER → HANDED_OVER_TO_OFFICE) and the
 * 24h aging clock start the moment the manager clicks "Confirm Receipt"
 * on /collect-driver-cash (existing endpoint POST /manager-custody/
 * approve-receipt). No new status is introduced.
 */
export function MyCashCustodyPage() {
  const { t } = useTranslation();
  const { hasRole, token } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  if (!hasRole('DRIVER')) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!token) return;
    void apiJson<OrderRow[]>('/api/orders', { token }).then(setOrders);
  }, [token]);

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

  const hasAnyPending = grandTotal > 0;

  return (
    <div className="space-y-6">
      <Card
        className={
          hasAnyPending
            ? 'border-red-200 bg-red-50/70'
            : 'border-emerald-200 bg-emerald-50/70'
        }
      >
        <CardHeader>
          <CardTitle>{t('cashCustody.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {hasAnyPending
              ? t('cashCustody.goal')
              : t('cashCustody.handoverCompleteHint')}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {t('cashCustody.handoverSectionTitle')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('cashCustody.handoverSectionHint')}
            </p>
          </div>
          <Button
            type="button"
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!hasAnyPending || orders === null}
            onClick={() => setRequestOpen(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t('cashCustody.requestSettlement')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MethodTile
            icon={<HandCoins className="h-4 w-4" aria-hidden />}
            label={t('cashCustody.methodCash')}
            total={cashTotal}
            count={cashRows.length}
            tone="amber"
          />
          <MethodTile
            icon={<Landmark className="h-4 w-4" aria-hidden />}
            label={t('cashCustody.methodKnet')}
            total={knetTotal}
            count={knetRows.length}
            tone="sky"
          />
          <MethodTile
            icon={<Link2 className="h-4 w-4" aria-hidden />}
            label={t('cashCustody.methodLink')}
            total={linkTotal}
            count={linkRows.length}
            tone="violet"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Banknote className="h-4 w-4" aria-hidden />
            {t('cashCustody.grandTotalLabel')}
          </div>
          <div className="text-lg font-semibold tabular-nums text-zinc-900">
            {formatKwdLabel(grandTotal)}
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('cashCustody.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          {orders !== null && cashRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2
                className="h-10 w-10 text-emerald-600"
                aria-hidden
              />
              <p className="text-base font-semibold text-emerald-700">
                {t('cashCustody.handoverComplete')}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t('cashCustody.handoverCompleteHint')}
              </p>
            </div>
          ) : null}
          {cashRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cashCustody.colCustomer')}</TableHead>
                  <TableHead>{t('cashCustody.colPhone')}</TableHead>
                  <TableHead className="text-end">
                    {t('cashCustody.colAmount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashRows.map((r) => {
                  const phone = r.customer.phone || r.customer.phone2 || '';
                  const href = whatsappHref(phone);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.customer.displayName || phone}
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
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
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
        open={requestOpen}
        onOpenChange={(open) => setRequestOpen(open)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('cashCustody.handoverDialogTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t('cashCustody.handoverDialogBody')}
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 tabular-nums">
              <DialogLine
                label={t('cashCustody.methodCash')}
                value={cashTotal}
                count={cashRows.length}
              />
              <DialogLine
                label={t('cashCustody.methodKnet')}
                value={knetTotal}
                count={knetRows.length}
              />
              <DialogLine
                label={t('cashCustody.methodLink')}
                value={linkTotal}
                count={linkRows.length}
              />
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{t('cashCustody.grandTotalLabel')}</span>
                <span>{formatKwdLabel(grandTotal)}</span>
              </div>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('cashCustody.handoverDialogHint24h')}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(false)}
            >
              {t('cashCustody.handoverDialogCancel')}
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => setRequestOpen(false)}
            >
              {t('cashCustody.handoverDialogOk')}
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
          {count} {t('cashCustody.invoiceCountSuffix')}
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
          ({count} {t('cashCustody.invoiceCountSuffix')})
        </span>
      </span>
      <span>{formatKwdLabel(value)}</span>
    </div>
  );
}
