import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  Home,
  Layers,
  Loader2,
  LogOut,
  Plus,
} from 'lucide-react';
import { OrderScanInput } from '@/modules/shared/components/orders/order-scan-input';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/modules/shared/theme/theme-toggle';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { sumLinesKd, DELIVERY_FEE_KD } from '@/utils/finance-engine';
import { usePosEngine } from '@/modules/shared/hooks/use-pos-engine';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { PosAuxiliaryUi } from '@/modules/shared/components/pos/pos-auxiliary-ui';

/** Branch / back-office POS (MANAGER only). Drivers use `DriverPOS`. */
export function PosPage() {
  const { token, user } = useAuth();
  const priceList = usePriceList({ token });
  /*
   * Dastur §2.1 — back-office POS is MANAGER-only. DRIVER has its own
   * DriverPOS variant; OWNER/GENERAL_MANAGER do NOT issue invoices (they
   * are gated out of `/pos` by `pos.use` + AuthLayout + PosRoute). The
   * "Back to Dashboard" shortcut is MANAGER-specific for that reason.
   */
  const canExitToDashboard = can(user, 'pos.exitToDashboard');
  const p = usePosEngine({ variant: 'branch', priceList });
  const { t } = useTranslation();

  const {
    rtl,
    searchQ,
    setSearchQ,
    searching,
    searchHits,
    selected,
    setSelected,
    setSearchHits,
    setNewOpen,
    signOut,
    operating,
    setScanOrderDetail,
    setScanOrderDialogOpen,
    catalogLoading,
    catalogItems,
    catalogFailed,
    loadCatalog,
    defaultVisual,
    basePriceKd,
    kwdSuffix,
    openServiceModal,
    subOrders,
    activeSubOrderIndex,
    setActiveSubOrderIndex,
    billingLoading,
    billing,
    isBalanceWarning,
    debtNum,
    needsExternalPayment,
    combinedLineSubtotal,
    cart,
    setQty,
    firstFilledSubOrderIndex,
    isSubscriptionOrder,
    grandTotal,
    dateLocale,
    addAttachedOrder,
    posPaymentMethod,
    setPosPaymentMethod,
    receiptSheets,
    handlePrintReceipt,
    handlePrintGarmentTags,
    checkoutBusy,
    sessionDeliveryCharge,
    combinedVipSurcharge,
    setVipForSubOrder,
    completePayment,
  } = p;

  return (
    <div
      data-pos-root
      className="flex max-h-[100dvh] min-h-[100dvh] max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden bg-muted/40"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <header className="z-20 shrink-0 border-b border-border bg-card px-3 py-2 shadow-sm sm:px-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <img
              src="/logo.png"
              alt="Safari Omni"
              width={140}
              className="h-10 w-auto max-w-[140px] object-contain"
            />
            <div className="relative min-w-[160px] flex-1">
              <Input
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (selected) setSelected(null);
                }}
                placeholder={t('pos.searchPlaceholder')}
                className="bg-background pe-9 text-start"
                autoComplete="off"
              />
              {searching ?
                <Loader2 className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              : null}
              {searchHits.length > 0 && !selected ?
                <ul className="absolute start-0 end-0 top-full z-30 mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-lg">
                  {searchHits.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start px-3 py-2 text-start hover:bg-muted/60"
                        onClick={() => {
                          setSelected(r);
                          setSearchHits([]);
                          setSearchQ(r.phone);
                        }}
                      >
                        <span className="font-medium text-foreground">
                          {r.displayName || t('pos.noName')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.phone}
                          {r.phone2 ? ` · ${r.phone2}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 border-amber-500/40 bg-amber-50 text-amber-900 hover:bg-amber-100"
              onClick={() => setNewOpen(true)}
              aria-label={t('pos.newCustomer.open')}
            >
              <Plus className="h-5 w-5" />
            </Button>
            <div className="ms-auto flex items-center gap-1 sm:gap-2">
              {canExitToDashboard ? (
                /*
                 * Our Button variant doesn't support `asChild`, so we render
                 * the Link ourselves and lean on buttonVariants classes to
                 * keep visual parity with the rest of the header cluster.
                 */
                <Link
                  to="/"
                  title={t('pos.backToDashboard')}
                  aria-label={t('pos.backToDashboard')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Home className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">
                    {t('pos.backToDashboard')}
                  </span>
                </Link>
              ) : null}
              <LanguageToggle variant="outline" className="bg-background" />
              <ThemeToggle variant="outline" className="bg-background" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={signOut}
                aria-label={t('nav.signOut')}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {selected ?
              <p>
                {t('pos.activeCustomer')}{' '}
                <strong className="text-foreground">
                  {selected.displayName || t('pos.noName')} · {selected.phone}
                  {selected.phone2 ? ` · ${selected.phone2}` : ''}
                </strong>
              </p>
            : <span />}
            {operating ?
              <span className="whitespace-nowrap">
                {t('pos.financialDate')}{' '}
                <strong className="text-foreground">
                  {operating.financialDateLabel}
                </strong>
              </span>
            : null}
          </div>
          <OrderScanInput
            token={token}
            className="w-full max-w-xl"
            onOrderLoaded={(o) => {
              setScanOrderDetail(o);
              setScanOrderDialogOpen(true);
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden border-border px-3 pt-3 pb-48 sm:px-4 sm:pt-4 md:w-[70%] md:max-w-[70%] md:flex-none md:border-e md:px-4 md:pt-4 md:pb-4">
          {catalogLoading ?
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          : catalogItems.length === 0 ?
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {t('pos.catalogEmpty')}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {catalogFailed ?
                  t('pos.catalogLoadFailed')
                : t('pos.catalogHint')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void loadCatalog()}
              >
                {t('pos.retry')}
              </Button>
            </div>
          : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {catalogItems.map((item) => {
                const { Icon, tone } = defaultVisual(item.code);
                const price = basePriceKd(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openServiceModal(item)}
                    className={cn(
                      'relative flex min-h-[200px] flex-col items-stretch rounded-[20px] border border-border bg-card p-5 text-center shadow-md shadow-black/[0.06] transition-all',
                      'hover:-translate-y-1 hover:shadow-lg active:scale-[0.99]',
                    )}
                  >
                    <span className="absolute top-4 text-lg font-bold tabular-nums text-primary end-4">
                      {price.toFixed(3)} {kwdSuffix}
                    </span>
                    <div
                      className={cn(
                        'mx-auto mt-8 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl',
                        tone,
                      )}
                    >
                      <Icon className="h-10 w-10" strokeWidth={1.5} aria-hidden />
                    </div>
                    <span className="mt-auto line-clamp-3 pt-4 text-base font-semibold leading-snug text-foreground">
                      {item.nameAr}
                    </span>
                  </button>
                );
              })}
            </div>
          }
        </main>

        <aside className="flex min-h-0 min-w-0 w-full flex-col bg-card md:w-[30%] md:max-w-[30%] md:flex-none md:border-0">
          <div className="shrink-0 border-b border-border px-3 py-2.5 text-start">
            <p className="text-sm font-semibold text-foreground">
              {t('pos.cartTitle')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {subOrders.map((o, idx) => {
                const isActive = idx === activeSubOrderIndex;
                const pieceCount = o.lines.reduce((n, l) => n + l.quantity, 0);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setActiveSubOrderIndex(idx)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      isActive ?
                        'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40 text-foreground hover:bg-muted/70',
                    )}
                  >
                    {o.kind === 'primary' ?
                      t('pos.multiOrder.tabPrimary', { n: idx + 1 })
                    : t('pos.multiOrder.tabAttached', { n: idx + 1 })}
                    {pieceCount > 0 ?
                      <span className="ms-1 tabular-nums opacity-90">
                        ({pieceCount})
                      </span>
                    : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {t('pos.cartItemsCount', {
                count: subOrders.reduce(
                  (n, o) => n + o.lines.reduce((m, l) => m + l.quantity, 0),
                  0,
                ),
              })}
            </p>
          </div>
          {selected ?
            <div className="shrink-0 border-b border-border bg-primary/[0.06] px-3 py-3 text-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t('pos.subscription.title')}
              </p>
              {billingLoading || !billing ?
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('pos.subscription.loading')}
                </p>
              : <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {billing.subscriptionActive
                        ? t('pos.subscription.statusActive')
                        : t('pos.subscription.statusInactive')}
                    </span>
                    <span
                      className={cn(
                        'rounded-full bg-background px-2 py-0.5 font-medium ring-1 ring-border',
                        isBalanceWarning && 'text-red-700 ring-red-300',
                      )}
                    >
                      {Number.parseFloat(billing.remainingBalance).toFixed(3)}{' '}
                      {kwdSuffix}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t('pos.subscription.plan')}:
                    </span>{' '}
                    {billing.planType ?? t('pos.subscription.noPlan')}
                  </p>
                  <p
                    className={cn(
                      'text-muted-foreground',
                      isBalanceWarning && 'font-semibold text-red-700',
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {t('pos.subscription.balance')}:
                    </span>{' '}
                    {Number.parseFloat(billing.remainingBalance).toFixed(3)}{' '}
                    {kwdSuffix}
                  </p>
                  <p
                    className={cn(
                      'text-muted-foreground',
                      Number.isFinite(debtNum) && debtNum > 0 && 'font-semibold text-red-700',
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {t('pos.subscription.debt')}:
                    </span>{' '}
                    {Number.parseFloat(billing.debt).toFixed(3)} {kwdSuffix}
                  </p>
                  {isBalanceWarning ?
                    <p className="text-[11px] font-semibold leading-snug text-red-700">
                      {t('pos.balanceWarning')}
                    </p>
                  : null}
                  {!needsExternalPayment && combinedLineSubtotal > 0 && billing ?
                    <p className="text-[11px] leading-snug text-primary">
                      {t('pos.subscription.walletCovers')}
                    </p>
                  : null}
                  {needsExternalPayment && billing ?
                    <p className="text-[11px] leading-snug text-amber-800">
                      {t('pos.subscription.shortfallHint')}
                    </p>
                  : null}
                </div>
              }
            </div>
          : null}
          <ScrollArea className="min-h-0 flex-1 md:max-h-[calc(100dvh-12rem)]">
            <div className="p-3 max-md:pb-48 md:pb-3">
              {cart.length === 0 ?
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('pos.cartEmpty')}
                </p>
              : cart.map((line) => (
                  <div
                    key={line.lineKey}
                    className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/25 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1 text-start">
                      <p className="truncate font-medium text-foreground">
                        {line.nameAr}
                      </p>
                      <p className="tabular-nums text-xs text-muted-foreground">
                        {line.unitPrice.toFixed(3)} ×
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          className="mx-1 w-14 rounded-md border border-border bg-background px-1 py-1 text-center text-sm tabular-nums"
                          value={line.quantity}
                          onChange={(e) =>
                            setQty(
                              line.lineKey,
                              Number.parseInt(e.target.value, 10) || 0,
                            )
                          }
                        />
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-semibold text-foreground">
                      {(line.quantity * line.unitPrice).toFixed(3)}
                    </span>
                  </div>
                ))
              }
            </div>
          </ScrollArea>
        </aside>
      </div>

      <footer
        className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:px-4"
      >
        <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-lg font-bold tabular-nums text-foreground">
            <span className="text-muted-foreground">{t('pos.totalKwd')}:</span>{' '}
            <span className="text-primary">
              {grandTotal.toLocaleString(dateLocale, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              {kwdSuffix}
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:w-auto sm:min-w-[300px]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 w-full shrink-0 border-emerald-600/55 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
              onClick={addAttachedOrder}
              disabled={!selected}
            >
              <Layers className="me-2 h-4 w-4 shrink-0" aria-hidden />
              {t('pos.multiOrder.addAttached')}
            </Button>
            {subOrders.some((o) => sumLinesKd(o.lines) > 0) ?
              <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/15 p-2 text-[11px]">
                <p className="font-semibold text-foreground">
                  {t('pos.multiOrder.sessionSummary')}
                </p>
                {subOrders.map((o, idx) => {
                  const lineSum = sumLinesKd(o.lines);
                  if (lineSum <= 0) return null;
                  const paysDelivery =
                    idx === firstFilledSubOrderIndex &&
                    !isSubscriptionOrder &&
                    lineSum > 0;
                  const dFee = paysDelivery ? DELIVERY_FEE_KD : 0;
                  const vipOn = Boolean(o.vipEnabled);
                  return (
                    <div
                      key={o.id}
                      className="rounded-md border border-border/60 bg-background/80 px-2 py-1.5"
                    >
                      <p className="font-medium text-foreground">
                        {o.kind === 'primary' ?
                          t('pos.multiOrder.summaryPrimary', { n: idx + 1 })
                        : t('pos.multiOrder.summaryAttached', { n: idx + 1 })}
                      </p>
                      <div className="mt-0.5 flex justify-between text-muted-foreground">
                        <span>{t('pos.multiOrder.linesTotal')}</span>
                        <span className="tabular-nums">
                          {lineSum.toFixed(3)} {kwdSuffix}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('pos.deliveryFeeLabel')}</span>
                        <span
                          className={cn(
                            'tabular-nums',
                            dFee <= 0 && 'text-emerald-700',
                          )}
                        >
                          {dFee > 0 ?
                            `${dFee.toFixed(3)} ${kwdSuffix}`
                          : t('pos.multiOrder.freeDeliveryAttached')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVipForSubOrder(idx)}
                        aria-pressed={vipOn}
                        className={cn(
                          'mt-1.5 flex w-full items-center justify-between rounded-md border px-2 py-1 text-[11px] font-medium transition',
                          vipOn
                            ? 'border-amber-500 bg-amber-50 text-amber-900'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden>★</span>
                          {t('pos.vip.toggleLabel')}
                        </span>
                        <span className="tabular-nums">
                          {vipOn
                            ? `+1.000 ${kwdSuffix}`
                            : t('pos.vip.off')}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            : null}
            <div className="space-y-1 border-t border-border pt-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('pos.subtotalLabel')}</span>
                <span className="tabular-nums">
                  {combinedLineSubtotal.toFixed(3)} {kwdSuffix}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{t('pos.deliveryFeeLabel')}</span>
                <span className="tabular-nums">
                  {sessionDeliveryCharge <= 0 ?
                    t('pos.freeDelivery')
                  : `${sessionDeliveryCharge.toFixed(3)} ${kwdSuffix}`}
                </span>
              </div>
              {combinedVipSurcharge > 0 ?
                <div className="flex items-center justify-between text-amber-800">
                  <span>{t('pos.vip.lineLabel')}</span>
                  <span className="tabular-nums">
                    {combinedVipSurcharge.toFixed(3)} {kwdSuffix}
                  </span>
                </div>
              : null}
              <div className="flex items-center justify-between border-t border-border pt-1 text-sm font-semibold text-foreground">
                <span>{t('pos.grandTotalLabel')}</span>
                <span className="tabular-nums">
                  {grandTotal.toFixed(3)} {kwdSuffix}
                </span>
              </div>
            </div>
            {selected ?
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium text-foreground">
                  {t('pos.payment.title')}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['CASH', t('pos.payment.cash')],
                      ['KNET', t('pos.payment.knet')],
                      ['PAYMENT_LINK', t('pos.payment.online')],
                      ['DEBT_ON_ACCOUNT', t('pos.payment.debt')],
                    ] as const
                  ).map(([m, label]) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={posPaymentMethod === m ? 'default' : 'outline'}
                      className="h-11 min-h-11 touch-manipulation text-xs font-semibold"
                      onClick={() =>
                        setPosPaymentMethod(
                          m as 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'DEBT_ON_ACCOUNT',
                        )
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-stretch">
            <Button
              type="button"
              variant="outline"
              disabled={!receiptSheets?.length}
              size="lg"
              className="h-12 min-h-12 w-full shrink-0 touch-manipulation text-base font-semibold sm:w-auto"
              onClick={handlePrintReceipt}
            >
              Print Receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!receiptSheets?.some((s) => s.orderId)}
              size="lg"
              className="h-12 min-h-12 w-full shrink-0 touch-manipulation text-base font-semibold sm:w-auto"
              onClick={handlePrintGarmentTags}
            >
              {t('pos.printGarmentTags')}
            </Button>
          </div>
          <Button
            type="button"
            disabled={
              checkoutBusy ||
              combinedLineSubtotal <= 0 ||
              !selected ||
              grandTotal <= 0
            }
            size="lg"
            className="h-12 min-h-12 w-full shrink-0 touch-manipulation text-base font-semibold sm:w-auto sm:min-w-[200px]"
            onClick={() => void completePayment()}
          >
            {checkoutBusy ?
              <>
                <Loader2 className="me-2 h-5 w-5 animate-spin" />
                {t('pos.checkout.working')}
              </>
            : t('pos.completePayment')}
          </Button>
        </div>
      </footer>

      <PosAuxiliaryUi p={p} />
    </div>
  );
}
