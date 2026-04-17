import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { OrderScanInput } from '@/modules/shared/components/orders/order-scan-input';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { SystemClosedScreen } from '@/components/system/system-closed-screen';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { sumLinesKd, DELIVERY_FEE_KD } from '@/utils/finance-engine';
import { usePosEngine } from '@/modules/shared/hooks/use-pos-engine';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { PosAuxiliaryUi } from '@/modules/shared/components/pos/pos-auxiliary-ui';
import { useDriverOperatingPoll } from '@/modules/driver/hooks/use-driver-operating-poll';

/**
 * Field POS: mobile-first layout, cash checkout, no multi-invoice / branch payment controls.
 */
export function DriverPOS() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const priceList = usePriceList({ token });
  const { operating, setOperating } = useDriverOperatingPoll(token);
  const p = usePosEngine({
    variant: 'driver',
    operating,
    setOperating,
    priceList,
  });

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
    receiptSheets,
    handlePrintReceipt,
    handlePrintGarmentTags,
    checkoutBusy,
    completePayment,
  } = p;

  if (operating && !operating.isOpen) {
    return (
      <SystemClosedScreen
        kuwaitTimeLabel={operating.kuwaitTimeLabel}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div
      data-pos-root
      className="flex max-h-[100dvh] min-h-[100dvh] max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden bg-muted/40"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <header className="z-20 shrink-0 border-b border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <img
              src="/logo.png"
              alt="Safari"
              width={120}
              className="h-9 w-auto max-w-[120px] object-contain"
            />
            <div className="relative min-w-0 flex-1 basis-[min(100%,220px)]">
              <Input
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (selected) setSelected(null);
                }}
                placeholder={t('pos.searchPlaceholder')}
                className="h-11 bg-background pe-9 text-start text-base"
                autoComplete="off"
              />
              {searching ?
                <Loader2 className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              : null}
              {searchHits.length > 0 && !selected ?
                <ul className="absolute start-0 end-0 top-full z-30 mt-1 max-h-44 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-lg">
                  {searchHits.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start px-3 py-2.5 text-start hover:bg-muted/60 active:bg-muted"
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
              className="h-11 w-11 shrink-0 border-amber-500/40 bg-amber-50 text-amber-900"
              onClick={() => setNewOpen(true)}
              aria-label={t('pos.newCustomer.open')}
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
              onClick={() => navigate('/my-field-expenses')}
            >
              {t('nav.driverFieldExpenses')}
            </Button>
            <div className="ms-auto flex items-center gap-1">
              <LanguageToggle variant="outline" className="h-11 bg-background" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={signOut}
                aria-label={t('nav.signOut')}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {selected ?
              <p className="min-w-0 truncate">
                {t('pos.activeCustomer')}{' '}
                <strong className="text-foreground">
                  {selected.displayName || t('pos.noName')} · {selected.phone}
                </strong>
              </p>
            : <span />}
            {operating ?
              <span className="shrink-0 whitespace-nowrap">
                {t('pos.financialDate')}{' '}
                <strong className="text-foreground">
                  {operating.financialDateLabel}
                </strong>
              </span>
            : null}
          </div>
          <OrderScanInput
            token={token}
            className="w-full"
            onOrderLoaded={(o) => {
              setScanOrderDetail(o);
              setScanOrderDialogOpen(true);
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-4">
          {catalogLoading ?
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          : catalogItems.length === 0 ?
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
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
          : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catalogItems.map((item) => {
                const { Icon, tone } = defaultVisual(item.code);
                const price = basePriceKd(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openServiceModal(item)}
                    className={cn(
                      'relative flex min-h-[160px] flex-col items-stretch rounded-2xl border border-border bg-card p-3 text-center shadow-sm transition-all',
                      'active:scale-[0.98]',
                    )}
                  >
                    <span className="absolute top-3 text-sm font-bold tabular-nums text-primary end-3">
                      {price.toFixed(3)} {kwdSuffix}
                    </span>
                    <div
                      className={cn(
                        'mx-auto mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl',
                        tone,
                      )}
                    >
                      <Icon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                    </div>
                    <span className="mt-auto line-clamp-3 pt-3 text-xs font-semibold leading-snug text-foreground">
                      {item.nameAr}
                    </span>
                  </button>
                );
              })}
            </div>
          }
        </main>

        <section className="shrink-0 border-t border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">
              {t('pos.cartTitle')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {subOrders.map((o, idx) => {
                const isActive = idx === activeSubOrderIndex;
                const pieceCount = o.lines.reduce((n, l) => n + l.quantity, 0);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setActiveSubOrderIndex(idx)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      isActive ?
                        'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40',
                    )}
                  >
                    {o.kind === 'primary' ?
                      t('pos.multiOrder.tabPrimary', { n: idx + 1 })
                    : t('pos.multiOrder.tabAttached', { n: idx + 1 })}
                    {pieceCount > 0 ?
                      <span className="ms-0.5 tabular-nums">({pieceCount})</span>
                    : null}
                  </button>
                );
              })}
            </div>
          </div>
          {selected ?
            <div className="border-b border-border bg-primary/[0.06] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                {t('pos.subscription.title')}
              </p>
              {billingLoading || !billing ?
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('pos.subscription.loading')}
                </p>
              : <div className="mt-1.5 space-y-1 text-[11px]">
                  <div className="flex flex-wrap justify-between gap-1">
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
                  <p
                    className={cn(
                      'text-muted-foreground',
                      Number.isFinite(debtNum) && debtNum > 0 && 'font-semibold text-red-700',
                    )}
                  >
                    {t('pos.subscription.debt')}:{' '}
                    {Number.parseFloat(billing.debt).toFixed(3)} {kwdSuffix}
                  </p>
                  {isBalanceWarning ?
                    <p className="text-[10px] font-semibold text-red-700">
                      {t('pos.balanceWarning')}
                    </p>
                  : null}
                  {!needsExternalPayment && combinedLineSubtotal > 0 && billing ?
                    <p className="text-[10px] text-primary">
                      {t('pos.subscription.walletCovers')}
                    </p>
                  : null}
                  {needsExternalPayment && billing ?
                    <p className="text-[10px] text-amber-800">
                      {t('pos.subscription.shortfallHint')}
                    </p>
                  : null}
                </div>
              }
            </div>
          : null}
          <ScrollArea className="max-h-[32vh]">
            <div className="p-2">
              {cart.length === 0 ?
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {t('pos.cartEmpty')}
                </p>
              : cart.map((line) => (
                  <div
                    key={line.lineKey}
                    className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1 text-start">
                      <p className="line-clamp-2 font-medium text-foreground">
                        {line.nameAr}
                      </p>
                      <p className="tabular-nums text-[10px] text-muted-foreground">
                        {line.unitPrice.toFixed(3)} ×
                        <input
                          type="number"
                          min={1}
                          className="mx-1 w-10 rounded border border-border bg-background px-0.5 py-0.5 text-center text-[10px]"
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
        </section>
      </div>

      <footer className="z-20 shrink-0 border-t border-border bg-card/95 px-3 py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {t('pos.grandTotalLabel')}
            </span>
            <span className="text-lg font-bold tabular-nums text-primary">
              {grandTotal.toLocaleString(dateLocale, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              {kwdSuffix}
            </span>
          </div>
          {subOrders.some((o) => sumLinesKd(o.lines) > 0) ?
            <div className="rounded-lg border border-border/80 bg-muted/15 p-2 text-[10px]">
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
                return (
                  <div key={o.id} className="mt-1 flex justify-between text-muted-foreground">
                    <span>
                      {o.kind === 'primary' ?
                        t('pos.multiOrder.summaryPrimary', { n: idx + 1 })
                      : t('pos.multiOrder.summaryAttached', { n: idx + 1 })}
                    </span>
                    <span className="tabular-nums">
                      {lineSum.toFixed(3)} · {t('pos.deliveryFeeLabel')}{' '}
                      {dFee > 0 ? `${dFee.toFixed(3)}` : t('pos.multiOrder.freeDeliveryAttached')}
                    </span>
                  </div>
                );
              })}
            </div>
          : null}
          {selected && needsExternalPayment ?
            <p className="text-center text-[11px] font-medium text-foreground">
              {t('pos.payment.cash')} · {t('pos.payment.title')}
            </p>
          : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 touch-manipulation text-xs"
              disabled={!receiptSheets?.length}
              onClick={handlePrintReceipt}
            >
              Print receipt
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 touch-manipulation text-xs"
              disabled={!receiptSheets?.some((s) => s.orderId)}
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
              grandTotal <= 0 ||
              (Boolean(selected) && billingLoading)
            }
            size="lg"
            className="h-12 w-full touch-manipulation text-base font-semibold"
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
