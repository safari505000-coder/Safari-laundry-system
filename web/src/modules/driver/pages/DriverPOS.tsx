import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  Home,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Receipt,
  ShoppingBag,
  Star,
  Tags,
  User,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { OrderScanInput } from '@/modules/shared/components/orders/order-scan-input';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { ThemeToggle } from '@/modules/shared/theme/theme-toggle';
import { SystemClosedScreen } from '@/components/system/system-closed-screen';
import { Button } from '@/modules/shared/components/ui/button';
import { Input } from '@/modules/shared/components/ui/input';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/modules/shared/components/ui/sheet';
import { ConnectivityBadge } from '@/offline/connectivity-badge';
import { cn } from '@/lib/utils';
import { sumLinesKd, DELIVERY_FEE_KD } from '@/utils/finance-engine';
import { usePosEngine } from '@/modules/shared/hooks/use-pos-engine';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { PosAuxiliaryUi } from '@/modules/shared/components/pos/pos-auxiliary-ui';
import { useDriverOperatingPoll } from '@/modules/driver/hooks/use-driver-operating-poll';

/**
 * V19.23 — Field POS (Driver) — «Split / Drawer» layout.
 *
 * Dastur §6 motivation: the previous three-row header, stacked cart
 * sections, and oversized footer all rendered visible on mobile at
 * the same time, pushing the product grid behind 2-3 scroll zones.
 * The new layout keeps every piece of data but separates concerns:
 *
 *   • Desktop (md+): classic productivity split — product grid on
 *     the start edge, sticky cart/payment sidebar on the end edge.
 *   • Mobile: product grid fills the viewport; the cart lives in a
 *     pull-up drawer triggered from a persistent peek bar pinned to
 *     the bottom, so the driver always sees «how many pieces + total»
 *     even when the drawer is closed.
 *
 * All business logic stays in `usePosEngine`. This file is layout
 * only — no finance, no API glue, no validation.
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
    addAttachedOrder,
    posPaymentMethod,
    setPosPaymentMethod,
    receiptSheets,
    handlePrintReceipt,
    handlePrintGarmentTags,
    checkoutBusy,
    customerBlocked,
    customerBlockReason,
    combinedVipSurcharge,
    setVipForSubOrder,
    completePayment,
  } = p;

  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [menuSheetOpen, setMenuSheetOpen] = useState(false);

  const cartPieceCount = useMemo(
    () => cart.reduce((n, l) => n + l.quantity, 0),
    [cart],
  );
  const grandTotalFormatted = grandTotal.toLocaleString(dateLocale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  const hoursLocked = operating ? (operating.lockEnabled ?? true) : true;
  if (operating && hoursLocked && !operating.isOpen) {
    return (
      <SystemClosedScreen
        kuwaitTimeLabel={operating.kuwaitTimeLabel}
        onSignOut={signOut}
      />
    );
  }

  /* ─────────────────────────── Cart panel ─────────────────────────── */
  /* Shared between desktop sidebar and mobile drawer. */
  const cartPanel = (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {/* Customer badge */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        {selected ? (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">
                {selected.displayName || t('pos.noName')}
              </p>
              <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                {selected.phone}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={() => setSelected(null)}
            >
              {t('pos.change')}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {t('pos.emptyCustomerHint')}
          </p>
        )}
      </div>

      {/* Sub-order tabs (only when more than one, or has attached) */}
      {subOrders.length > 1 ? (
        <div className="shrink-0 border-b border-border bg-background px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {subOrders.map((o, idx) => {
              const isActive = idx === activeSubOrderIndex;
              const pieceCount = o.lines.reduce((n, l) => n + l.quantity, 0);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActiveSubOrderIndex(idx)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[10px] font-semibold transition',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40 hover:bg-muted',
                  )}
                >
                  {o.kind === 'primary'
                    ? t('pos.multiOrder.tabPrimary', { n: idx + 1 })
                    : t('pos.multiOrder.tabAttached', { n: idx + 1 })}
                  {pieceCount > 0 ? (
                    <span className="ms-1 tabular-nums">({pieceCount})</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Subscription panel */}
      {selected ? (
        <div className="shrink-0 border-b border-border bg-primary/[0.06] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Wallet className="h-3 w-3" />
            {t('pos.subscription.title')}
          </p>
          {billingLoading || !billing ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('pos.subscription.loading')}
            </p>
          ) : (
            <div className="mt-1.5 space-y-1 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-muted-foreground">
                  {billing.subscriptionActive
                    ? t('pos.subscription.statusActive')
                    : t('pos.subscription.statusInactive')}
                </span>
                <span
                  className={cn(
                    'rounded-full bg-background px-2 py-0.5 font-medium ring-1 ring-border tabular-nums',
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
                  Number.isFinite(debtNum) &&
                    debtNum > 0 &&
                    'font-semibold text-red-700',
                )}
              >
                {t('pos.subscription.debt')}:{' '}
                {Number.parseFloat(billing.debt).toFixed(3)} {kwdSuffix}
              </p>
              {isBalanceWarning ? (
                <p className="text-[10px] font-semibold text-red-700">
                  {t('pos.balanceWarning')}
                </p>
              ) : null}
              {!needsExternalPayment && combinedLineSubtotal > 0 ? (
                <p className="text-[10px] text-primary">
                  {t('pos.subscription.walletCovers')}
                </p>
              ) : null}
              {needsExternalPayment ? (
                <p className="text-[10px] text-amber-800">
                  {t('pos.subscription.shortfallHint')}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* Cart items (scrollable body) */}
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <ShoppingBag className="h-3.5 w-3.5" />
              {t('pos.cartTitle')}
            </p>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {t('pos.cartEmpty')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {cart.map((line) => (
                  <div
                    key={line.lineKey}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1 text-start">
                      <p className="line-clamp-2 font-medium text-foreground">
                        {line.nameAr}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 tabular-nums text-[10px] text-muted-foreground">
                        <span>{line.unitPrice.toFixed(3)}</span>
                        <span>×</span>
                        <input
                          type="number"
                          min={1}
                          className="w-11 rounded border border-border bg-background px-1 py-0.5 text-center text-[11px]"
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
                ))}
              </div>
            )}

            {/* Per-order breakdown with VIP toggle */}
            {subOrders.some((o) => sumLinesKd(o.lines) > 0) ? (
              <div className="mt-3 rounded-lg border border-border/80 bg-muted/15 p-2.5 text-[10px]">
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
                    <div key={o.id} className="mt-1.5 space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>
                          {o.kind === 'primary'
                            ? t('pos.multiOrder.summaryPrimary', { n: idx + 1 })
                            : t('pos.multiOrder.summaryAttached', {
                                n: idx + 1,
                              })}
                        </span>
                        <span className="tabular-nums">
                          {lineSum.toFixed(3)} · {t('pos.deliveryFeeLabel')}{' '}
                          {dFee > 0
                            ? `${dFee.toFixed(3)}`
                            : t('pos.multiOrder.freeDeliveryAttached')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setVipForSubOrder(idx)}
                        aria-pressed={vipOn}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-[10px] font-semibold transition',
                          vipOn
                            ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-[0_0_0_2px_rgba(245,158,11,0.15)]'
                            : 'border-border bg-background text-muted-foreground hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-800',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <Star
                            className={cn(
                              'h-3.5 w-3.5 transition',
                              vipOn
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-muted-foreground',
                            )}
                            strokeWidth={vipOn ? 0 : 1.75}
                          />
                          <span className="tracking-wide">
                            {t('pos.vip.toggleLabel')}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {vipOn ? `+1.000 ${kwdSuffix}` : t('pos.vip.off')}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {combinedVipSurcharge > 0 ? (
                  <div className="mt-1.5 flex justify-between border-t border-border/60 pt-1 font-semibold text-amber-800">
                    <span>{t('pos.vip.lineLabel')}</span>
                    <span className="tabular-nums">
                      {combinedVipSurcharge.toFixed(3)} {kwdSuffix}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      {/* Footer: total + payment methods + CTAs */}
      <div className="shrink-0 border-t border-border bg-card px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            {t('pos.grandTotalLabel')}
          </span>
          <span className="text-xl font-bold tabular-nums text-primary">
            {grandTotalFormatted} {kwdSuffix}
          </span>
        </div>

        {selected ? (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              {t('pos.payment.title')}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ['CASH', t('pos.payment.cash')],
                  ['KNET', t('pos.payment.knet')],
                  ['PAYMENT_LINK', t('pos.payment.online')],
                  ['DEBT_ON_ACCOUNT', t('pos.payment.debt')],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setPosPaymentMethod(
                      m as
                        | 'CASH'
                        | 'KNET'
                        | 'PAYMENT_LINK'
                        | 'DEBT_ON_ACCOUNT',
                    )
                  }
                  className={cn(
                    'rounded-full border px-2 py-2 text-[11px] font-semibold transition touch-manipulation',
                    posPaymentMethod === m
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:bg-muted/60',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 touch-manipulation gap-1 text-[11px]"
            disabled={!receiptSheets?.length}
            onClick={handlePrintReceipt}
          >
            <Receipt className="h-3.5 w-3.5" />
            {t('pos.printReceipt')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 touch-manipulation gap-1 text-[11px]"
            disabled={!receiptSheets?.some((s) => s.orderId)}
            onClick={handlePrintGarmentTags}
          >
            <Tags className="h-3.5 w-3.5" />
            {t('pos.printGarmentTags')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 touch-manipulation gap-1 border-emerald-500/40 bg-emerald-50 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
            onClick={addAttachedOrder}
            disabled={!selected || customerBlocked}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('pos.addAnotherInvoice')}
          </Button>
        </div>

        {customerBlocked ? (
          <div className="mt-2 rounded-xl bg-red-500 p-4 text-white">
            🚫 لا يمكن تنفيذ الطلب
            <div className="mt-2 text-sm">
              العميل موقوف بسبب: {customerBlockReason ?? 'غير محدد'}
            </div>
            <div className="mt-2">الرجاء التواصل مع الإدارة</div>
          </div>
        ) : null}

        <Button
          type="button"
          disabled={
            checkoutBusy ||
            customerBlocked ||
            combinedLineSubtotal <= 0 ||
            !selected ||
            grandTotal <= 0
          }
          size="lg"
          className="mt-2 h-12 w-full touch-manipulation text-base font-semibold"
          onClick={() => void completePayment()}
        >
          {checkoutBusy ? (
            <>
              <Loader2 className="me-2 h-5 w-5 animate-spin" />
              {t('pos.checkout.working')}
            </>
          ) : (
            t('pos.completePayment')
          )}
        </Button>
      </div>
    </div>
  );

  /* ─────────────────────────── Main layout ─────────────────────────── */
  return (
    <div
      data-pos-root
      className="flex h-[100dvh] max-w-[100vw] flex-col overflow-hidden bg-muted/40"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      {/* ── Compact header (single row) ── */}
      <header className="z-20 shrink-0 border-b border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Safari"
            width={96}
            className="h-9 w-auto max-w-[96px] shrink-0 object-contain"
          />
          <ConnectivityBadge dense className="hidden min-[380px]:flex" />

          <div className="relative min-w-0 flex-1">
            <Input
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                if (selected) setSelected(null);
              }}
              placeholder={t('pos.searchPlaceholder')}
              className="h-10 bg-background pe-9 text-start text-sm"
              autoComplete="off"
            />
            {searching ? (
              <Loader2 className="absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
            {searchHits.length > 0 && !selected ? (
              <ul className="absolute start-0 end-0 top-full z-30 mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-popover py-1 text-sm shadow-lg">
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
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-amber-500/40 bg-amber-50 text-amber-900"
            onClick={() => setNewOpen(true)}
            aria-label={t('pos.newCustomer.open')}
          >
            <Plus className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setMenuSheetOpen(true)}
            aria-label={t('pos.menu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Second row: active customer + financial date (only when needed) */}
        {selected || operating ? (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            {selected ? (
              <p className="min-w-0 truncate">
                {t('pos.activeCustomer')}{' '}
                <strong className="text-foreground">
                  {selected.displayName || t('pos.noName')} · {selected.phone}
                </strong>
              </p>
            ) : (
              <span />
            )}
            {operating ? (
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                {t('pos.financialDate')}{' '}
                <strong className="text-foreground">
                  {operating.financialDateLabel}
                </strong>
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* ── Body: responsive split (products + sidebar) ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: product grid */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pt-3 pb-3">
          {/* Scan input pinned above the grid */}
          <div className="mb-3 shrink-0">
            <OrderScanInput
              token={token}
              className="w-full"
              onOrderLoaded={(o) => {
                setScanOrderDetail(o);
                setScanOrderDialogOpen(true);
              }}
            />
          </div>

          {catalogLoading && catalogItems.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {t('pos.catalogEmpty')}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {catalogFailed
                  ? t('pos.catalogLoadFailed')
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
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {catalogItems.map((item) => {
                const { Icon, tone } = defaultVisual(item.code);
                const price = basePriceKd(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openServiceModal(item)}
                    className={cn(
                      'group relative flex min-h-[140px] flex-col items-stretch rounded-2xl border border-border bg-card p-3 text-center shadow-sm transition-all',
                      'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.98]',
                    )}
                  >
                    <span className="absolute top-2.5 text-[11px] font-bold tabular-nums text-primary end-2.5">
                      {price.toFixed(3)} {kwdSuffix}
                    </span>
                    <div
                      className={cn(
                        'mx-auto mt-6 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                        tone,
                      )}
                    >
                      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                    </div>
                    <span className="mt-auto line-clamp-2 pt-2 text-xs font-semibold leading-snug text-foreground">
                      {item.nameAr}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        {/* Right: sticky cart sidebar (desktop only) */}
        <aside className="hidden shrink-0 border-s border-border md:flex md:w-[360px] md:flex-col lg:w-[400px]">
          {cartPanel}
        </aside>
      </div>

      {/* ── Mobile peek bar (bottom) ── */}
      <button
        type="button"
        onClick={() => setCartDrawerOpen(true)}
        className="z-20 flex shrink-0 items-center justify-between gap-2 border-t border-border bg-primary px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-primary-foreground shadow-[0_-6px_20px_rgba(0,0,0,0.12)] md:hidden"
      >
        <div className="flex items-center gap-2">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
            <ShoppingBag className="h-5 w-5" />
            {cartPieceCount > 0 ? (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-950">
                {cartPieceCount}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] opacity-90">
              {t('pos.grandTotalLabel')}
            </span>
            <span className="text-base font-bold tabular-nums">
              {grandTotalFormatted} {kwdSuffix}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold">
          <span>{t('pos.showCart')}</span>
          <ChevronUp className="h-4 w-4" />
        </div>
      </button>

      {/* ── Mobile cart drawer ── */}
      <Sheet open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 rounded-t-2xl p-0 md:hidden"
        >
          {/* Drag handle */}
          <div className="shrink-0 pt-2 pb-1">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          </div>
          <SheetHeader className="shrink-0 flex-row items-center justify-between gap-2 border-b border-border p-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" />
              {t('pos.cartTitle')}
              {cartPieceCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary tabular-nums">
                  {cartPieceCount}
                </span>
              ) : null}
            </SheetTitle>
            <button
              type="button"
              onClick={() => setCartDrawerOpen(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {t('pos.close')}
            </button>
          </SheetHeader>
          {cartPanel}
        </SheetContent>
      </Sheet>

      {/* ── Settings / menu sheet ── */}
      <Sheet open={menuSheetOpen} onOpenChange={setMenuSheetOpen}>
        <SheetContent
          side={rtl ? 'left' : 'right'}
          className="flex w-[82vw] max-w-sm flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle className="text-base">{t('pos.menu')}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start gap-2 text-sm"
              onClick={() => {
                setMenuSheetOpen(false);
                navigate('/my-field-expenses');
              }}
            >
              <Home className="h-4 w-4" />
              {t('dashboard.quickAddExpense')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <LanguageToggle
                variant="outline"
                className="h-11 justify-start bg-background"
              />
              <ThemeToggle
                variant="outline"
                className="h-11 justify-start bg-background"
              />
            </div>
            <div className="mt-auto">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start gap-2 border-red-200 text-sm text-red-700 hover:bg-red-50"
                onClick={() => {
                  setMenuSheetOpen(false);
                  signOut();
                }}
              >
                <LogOut className="h-4 w-4" />
                {t('nav.signOut')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <PosAuxiliaryUi p={p} />
    </div>
  );
}
