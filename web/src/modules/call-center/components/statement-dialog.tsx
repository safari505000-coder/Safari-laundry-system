import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerLedgerResponse } from '@/lib/api';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { cn } from '@/lib/utils';
import { customerStatementWhatsAppHref } from '@/modules/shared/lib/whatsapp-links';

/**
 * V19.8.5 — Customer statement export dialog.
 *
 * Opens from the Customer 360 panel "طباعة كشف حساب" button and gives
 * the Call Center agent two deliverables for the same filtered date
 * window: a branded A4 PDF/print sheet, or a concise WhatsApp summary
 * with a "ping us for a PDF" prompt.
 *
 * Date filters:
 *   • Preset chips (all / 30d / 90d / current-month / current-quarter /
 *     custom) — all Kuwait-local, rendered as `YYYY-MM-DD`.
 *   • Custom from/to inputs when "custom" is selected.
 *
 * Print flow:
 *   window.open(`/customers/:id/statement/print?from=&to=`, '_blank')
 * The dedicated print page reads those query params, forwards them to
 * `/api/call-center/customers/:id/ledger`, and auto-triggers the
 * browser print dialog once the ledger renders.
 *
 * WhatsApp flow:
 *   customerStatementWhatsAppHref(...) — Kuwait-normalised phone,
 *   greeting + balance/debt/plan summary. If the link opens in-app on
 *   desktop Chrome some users report WhatsApp Web already being
 *   signed in; a graceful `window.open` fallback is kept for agents
 *   still using a browser install.
 */

type Preset =
  | 'ALL'
  | 'LAST_30D'
  | 'LAST_90D'
  | 'THIS_MONTH'
  | 'THIS_QUARTER'
  | 'CUSTOM';

function todayKuwaitIso(): string {
  // Kuwait is UTC+3 year-round; for "today" we just render the server's
  // local date, which in practice already lives in Kuwait time. Using
  // the ISO slice is sufficient for a YYYY-MM-DD picker.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function firstOfQuarterIso(): string {
  const d = new Date();
  const qStart = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`;
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  ledger: CustomerLedgerResponse | null;
};

export function StatementDialog({
  open,
  onOpenChange,
  customerId,
  ledger,
}: Props) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<Preset>('ALL');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const effectiveRange = useMemo(() => {
    switch (preset) {
      case 'LAST_30D':
        return { from: daysAgoIso(30), to: todayKuwaitIso() };
      case 'LAST_90D':
        return { from: daysAgoIso(90), to: todayKuwaitIso() };
      case 'THIS_MONTH':
        return { from: firstOfMonthIso(), to: todayKuwaitIso() };
      case 'THIS_QUARTER':
        return { from: firstOfQuarterIso(), to: todayKuwaitIso() };
      case 'CUSTOM':
        return { from: from || '', to: to || '' };
      case 'ALL':
      default:
        return { from: '', to: '' };
    }
  }, [preset, from, to]);

  const rangeLabel = useMemo(() => {
    const { from: f, to: tt } = effectiveRange;
    if (!f && !tt) return t('statementDialog.allHistory');
    if (f && tt) return `${f} → ${tt}`;
    return f || tt;
  }, [effectiveRange, t]);

  const handlePrint = () => {
    if (!customerId) return;
    const params = new URLSearchParams();
    if (effectiveRange.from) params.set('from', effectiveRange.from);
    if (effectiveRange.to) params.set('to', effectiveRange.to);
    const qs = params.toString();
    const url = `/customers/${customerId}/statement/print${qs ? `?${qs}` : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  const handleWhatsApp = () => {
    if (!ledger || !ledger.customer.phone) {
      toast.error(t('statementDialog.noPhone'));
      return;
    }
    const href = customerStatementWhatsAppHref({
      customerId: ledger.customer.id,
      customerName: ledger.customer.displayName,
      customerPhone: ledger.customer.phone,
      walletBalanceKd: ledger.customer.walletBalanceKd,
      walletDebtKd: ledger.customer.walletDebtKd,
      invoiceCount: ledger.totals.invoiceCount,
      openInvoiceCount: ledger.totals.openInvoiceCount,
      activeSubscription: ledger.activeSubscription
        ? {
            planName: ledger.activeSubscription.planNameSnapshot,
            expiresAtIso: ledger.activeSubscription.expiresAtIso,
            walletBalanceKd: ledger.customer.walletBalanceKd,
          }
        : null,
      from: effectiveRange.from,
      to: effectiveRange.to,
    });
    if (!href) {
      toast.error(t('statementDialog.invalidPhone'));
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  const presets: { id: Preset; label: string }[] = [
    { id: 'ALL', label: t('statementDialog.presets.all') },
    { id: 'LAST_30D', label: t('statementDialog.presets.last30') },
    { id: 'LAST_90D', label: t('statementDialog.presets.last90') },
    { id: 'THIS_MONTH', label: t('statementDialog.presets.thisMonth') },
    { id: 'THIS_QUARTER', label: t('statementDialog.presets.thisQuarter') },
    { id: 'CUSTOM', label: t('statementDialog.presets.custom') },
  ];

  const phoneHref = ledger?.customer.phone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('statementDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('statementDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('statementDialog.rangeLabel')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    preset === p.id
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {preset === 'CUSTOM' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stmt-from" className="text-xs">
                  {t('statementDialog.fromLabel')}
                </Label>
                <Input
                  id="stmt-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stmt-to" className="text-xs">
                  {t('statementDialog.toLabel')}
                </Label>
                <Input
                  id="stmt-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  min={from || undefined}
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t('statementDialog.selectedRange')}
              </span>
              <span className="font-semibold tabular-nums">{rangeLabel}</span>
            </div>
            {ledger ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t('statementDialog.customerInfo', {
                    name: ledger.customer.displayName ?? '—',
                    phone: ledger.customer.phone ?? '—',
                  })}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="ms-2">{t('statementDialog.cancel')}</span>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleWhatsApp}
              disabled={!phoneHref}
              className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="ms-2">
                {t('statementDialog.sendWhatsApp')}
              </span>
            </Button>
            <Button type="button" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              <span className="ms-2">{t('statementDialog.printPdf')}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
