import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  History,
  LayoutGrid,
  Loader2,
  Printer,
  RefreshCw,
  ScissorsLineDashed,
  Star,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  apiJson,
  type CustomerLedgerActivationBreakdown,
  type CustomerLedgerClosedInvoice,
  type CustomerLedgerInvoice,
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
import { StatementDialog } from './statement-dialog';
import { InvoiceSupervisorActions } from '@/modules/shared/components/orders/invoice-supervisor-actions';

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
  const { t } = useTranslation();
  const [data, setData] = useState<CustomerLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // V19.8.5 — statement export dialog (date filter + print / WhatsApp).
  const [statementOpen, setStatementOpen] = useState(false);

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

  // V19.9.4 — numbers and dates are always rendered with Latin digits
  // and English date format regardless of UI language; see `useAppLocale`.
  const locale = 'en-GB';
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

  const invBuckets = useMemo(() => {
    if (!data) {
      return {
        unpaid: [] as CustomerLedgerInvoice[],
        paid: [] as CustomerLedgerInvoice[],
        canceled: [] as CustomerLedgerInvoice[],
      };
    }
    const unpaid: CustomerLedgerInvoice[] = [];
    const paid: CustomerLedgerInvoice[] = [];
    const canceled: CustomerLedgerInvoice[] = [];
    for (const inv of data.invoices) {
      if (inv.projectionGroup === 'CANCELED') {
        canceled.push(inv);
        continue;
      }
      if (inv.projectionGroup === 'UNPAID') unpaid.push(inv);
      else paid.push(inv);
    }
    return { unpaid, paid, canceled };
  }, [data]);

  const eventKpis = useMemo(() => {
    if (!data) {
      return {
        settlements: 0,
        paidFull: 0,
        activations: 0,
        rollovers: 0,
        partialPay: 0,
      };
    }
    let settlements = 0;
    let paidFull = 0;
    let activations = 0;
    let rollovers = 0;
    let partialPay = 0;
    for (const e of data.events) {
      if (e.kind === 'ORDER_SETTLEMENT_SUBSCRIPTION') settlements += 1;
      else if (e.kind === 'ORDER_PAID_IN_FULL') paidFull += 1;
      else if (e.kind === 'SUBSCRIPTION_ACTIVATION') activations += 1;
      else if (e.kind === 'SUBSCRIPTION_ROLLOVER_CARRY') rollovers += 1;
      else if (
        e.kind === 'PARTIAL_DEBT_PAYMENT' ||
        e.kind === 'ORDER_INVOICE_PARTIAL_PAYMENT'
      ) {
        partialPay += 1;
      }
    }
    return { settlements, paidFull, activations, rollovers, partialPay };
  }, [data]);

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

  const walletBalanceKd = data.customer.walletBalanceKd;
  const remainingDebtKd =
    data.customer.remainingDebtKd ?? data.customer.collectionsReceivableKd ?? '0.0000';
  const hasDebt = remainingDebtKd !== '0.0000';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {t('customerLedger.walletBalance')}:{' '}
            <span className="tabular-nums">{formatKwdLabel(walletBalanceKd)}</span>
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              hasDebt
                ? 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                : 'border-muted bg-muted/30 text-muted-foreground',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t('customerLedger.effectiveTotalDebt')}:{' '}
            <span className="tabular-nums">{formatKwdLabel(remainingDebtKd)}</span>
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
            onClick={() => setStatementOpen(true)}
            disabled={!customerId || !data}
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

      {data.feedbackSummary.ratedCount > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-200/90 bg-gradient-to-l from-amber-50/90 to-amber-50/30 p-3 text-sm dark:border-amber-900/50 dark:from-amber-950/40 dark:to-amber-950/10">
          <div className="flex flex-wrap items-center gap-2 text-amber-950 dark:text-amber-100">
            <Star
              className="h-4 w-4 shrink-0 text-amber-500"
              fill="currentColor"
              aria-hidden
            />
            <span className="font-semibold">
              {t('customerLedger.feedbackTitle')}
            </span>
            <span className="tabular-nums text-amber-900/90 dark:text-amber-200/90">
              {t('customerLedger.feedbackAverage', {
                rating: data.feedbackSummary.averageRating?.toFixed(1) ?? '—',
                count: data.feedbackSummary.ratedCount,
              })}
            </span>
          </div>
          {data.feedbackSummary.lastFeedback ? (
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
              {t('customerLedger.feedbackLast')}:{' '}
              <span className="inline-flex items-center gap-0.5 font-medium tabular-nums">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i <= (data.feedbackSummary.lastFeedback?.rating ?? 0)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-amber-200/80'
                    }`}
                  />
                ))}
              </span>
              {data.feedbackSummary.lastFeedback.orderSerial ?
                <span className="ms-1 font-mono text-[11px] text-amber-800/90">
                  {data.feedbackSummary.lastFeedback.orderSerial}
                </span>
              : null}
              {data.feedbackSummary.lastFeedback.note ?
                <span className="mt-0.5 block text-amber-900/70 dark:text-amber-200/70">
                  &ldquo;{data.feedbackSummary.lastFeedback.note}&rdquo;
                </span>
              : null}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('customerLedger.feedbackNone')}
        </p>
      )}

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
          {data.activeSubscription.carriedBalanceKd !== '0.0000' ? (
            <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-100/80">
              {t('customerLedger.carried')}:{' '}
              <span className="font-semibold tabular-nums text-blue-950 dark:text-blue-50">
                {formatKwdLabel(data.activeSubscription.carriedBalanceKd)}
              </span>
              <span className="ms-1 text-[11px] text-blue-800/80 dark:text-blue-200/80">
                — {t('customerLedger.subCarriedHint')}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="overview">
            <LayoutGrid className="me-1.5 h-4 w-4" aria-hidden />
            {t('customerLedger.tabOverview')}
          </TabsTrigger>
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

        <TabsContent value="overview" className="pt-3">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('customerLedger.overviewHint')}
          </p>

          {/* Row 1: open invoices + total collected — the two numbers that matter most */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                invBuckets.unpaid.length > 0
                  ? 'border-red-200 bg-red-50/35 dark:border-red-900/50 dark:bg-red-950/20'
                  : 'border-border bg-card',
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {t('customerLedger.kpiUnpaid')}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-800 dark:text-red-200">
                {formatKwdLabel(data.totals.totalOpenInvoicesKd)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('customerLedger.invoiceListCount', {
                  count: data.totals.unpaidInvoiceCount,
                })}
              </p>
            </div>

            {/* Total collected: cash payments + subscription settlements */}
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-xs font-medium text-emerald-900/90 dark:text-emerald-100/90">
                {t('customerLedger.kpiTotalCollected')}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                {formatKwdLabel(data.totals.totalCollectedKd)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('customerLedger.kpiTotalCollectedDesc', {
                  settlements: eventKpis.settlements,
                  paidFull: eventKpis.paidFull,
                  partial: eventKpis.partialPay,
                })}
              </p>
            </div>
          </div>

          {/* Row 2: fully-paid invoices + sub activations — supporting detail */}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                {t('customerLedger.kpiPaid')}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatKwdLabel(data.totals.totalPaidInvoicesKd)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('customerLedger.invoiceListCount', {
                  count: data.totals.paidInvoiceCount,
                })}
              </p>
            </div>
            <div className="rounded-lg border border-blue-200/80 bg-blue-50/30 p-3 text-sm dark:border-blue-900/50 dark:bg-blue-950/20">
              <p className="text-xs font-medium text-blue-900/90 dark:text-blue-100/90">
                {t('customerLedger.kpiSubActivations')}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-blue-950 dark:text-blue-50">
                {eventKpis.activations}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('customerLedger.kpiSettlements')}: {eventKpis.settlements} ·{' '}
                {t('customerLedger.kpiRollover')}: {eventKpis.rollovers}
              </p>
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {t('customerLedger.overviewSeeTabs')}
          </p>
        </TabsContent>

        <TabsContent value="invoices" className="pt-3">
          {data.invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('customerLedger.noInvoices')}
            </p>
          ) : (
            <div className="space-y-6">
              {invBuckets.unpaid.length > 0 ? (
                <section className="space-y-2">
                  <div>
                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">
                      {t('customerLedger.sectionInvoicesUnpaid')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      {t('customerLedger.sectionInvoicesUnpaidHint')}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {invBuckets.unpaid.map((inv) => (
                      <CustomerLedgerInvoiceRow
                        key={inv.id}
                        inv={inv}
                        fmtDateTime={fmtDateTime}
                        onOrderChanged={() => void load()}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
              {invBuckets.paid.length > 0 ? (
                <section className="space-y-2">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      {t('customerLedger.sectionInvoicesPaid')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      {t('customerLedger.sectionInvoicesPaidHint')}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {invBuckets.paid.map((inv) => (
                      <CustomerLedgerInvoiceRow
                        key={inv.id}
                        inv={inv}
                        fmtDateTime={fmtDateTime}
                        onOrderChanged={() => void load()}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
              {invBuckets.canceled.length > 0 ? (
                <section className="space-y-2">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      {t('customerLedger.sectionInvoicesCanceled')}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      {t('customerLedger.sectionInvoicesCanceledHint')}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {invBuckets.canceled.map((inv) => (
                      <CustomerLedgerInvoiceRow
                        key={inv.id}
                        inv={inv}
                        fmtDateTime={fmtDateTime}
                        onOrderChanged={() => void load()}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="pt-3">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('customerLedger.timelineIntro')}
          </p>
          {data.events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('customerLedger.noEvents')}
            </p>
          ) : (
            <ol className="space-y-2">
              {data.events.map((e) => {
                const isCredit = e.projection.isCredit;
                const Icon = isCredit ? ArrowUpCircle : ArrowDownCircle;
                const isActivation = e.kind === 'SUBSCRIPTION_ACTIVATION';
                const debtAfterHasValue =
                  e.projection.effectiveDebtAfterKd !== '0.0000';
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
                          {e.projection.hasDebtDiscount ? (
                            <StatusChip tone="warning">
                              {t('customerLedger.chipDiscount')}:{' '}
                              {formatKwdLabel(e.debtDiscountKd)}
                            </StatusChip>
                          ) : null}
                          {e.projection.hasDebtSettled ? (
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
                                debtAfterHasValue
                                  ? 'text-red-700 dark:text-red-300'
                                  : 'text-foreground',
                              )}
                            >
                              {formatKwdLabel(e.projection.effectiveDebtAfterKd)}
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
                            balanceAfterKd={e.balanceAfterKd}
                            effectiveDebtAfterKd={e.projection.effectiveDebtAfterKd}
                            closedInvoicesTotalKd={
                              e.projection.closedInvoicesTotalKd
                            }
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

      {/* V19.8.5 — Date-filter + Print/WhatsApp export dialog. */}
      <StatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        customerId={customerId}
        ledger={data}
      />
    </div>
  );
}

function CustomerLedgerInvoiceRow({
  inv,
  fmtDateTime,
  onOrderChanged,
}: {
  inv: CustomerLedgerInvoice;
  fmtDateTime: Intl.DateTimeFormat;
  onOrderChanged: () => void;
}) {
  const { t } = useTranslation();
  const at = inv.completedAtIso ?? inv.createdAtIso;
  return (
    <li
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
            {inv.serial ? `#${inv.serial}` : t('customerLedger.invoice')}
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
          <a
            href={`/invoices/${inv.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            title={t('customerLedger.viewInvoice') ?? ''}
            aria-label={t('customerLedger.viewInvoice') ?? undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Printer className="h-4 w-4" aria-hidden />
          </a>
          <InvoiceSupervisorActions
            order={{
              id: inv.id,
              createdAtIso: inv.createdAtIso,
              status: inv.status,
              totalKd: inv.totalKd,
              paymentMethod: inv.paymentMethod,
            }}
            onChanged={onOrderChanged}
            compact
          />
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
        <StatusChip tone={inv.openDebt ? 'danger' : 'success'}>
          {t(`customerLedger.cashStatus.${inv.cashStatus}`, {
            defaultValue: inv.cashStatus,
          })}
        </StatusChip>
        {inv.paymentMethod ? (
          <StatusChip tone="info">
            {t(`customerLedger.method.${inv.paymentMethod}`, {
              defaultValue: inv.paymentMethod,
            })}
          </StatusChip>
        ) : null}
        {inv.issuedWhileCutOff ? (
          <StatusChip tone="danger">
            <ScissorsLineDashed className="me-1 h-3 w-3" aria-hidden />
            {t('customerLedger.chipCutOff')}
          </StatusChip>
        ) : null}
        {inv.subscriptionLabel ? (
          <StatusChip tone="muted">{inv.subscriptionLabel}</StatusChip>
        ) : null}
        {inv.feedbackRating != null ? (
          <StatusChip tone="info">
            <Star
              className="me-0.5 h-3 w-3 text-amber-500"
              fill="currentColor"
              aria-hidden
            />
            {t('customerLedger.feedbackInvoice')} {inv.feedbackRating}/5
          </StatusChip>
        ) : null}
      </div>
    </li>
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
  balanceAfterKd,
  effectiveDebtAfterKd,
  closedInvoicesTotalKd,
}: {
  breakdown: CustomerLedgerActivationBreakdown;
  closedInvoices: CustomerLedgerClosedInvoice[];
  fmtDate: Intl.DateTimeFormat;
  balanceAfterKd: string;
  effectiveDebtAfterKd: string;
  closedInvoicesTotalKd: string;
}) {
  const { t } = useTranslation();
  const subsidyExists = breakdown.subsidyKd !== '0.0000';
  const settledExists = breakdown.debtSettledKd !== '0.0000';
  const creditedExists = breakdown.creditedToBalanceKd !== '0.0000';
  const carriedExists = breakdown.carriedBalanceKd !== '0.0000';
  const carriedIsDebt = breakdown.carriedBalanceKd.startsWith('-');
  const balanceAfterIsDebt = balanceAfterKd.startsWith('-');
  const effectiveDebtAfterExists = effectiveDebtAfterKd !== '0.0000';
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs dark:border-blue-900/50 dark:bg-blue-950/20">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">
        {t('customerLedger.activationBreakdown.title')}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.paid')}
          value={formatKwdLabel(breakdown.totalCollectedKd)}
          tone="default"
        />
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.credit')}
          value={formatKwdLabel(breakdown.actualBalanceKd)}
          tone="info"
        />
        {subsidyExists ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.subsidy')}
            value={formatKwdLabel(breakdown.subsidyKd)}
            tone="muted"
          />
        ) : null}
        {settledExists ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.debtSettled')}
            value={formatKwdLabel(breakdown.debtSettledKd)}
            tone="success"
          />
        ) : null}
        {creditedExists ? (
          <BreakdownRow
            label={t('customerLedger.activationBreakdown.credited')}
            value={formatKwdLabel(breakdown.creditedToBalanceKd)}
            tone="default"
          />
        ) : null}
        {carriedExists ? (
          // carriedBalanceKd is from a PRIOR subscription period, not newly created.
          // When negative it means the previous subscription was overconsumed.
          // Show as 'muted' even when negative so it is not mistaken for new activation debt.
          <BreakdownRow
            label={
              carriedIsDebt
                ? t('customerLedger.activationBreakdown.carriedDebt')
                : t('customerLedger.activationBreakdown.carriedCredit')
            }
            value={formatKwdLabel(breakdown.carriedBalanceKd)}
            tone="muted"
          />
        ) : null}
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.balanceAfterActivation')}
          value={formatKwdLabel(balanceAfterKd)}
          tone={balanceAfterIsDebt ? 'danger' : 'success'}
        />
        <BreakdownRow
          label={t('customerLedger.activationBreakdown.debtAfterActivation')}
          value={formatKwdLabel(effectiveDebtAfterKd)}
          tone={effectiveDebtAfterExists ? 'danger' : 'muted'}
        />
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
              {formatKwdLabel(closedInvoicesTotalKd)}
            </span>
          </p>
        </div>
      ) : settledExists ? (
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
