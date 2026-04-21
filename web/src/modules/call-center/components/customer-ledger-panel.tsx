import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  History,
  Loader2,
  Printer,
  RefreshCw,
  ScissorsLineDashed,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  apiJson,
  type CustomerLedgerActivationBreakdown,
  type CustomerLedgerClosedInvoice,
  type CustomerLedgerResponse,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/shared/components/ui/tabs';
import { cn } from '@/lib/utils';

type Props = {
  customerId: string;
  token: string | null;
};

/**
 * V19.4 — CC pack #8 + #10 + #11. Unified "Customer 360" side panel.
 * One fetch → three views:
 *   1. Snapshot (wallet + active subscription + cut-off banner).
 *   2. Invoices  (#8)  — all orders with method + cut-off chip.
 *   3. Timeline  (#11) — chronological ledger events.
 * The cut-off banner + `issuedWhileCutOff` chip together deliver #10.
 */
export function CustomerLedgerPanel({ customerId, token }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const [data, setData] = useState<CustomerLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    try {
      const res = await apiJson<CustomerLedgerResponse>(
        `/api/call-center/customers/${customerId}/ledger?limit=200`,
        { token },
      );
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = isAr ? 'ar-KW' : 'en-KW';
  const fmtDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );

  if (!data) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          t('customerLedger.empty')
        )}
      </div>
    );
  }

  const debtK = Number.parseFloat(data.customer.walletDebtKd ?? '0') || 0;
  const balK = Number.parseFloat(data.customer.walletBalanceKd ?? '0') || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {t('customerLedger.walletBalance')}:{' '}
            <span className="tabular-nums">{formatKwdLabel(balK)}</span>
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              debtK > 0
                ? 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                : 'border-muted bg-muted/30 text-muted-foreground',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t('customerLedger.walletDebt')}:{' '}
            <span className="tabular-nums">{formatKwdLabel(debtK)}</span>
          </span>
          {data.isCutOff ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
              <ScissorsLineDashed className="h-3.5 w-3.5" aria-hidden />
              {t('customerLedger.cutOffBadge')}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* V19.8.4 — open the A4 "كشف حساب العميل" in a new tab.
              Same payload the panel already has, rendered as a
              branded sheet with digital QR stamp, auto-triggers the
              browser print dialog on load. RBAC is re-checked on the
              target route so link-sharing is safe. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!customerId) return;
              window.open(
                `/customers/${customerId}/statement/print`,
                '_blank',
                'noopener,noreferrer',
              );
            }}
            disabled={!customerId}
          >
            <Printer className="h-4 w-4" />
            <span className="ms-2">
              {t('customerLedger.printStatement')}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ms-2">{t('customerLedger.refresh')}</span>
          </Button>
        </div>
      </div>

      {data.activeSubscription ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm dark:border-blue-900/60 dark:bg-blue-950/20">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {data.activeSubscription.planNameSnapshot}
          </p>
          <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-100/80">
            {t('customerLedger.subWindow', {
              from: fmtDate.format(
                new Date(data.activeSubscription.activatedAtIso),
              ),
              to: fmtDate.format(
                new Date(data.activeSubscription.expiresAtIso),
              ),
            })}
          </p>
          {Number.parseFloat(data.activeSubscription.carriedBalanceKd) !== 0 ? (
            <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-100/80">
              {t('customerLedger.carried')}:{' '}
              <span className="tabular-nums">
                {formatKwdLabel(
                  Number.parseFloat(data.activeSubscription.carriedBalanceKd),
                )}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="invoices">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="invoices">
            <FileText className="me-1.5 h-4 w-4" aria-hidden />
            {t('customerLedger.tabInvoices', {
              count: data.totals.invoiceCount,
            })}
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <History className="me-1.5 h-4 w-4" aria-hidden />
            {t('customerLedger.tabTimeline', {
              count: data.totals.eventCount,
            })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="pt-3">
          {data.invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('customerLedger.noInvoices')}
            </p>
          ) : (
            <ul className="space-y-2">
              {data.invoices.map((inv) => {
                const at = inv.completedAtIso ?? inv.createdAtIso;
                return (
                  <li
                    key={inv.id}
                    className={cn(
                      'rounded-lg border p-3 text-sm transition',
                      inv.openDebt
                        ? 'border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20'
                        : 'bg-card',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {inv.serial
                            ? `#${inv.serial}`
                            : t('customerLedger.invoice')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime.format(new Date(at))}
                        </p>
                        {inv.driverName || inv.branchName ? (
                          <p className="text-xs text-muted-foreground">
                            {inv.branchName ? `🏬 ${inv.branchName}` : ''}
                            {inv.branchName && inv.driverName ? ' · ' : ''}
                            {inv.driverName ? `🚗 ${inv.driverName}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-base font-semibold tabular-nums">
                          {formatKwdLabel(inv.totalKd)}
                        </p>
                        {/* V19.7.5 — "عرض صورة الفاتورة". Opens the
                            printable A4 invoice in a new tab so the
                            operator keeps the Customer 360 dialog
                            open for the rest of the call. RBAC is
                            enforced on /api/orders/:id, so this
                            link is safe to render unconditionally. */}
                        <a
                          href={`/invoices/${inv.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('customerLedger.viewInvoice') ?? ''}
                          aria-label={
                            t('customerLedger.viewInvoice') ?? undefined
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                        >
                          <Printer className="h-4 w-4" aria-hidden />
                        </a>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusChip
                        tone={
                          inv.status === 'CANCELED'
                            ? 'muted'
                            : inv.status === 'COMPLETED'
                              ? 'success'
                              : 'info'
                        }
                      >
                        {t(`customerLedger.orderStatus.${inv.status}`, {
                          defaultValue: inv.status,
                        })}
                      </StatusChip>
                      <StatusChip
                        tone={inv.openDebt ? 'danger' : 'success'}
                      >
                        {t(`customerLedger.cashStatus.${inv.cashStatus}`, {
                          defaultValue: inv.cashStatus,
                        })}
                      </StatusChip>
                      {inv.paymentMethod ? (
                        <StatusChip tone="info">
                          {t(
                            `customerLedger.method.${inv.paymentMethod}`,
                            { defaultValue: inv.paymentMethod },
                          )}
                        </StatusChip>
                      ) : null}
                      {inv.issuedWhileCutOff ? (
                        <StatusChip tone="danger">
                          <ScissorsLineDashed
                            className="me-1 h-3 w-3"
                            aria-hidden
                          />
                          {t('customerLedger.chipCutOff')}
                        </StatusChip>
                      ) : null}
                      {inv.subscriptionLabel ? (
                        <StatusChip tone="muted">
                          {inv.subscriptionLabel}
                        </StatusChip>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-3">
          {data.events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('customerLedger.noEvents')}
            </p>
          ) : (
            <ol className="space-y-2">
              {data.events.map((e) => {
                const isCredit =
                  e.kind === 'SUBSCRIPTION_ACTIVATION' ||
                  Number.parseFloat(e.amountKd) < 0;
                const Icon = isCredit ? ArrowUpCircle : ArrowDownCircle;
                const isActivation = e.kind === 'SUBSCRIPTION_ACTIVATION';
                return (
                  <li
                    key={e.id}
                    className="rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                          isCredit
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200',
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium">
                            {t(`customerLedger.kind.${e.kind}`, {
                              defaultValue: e.kind,
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDateTime.format(new Date(e.atIso))}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          {e.orderSerial ? (
                            <StatusChip tone="muted">
                              #{e.orderSerial}
                            </StatusChip>
                          ) : null}
                          {e.subscriptionLabel ? (
                            <StatusChip tone="info">
                              {e.subscriptionLabel}
                            </StatusChip>
                          ) : null}
                          {e.paymentMethod ? (
                            <StatusChip tone="muted">
                              {t(`customerLedger.method.${e.paymentMethod}`, {
                                defaultValue: e.paymentMethod,
                              })}
                            </StatusChip>
                          ) : null}
                          {Number.parseFloat(e.debtDiscountKd) > 0 ? (
                            <StatusChip tone="warning">
                              {t('customerLedger.chipDiscount')}:{' '}
                              {formatKwdLabel(e.debtDiscountKd)}
                            </StatusChip>
                          ) : null}
                          {Number.parseFloat(e.debtSettledKd) > 0 ? (
                            <StatusChip tone="success">
                              {t('customerLedger.chipDebtSettled')}:{' '}
                              {formatKwdLabel(e.debtSettledKd)}
                            </StatusChip>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                          <span>
                            {t('customerLedger.colAmount')}:{' '}
                            <span className="font-medium tabular-nums text-foreground">
                              {formatKwdLabel(e.amountKd)}
                            </span>
                          </span>
                          <span>
                            {t('customerLedger.colBalanceAfter')}:{' '}
                            <span className="font-medium tabular-nums text-foreground">
                              {formatKwdLabel(e.balanceAfterKd)}
                            </span>
                          </span>
                          <span>
                            {t('customerLedger.colDebtAfter')}:{' '}
                            <span
                              className={cn(
                                'font-medium tabular-nums',
                                Number.parseFloat(e.debtAfterKd) > 0
                                  ? 'text-red-700 dark:text-red-300'
                                  : 'text-foreground',
                              )}
                            >
                              {formatKwdLabel(e.debtAfterKd)}
                            </span>
                          </span>
                        </div>
                        {/* V19.8.3 — activation breakdown. Spells out every
                            leg of the money flow so a customer asking
                            "جددت اشتراكي ليش رصيدي صفر؟" gets an
                            unambiguous answer right here in the
                            statement: how much they paid, how much of
                            that hit the wallet, how much was taken to
                            settle old invoices, and exactly WHICH
                            invoices were retired. */}
                        {isActivation && e.activationBreakdown ? (
                          <ActivationBreakdownBlock
                            breakdown={e.activationBreakdown}
                            closedInvoices={e.closedInvoices}
                            fmtDate={fmtDate}
                          />
                        ) : null}
                        {e.performedByName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('customerLedger.by')}: {e.performedByName}
                          </p>
                        ) : null}
                        {e.note ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {e.note}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * V19.8.3 — "Where did my renewal money go?" card. Rendered inline
 * inside a SUBSCRIPTION_ACTIVATION timeline row. Shows a 3-row money
 * flow (paid → credit → splits into debt settlement + usable balance)
 * followed by the exact list of old invoices the activation retired
 * via FIFO auto-closure. The block is self-contained so the same
 * markup works whether the activation was new, a renewal, or a
 * debt-to-subscription conversion.
 */
function ActivationBreakdownBlock({
  breakdown,
  closedInvoices,
  fmtDate,
}: {
  breakdown: CustomerLedgerActivationBreakdown;
  closedInvoices: CustomerLedgerClosedInvoice[];
  fmtDate: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation();
  const paid = Number.parseFloat(breakdown.totalCollectedKd) || 0;
  const credit = Number.parseFloat(breakdown.actualBalanceKd) || 0;
  const subsidy = Number.parseFloat(breakdown.subsidyKd) || 0;
  const settled = Number.parseFloat(breakdown.debtSettledKd) || 0;
  const credited = Number.parseFloat(breakdown.creditedToBalanceKd) || 0;
  const carried = Number.parseFloat(breakdown.carriedBalanceKd) || 0;
  const closedTotal = closedInvoices.reduce(
    (sum, inv) => sum + (Number.parseFloat(inv.totalKd) || 0),
    0,
  );
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs dark:border-blue-900/50 dark:bg-blue-950/20">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">
        {t('customerLedger.activationBreakdown.title')}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.paid')}
          value={formatKwdLabel(paid)}
          tone="default"
        />
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.credit')}
          value={formatKwdLabel(credit)}
          tone="info"
        />
        {subsidy > 0 ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.subsidy')}
            value={formatKwdLabel(subsidy)}
            tone="muted"
          />
        ) : null}
        {settled > 0 ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.debtSettled')}
            value={formatKwdLabel(settled)}
            tone="success"
          />
        ) : null}
        {credited > 0 ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.credited')}
            value={formatKwdLabel(credited)}
            tone="default"
          />
        ) : null}
        {carried !== 0 ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.carried')}
            value={formatKwdLabel(carried)}
            tone={carried < 0 ? 'danger' : 'muted'}
          />
        ) : null}
      </div>
      {closedInvoices.length > 0 ? (
        <div className="mt-3 border-t border-blue-200 pt-2 dark:border-blue-900/50">
          <p className="mb-1.5 text-[11px] font-semibold text-blue-900 dark:text-blue-100">
            {t('customerLedger.activationBreakdown.closedInvoicesTitle', {
              count: closedInvoices.length,
            })}
          </p>
          <ul className="space-y-1">
            {closedInvoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded border border-blue-100/60 bg-white/60 px-2 py-1 dark:border-blue-900/40 dark:bg-blue-950/30"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <FileText className="h-3 w-3" aria-hidden />
                  <span className="font-medium text-foreground">
                    {inv.serial
                      ? `#${inv.serial}`
                      : t('customerLedger.invoice')}
                  </span>
                  <span>·</span>
                  <span>{fmtDate.format(new Date(inv.createdAtIso))}</span>
                </span>
                <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatKwdLabel(inv.totalKd)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {t('customerLedger.activationBreakdown.closedInvoicesTotal')}
            </span>
            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatKwdLabel(closedTotal)}
            </span>
          </p>
        </div>
      ) : settled > 0 ? (
        <p className="mt-2 border-t border-blue-200 pt-2 text-[11px] text-muted-foreground dark:border-blue-900/50">
          {t('customerLedger.activationBreakdown.debtSettledNoInvoices')}
        </p>
      ) : null}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'info' | 'success' | 'danger' | 'muted';
}) {
  const palette: Record<typeof tone, string> = {
    default: 'text-foreground',
    info: 'text-blue-700 dark:text-blue-300',
    success: 'text-emerald-700 dark:text-emerald-300',
    danger: 'text-red-700 dark:text-red-300',
    muted: 'text-muted-foreground',
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-white/50 px-2 py-1 dark:bg-blue-950/30">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', palette[tone])}>
        {value}
      </span>
    </div>
  );
}

type ChipTone = 'success' | 'danger' | 'warning' | 'info' | 'muted';

function StatusChip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: React.ReactNode;
}) {
  const palette: Record<ChipTone, string> = {
    success:
      'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
    danger:
      'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
    warning:
      'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    info: 'border-blue-200 bg-blue-50/60 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200',
    muted:
      'border-muted bg-muted/30 text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        palette[tone],
      )}
    >
      {children}
    </span>
  );
}
