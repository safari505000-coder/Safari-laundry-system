import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bed,
  Frame,
  Layers,
  Loader2,
  LogOut,
  Minus,
  PartyPopper,
  Plus,
  Shirt,
  Sparkles,
  User,
  Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type CustomerBillingProfile,
  type CustomerSearchRow,
  type LaundryPriceListItemRow,
  type PosPaymentMethod,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/hooks/use-app-locale';
import { LanguageToggle } from '@/components/i18n/language-toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type CartLine = {
  lineKey: string;
  laundryId: string;
  code: string;
  nameAr: string;
  serviceKey: 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS';
  serviceLabel: string;
  neshaLevel: '100%' | '50%' | '0%';
  foldingStyle: 'SEEDA' | 'MIRZAAM' | 'MURABAA' | 'SHARSHAF' | 'TASFEET' | '';
  itemNote: string;
  unitPrice: number;
  quantity: number;
};

type ReceiptSnapshot = {
  orderNumber: string;
  createdAt: string;
  employeeName: string;
  employeeId: string;
  customerName: string;
  customerMobile: string;
  customerBalance: string;
  customerAddress: string;
  serviceType: string;
  discountType: 'VALUE' | 'PERCENTAGE';
  discountAmount: number;
  lines: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    neshaLevel: '100%' | '50%' | '0%';
    foldingStyle: string;
    itemNote: string;
  }>;
  total: number;
  paymentLabel?: string;
};

type ServiceOption = {
  key: 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS';
  labelAr: string;
  price: number;
  available: boolean;
};

const POS_VISUAL: Record<string, { Icon: LucideIcon; tone: string }> = {
  DISHDASHA_ORD: { Icon: Shirt, tone: 'bg-violet-100 text-[#1e3a5f]' },
  DISHDASHA_WOOL: { Icon: Shirt, tone: 'bg-slate-200 text-[#1e3a5f]' },
  GHUTRA_SHEMAGH: { Icon: Wind, tone: 'bg-sky-100 text-[#1e3a5f]' },
  BISHT_OCCASION: {
    Icon: PartyPopper,
    tone: 'bg-amber-100 text-[#1e3a5f]',
  },
  BLANKET_ALL: { Icon: Bed, tone: 'bg-teal-100 text-[#1e3a5f]' },
  DYPAJ_ALL: { Icon: Layers, tone: 'bg-emerald-100 text-[#1e3a5f]' },
  SUIT_FULL: { Icon: User, tone: 'bg-stone-200 text-[#1e3a5f]' },
  JACKET: { Icon: Shirt, tone: 'bg-rose-100 text-[#1e3a5f]' },
  DRESS_LADIES_OCCASION: {
    Icon: Sparkles,
    tone: 'bg-pink-100 text-[#1e3a5f]',
  },
  PARDA: { Icon: Frame, tone: 'bg-neutral-200 text-[#1e3a5f]' },
};

function defaultVisual(code: string): { Icon: LucideIcon; tone: string } {
  return (
    POS_VISUAL[code] ?? {
      Icon: Sparkles,
      tone: 'bg-slate-100 text-[#1e3a5f]',
    }
  );
}

function basePriceKd(item: LaundryPriceListItemRow): number {
  return Number.parseFloat(item.priceNormal);
}

function serviceOptionsForItem(item: LaundryPriceListItemRow): ServiceOption[] {
  const normal = Number.parseFloat(item.priceNormal);
  const urgent = Number.parseFloat(item.priceUrgent);
  const press = item.pricePressOnly ? Number.parseFloat(item.pricePressOnly) : NaN;
  const urgentPress = item.priceUrgentPress ?
      Number.parseFloat(item.priceUrgentPress)
    : NaN;

  return [
    {
      key: 'NORMAL',
      labelAr: 'غسيل وكوي عادي',
      price: normal,
      available: Number.isFinite(normal),
    },
    {
      key: 'URGENT',
      labelAr: 'غسيل وكوي مستعجل',
      price: urgent,
      available: Number.isFinite(urgent),
    },
    {
      key: 'PRESS_ONLY',
      labelAr: 'كوي عادي',
      price: press,
      available: Number.isFinite(press),
    },
    {
      key: 'URGENT_PRESS',
      labelAr: 'كوي مستعجل',
      price: urgentPress,
      available: Number.isFinite(urgentPress),
    },
  ];
}

export function PosPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, user, logout } = useAuth();
  const [catalogItems, setCatalogItems] = useState<LaundryPriceListItemRow[]>(
    [],
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<CustomerSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CustomerSearchRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhone2, setNewPhone2] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newAvenue, setNewAvenue] = useState('');
  const [newHouse, setNewHouse] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState<ReceiptSnapshot | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceItem, setServiceItem] = useState<LaundryPriceListItemRow | null>(null);
  const [serviceQty, setServiceQty] = useState<
    Record<'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS', number>
  >({
    NORMAL: 0,
    URGENT: 0,
    PRESS_ONLY: 0,
    URGENT_PRESS: 0,
  });
  const [serviceNesha, setServiceNesha] = useState(false);
  const [serviceFolding, setServiceFolding] = useState(false);
  const [serviceNeshaLevel, setServiceNeshaLevel] = useState<'100%' | '50%' | '0%'>(
    '0%',
  );
  const [serviceFoldingStyle, setServiceFoldingStyle] = useState<
    'SEEDA' | 'MIRZAAM' | 'MURABAA' | 'SHARSHAF' | 'TASFEET' | ''
  >('');
  const [serviceItemNote, setServiceItemNote] = useState('');
  const [discountType, setDiscountType] = useState<'VALUE' | 'PERCENTAGE'>(
    'VALUE',
  );
  const [discountInput, setDiscountInput] = useState('0');
  const [billing, setBilling] = useState<CustomerBillingProfile | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [posPaymentMethod, setPosPaymentMethod] = useState<
    'CASH' | 'KNET' | 'PAYMENT_LINK'
  >('CASH');

  const loadCatalog = useCallback(async () => {
    if (!token) {
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    setCatalogFailed(false);
    try {
      const data = await apiJson<LaundryPriceListItemRow[]>(
        '/api/laundry-price-list',
        { token },
      );
      setCatalogItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setCatalogItems([]);
      setCatalogFailed(true);
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('pos.catalogLoadFailed'));
    } finally {
      setCatalogLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const tmr = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const rows = await apiJson<CustomerSearchRow[]>(
            `/api/pos/customers/search?q=${encodeURIComponent(q)}`,
            { token: token! },
          );
          if (!cancelled) setSearchHits(rows);
        } catch (e) {
          if (!cancelled && e instanceof ApiError) toast.error(e.message);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [searchQ, token]);

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [cart],
  );

  const netAfterDiscount = useMemo(() => {
    const discountRaw = Number.parseFloat(discountInput);
    const safeDiscountInput =
      Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;
    const discountAmount =
      discountType === 'PERCENTAGE' ?
        (total * safeDiscountInput) / 100
      : safeDiscountInput;
    return Math.max(0, total - discountAmount);
  }, [total, discountType, discountInput]);

  const balanceNum = billing
    ? Number.parseFloat(billing.remainingBalance)
    : NaN;
  /** If billing is unknown, assume shortfall until server confirms — always send external method when net > 0. */
  const needsExternalPayment =
    netAfterDiscount > 0 &&
    (billing === null ||
      !Number.isFinite(balanceNum) ||
      balanceNum + 1e-9 < netAfterDiscount);

  const loadBilling = useCallback(
    async (customerId: string) => {
      if (!token) return;
      setBillingLoading(true);
      try {
        const row = await apiJson<CustomerBillingProfile>(
          `/api/pos/customers/${customerId}/billing`,
          { token },
        );
        setBilling(row);
      } catch (e) {
        setBilling(null);
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setBillingLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!selected?.id) {
      setBilling(null);
      return;
    }
    void loadBilling(selected.id);
  }, [selected?.id, loadBilling]);

  const kwdSuffix = i18n.language.startsWith('ar') ? 'د.ك' : 'KWD';

  function formatKwdParts(value: number): { dinar: string; fils: string } {
    const fixed = Number.isFinite(value) ? value.toFixed(3) : '0.000';
    const [dinar, fils = '000'] = fixed.split('.');
    return { dinar, fils };
  }

  function openServiceModal(item: LaundryPriceListItemRow) {
    setServiceItem(item);
    setServiceQty({
      NORMAL: 0,
      URGENT: 0,
      PRESS_ONLY: 0,
      URGENT_PRESS: 0,
    });
    setServiceNesha(false);
    setServiceFolding(false);
    setServiceNeshaLevel('0%');
    setServiceFoldingStyle('');
    setServiceItemNote('');
    setServiceOpen(true);
  }

  function setQty(lineKey: string, qty: number) {
    if (qty < 1) {
      setCart((prev) => prev.filter((x) => x.lineKey !== lineKey));
      return;
    }
    setCart((prev) =>
      prev.map((x) =>
        x.lineKey === lineKey ? { ...x, quantity: qty } : x,
      ),
    );
  }

  function changeServiceQty(
    key: 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS',
    delta: number,
  ) {
    setServiceQty((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  }

  function addServiceSelectionToCart() {
    if (!serviceItem) return;
    const options = serviceOptionsForItem(serviceItem);
    const selectedLines = options
      .filter((o) => o.available && serviceQty[o.key] > 0)
      .map((o) => ({
        option: o,
        quantity: serviceQty[o.key],
      }));

    if (selectedLines.length === 0) {
      toast.error('اختر خدمة واحدة على الأقل');
      return;
    }

    const extrasLabel = `${serviceNesha ? ' + نشا' : ''}${serviceFolding ? ' + طي' : ''}`;
    setCart((prev) => {
      const next = [...prev];
      for (const line of selectedLines) {
        const lineKey =
          `${serviceItem.id}:${line.option.key}:${serviceNesha ? serviceNeshaLevel : '0%'}:${serviceFolding ? serviceFoldingStyle : ''}:${serviceItemNote.trim()}`;
        const existingIndex = next.findIndex((x) => x.lineKey === lineKey);
        const displayName =
          `${serviceItem.nameAr} - ${line.option.labelAr}${extrasLabel}`;

        if (existingIndex === -1) {
          next.push({
            lineKey,
            laundryId: serviceItem.id,
            code: serviceItem.code,
            nameAr: displayName,
            serviceKey: line.option.key,
            serviceLabel: line.option.labelAr,
            neshaLevel: serviceNesha ? serviceNeshaLevel : '0%',
            foldingStyle: serviceFolding ? serviceFoldingStyle : '',
            itemNote: serviceItemNote.trim(),
            unitPrice: line.option.price,
            quantity: line.quantity,
          });
        } else {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + line.quantity,
          };
        }
      }
      return next;
    });
    setServiceOpen(false);
    toast.success('تمت إضافة الخدمة إلى سلة الأصناف');
  }

  function resetNewCustomerForm() {
    setNewName('');
    setNewPhone('');
    setNewPhone2('');
    setNewArea('');
    setNewBlock('');
    setNewStreet('');
    setNewAvenue('');
    setNewHouse('');
  }

  async function saveNewCustomer() {
    const name = newName.trim();
    const phone = newPhone.replace(/[\s-]/g, '').trim();
    if (name.length < 1 || phone.length < 8) {
      toast.error(t('pos.newCustomer.validation'));
      return;
    }
    if (!token) return;
    setSavingCustomer(true);
    try {
      const row = await apiJson<CustomerSearchRow>('/api/pos/customers', {
        method: 'POST',
        token,
        body: JSON.stringify({
          displayName: name,
          phone,
          phone2: newPhone2.trim() || undefined,
          addressArea: newArea.trim() || undefined,
          addressBlock: newBlock.trim() || undefined,
          addressStreet: newStreet.trim() === '' ? null : newStreet.trim(),
          addressAvenue: newAvenue.trim() || undefined,
          addressHouse: newHouse.trim() || undefined,
        }),
      });
      setSelected(row);
      void loadBilling(row.id);
      setSearchQ('');
      setSearchHits([]);
      setNewOpen(false);
      resetNewCustomerForm();
      toast.success(t('pos.newCustomer.created'));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSavingCustomer(false);
    }
  }

  async function completePayment() {
    if (!token || !user) return;
    if (!selected) {
      toast.error(t('pos.checkout.pickCustomer'));
      return;
    }
    if (cart.length === 0) {
      toast.error(t('pos.checkout.emptyCart'));
      return;
    }
    const receiptLines = cart.map((c) => ({
      label: c.nameAr,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      lineTotal: c.quantity * c.unitPrice,
      neshaLevel: c.neshaLevel,
      foldingStyle: c.foldingStyle,
      itemNote: c.itemNote,
    }));
    const lineItemsFull = cart.map((c) => ({
      label: c.nameAr,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
    }));
    const phone = selected.phone.replace(/[\s-]/g, '').trim();

    setCheckoutBusy(true);
    try {
      const discountRaw = Number.parseFloat(discountInput);
      const safeDiscountInput =
        Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;
      const discountAmount =
        discountType === 'PERCENTAGE' ?
          (total * safeDiscountInput) / 100
        : safeDiscountInput;
      const netTotal = netAfterDiscount;

      const extMethod: PosPaymentMethod | undefined =
        needsExternalPayment ? posPaymentMethod : undefined;

      /** Server requires Σ(qty×price) ≈ totalPrice; omit lines when discount breaks that equality. */
      const MONEY_EPS = 0.005;
      const lineItemsPayload =
        Math.abs(total - netTotal) < MONEY_EPS ? lineItemsFull : undefined;

      const created = await apiJson<{
        id?: string;
        invoiceNumber?: string | null;
        createdAt?: string;
      }>('/api/pos/checkout', {
        method: 'POST',
        token,
        body: JSON.stringify({
          customerPhone: phone,
          customerId: selected.id,
          customerDisplayName: selected.displayName ?? undefined,
          totalPrice: netTotal,
          ...(lineItemsPayload ? { lineItems: lineItemsPayload } : {}),
          serviceType: 'NORMAL',
          ...(extMethod ? { posPaymentMethod: extMethod } : {}),
        }),
      });

      let balanceAfter = selected.wallet?.balance ?? '0.0000';
      try {
        const fresh = await apiJson<CustomerBillingProfile>(
          `/api/pos/customers/${selected.id}/billing`,
          { token },
        );
        setBilling(fresh);
        balanceAfter = fresh.remainingBalance;
        setSelected((prev) =>
          prev && prev.id === selected.id ?
            {
              ...prev,
              wallet: {
                balance: fresh.remainingBalance,
                debt: fresh.debt,
              },
            }
          : prev,
        );
      } catch {
        /* keep previous balance on receipt */
      }

      const paymentLabel = needsExternalPayment
        ? t(`pos.pay.${posPaymentMethod}` as const)
        : t('pos.pay.SUBSCRIPTION_WALLET');

      setReceiptSnapshot({
        orderNumber: created.invoiceNumber || created.id || '-',
        createdAt: created.createdAt || new Date().toISOString(),
        employeeName: user.fullName || user.username,
        employeeId: user.username,
        customerName: selected.displayName?.trim() || t('pos.receiptWalkIn'),
        customerMobile: selected.phone,
        customerBalance: balanceAfter,
        customerAddress: [
          selected.addressArea,
          selected.addressBlock,
          selected.addressStreet,
          selected.addressAvenue,
          selected.addressHouse,
        ]
          .filter(Boolean)
          .join(' · ') || selected.address || '-',
        serviceType: 'N WASH',
        discountType,
        discountAmount,
        lines: receiptLines,
        total: netTotal,
        paymentLabel,
      });

      toast.success(t('pos.checkout.done'));
      setCart([]);
      window.setTimeout(() => {
        window.print();
      }, 120);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setCheckoutBusy(false);
    }
  }

  function handlePrintReceipt() {
    if (!receiptSnapshot) {
      toast.error('No receipt ready to print yet.');
      return;
    }
    window.print();
  }

  function signOut() {
    logout();
    navigate('/login', { replace: true });
  }

  const rtl = i18n.language.startsWith('ar');

  return (
    <div
      data-pos-root
      className="flex max-h-[100dvh] min-h-[100dvh] max-w-[100vw] flex-col overflow-x-hidden overflow-y-hidden bg-muted/40"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <header className="z-20 shrink-0 border-b border-border bg-card px-3 py-2 shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <img
            src="/logo.png"
            alt="Safari Fast"
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
            <LanguageToggle variant="outline" className="bg-background" />
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
        {selected ?
          <p className="mt-2 text-xs text-muted-foreground">
            {t('pos.activeCustomer')}{' '}
            <strong className="text-foreground">
              {selected.displayName || t('pos.noName')} · {selected.phone}
              {selected.phone2 ? ` · ${selected.phone2}` : ''}
            </strong>
          </p>
        : null}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden border-border p-3 sm:p-4 md:w-[70%] md:max-w-[70%] md:flex-none md:border-e">
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
          : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('pos.cartItemsCount', {
                count: cart.reduce((n, l) => n + l.quantity, 0),
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
                    <span className="rounded-full bg-background px-2 py-0.5 font-medium text-foreground ring-1 ring-border">
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
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t('pos.subscription.balance')}:
                    </span>{' '}
                    {Number.parseFloat(billing.remainingBalance).toFixed(3)}{' '}
                    {kwdSuffix}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t('pos.subscription.debt')}:
                    </span>{' '}
                    {Number.parseFloat(billing.debt).toFixed(3)} {kwdSuffix}
                  </p>
                  {!needsExternalPayment && netAfterDiscount > 0 && billing ?
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
            <div className="p-3">
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
                          className="mx-1 w-12 rounded-md border border-border bg-background px-1 py-0.5 text-center text-xs"
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
              {total.toLocaleString(dateLocale, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}{' '}
              {kwdSuffix}
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-white p-2 sm:w-auto sm:min-w-[280px]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">الخصم</span>
              <select
                className="h-8 rounded-md border border-zinc-200 px-2 text-xs"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as 'VALUE' | 'PERCENTAGE')
                }
              >
                <option value="VALUE">القيمة</option>
                <option value="PERCENTAGE">النسبة</option>
              </select>
              <Input
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="h-8 w-20 text-center"
                inputMode="decimal"
              />
            </div>
            {selected && needsExternalPayment ?
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium text-foreground">
                  {t('pos.payment.title')}
                </p>
                <select
                  className="h-11 min-h-11 w-full touch-manipulation rounded-md border border-zinc-200 bg-background px-2 text-sm font-medium"
                  value={posPaymentMethod}
                  onChange={(e) =>
                    setPosPaymentMethod(
                      e.target.value as 'CASH' | 'KNET' | 'PAYMENT_LINK',
                    )
                  }
                >
                  <option value="CASH">{t('pos.payment.cash')}</option>
                  <option value="KNET">{t('pos.payment.knet')}</option>
                  <option value="PAYMENT_LINK">{t('pos.payment.link')}</option>
                </select>
              </div>
            : null}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!receiptSnapshot}
            size="lg"
            className="h-12 min-h-12 w-full shrink-0 touch-manipulation text-base font-semibold sm:w-auto"
            onClick={handlePrintReceipt}
          >
            Print Receipt
          </Button>
          <Button
            type="button"
            disabled={
              checkoutBusy ||
              cart.length === 0 ||
              !selected ||
              total <= 0 ||
              (Boolean(selected) && billingLoading)
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

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent
          className="max-w-3xl border-border bg-white p-0"
          dir={rtl ? 'rtl' : 'ltr'}
        >
          {serviceItem ?
            <div className="grid gap-0 md:grid-cols-[1.55fr_1fr]">
              <div className="space-y-4 p-5">
                <DialogHeader className="text-start">
                  <DialogTitle className="text-lg font-bold text-[#1e3a5f]">
                    اختر نوع الخدمة - {serviceItem.nameAr}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-2">
                  {serviceOptionsForItem(serviceItem).map((service) => (
                    <div
                      key={service.key}
                      className={cn(
                        'grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border p-3',
                        service.available ?
                          'border-[#1e3a5f]/20 bg-white'
                        : 'border-zinc-200 bg-zinc-100 opacity-60',
                      )}
                    >
                      <div className="text-sm font-semibold text-zinc-800">
                        {service.labelAr}
                      </div>
                      <div className="text-sm font-bold text-[#1e3a5f]">
                        {service.available ? `${service.price.toFixed(3)} KWD` : '---'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-[#1e3a5f]/40"
                          disabled={!service.available || serviceQty[service.key] === 0}
                          onClick={() => changeServiceQty(service.key, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">
                          {serviceQty[service.key]}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          className="h-8 w-8 bg-[#1e3a5f] text-white hover:bg-[#17304f]"
                          disabled={!service.available}
                          onClick={() => changeServiceQty(service.key, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="mb-2 text-sm font-semibold">خيارات إضافية</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={serviceNesha}
                      onChange={(e) => setServiceNesha(e.target.checked)}
                    />
                    نشا (NESHA)
                  </label>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-600">مستوى النشا</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={serviceNeshaLevel}
                      onChange={(e) =>
                        setServiceNeshaLevel(
                          e.target.value as '100%' | '50%' | '0%',
                        )
                      }
                    >
                      <option value="100%">100%</option>
                      <option value="50%">50%</option>
                      <option value="0%">0%</option>
                    </select>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={serviceFolding}
                      onChange={(e) => setServiceFolding(e.target.checked)}
                    />
                    طي (Folding)
                  </label>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-600">نمط الطي</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                      value={serviceFoldingStyle}
                      onChange={(e) =>
                        setServiceFoldingStyle(
                          e.target.value as
                            | 'SEEDA'
                            | 'MIRZAAM'
                            | 'MURABAA'
                            | 'SHARSHAF'
                            | 'TASFEET'
                            | '',
                        )
                      }
                    >
                      <option value="">-</option>
                      <option value="SEEDA">SEEDA</option>
                      <option value="MIRZAAM">MIRZAAM</option>
                      <option value="MURABAA">MURABAA</option>
                      <option value="SHARSHAF">SHARSHAF</option>
                      <option value="TASFEET">TASFEET</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-zinc-600">ملاحظات الصنف</Label>
                    <Input
                      value={serviceItemNote}
                      onChange={(e) => setServiceItemNote(e.target.value)}
                      placeholder="Enter Item Note"
                      className="mt-1 bg-white"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    className="w-full bg-[#1e3a5f] text-white hover:bg-[#17304f]"
                    onClick={addServiceSelectionToCart}
                  >
                    إضافة إلى سلة الأصناف
                  </Button>
                </DialogFooter>
              </div>

              <div className="flex flex-col items-center justify-center gap-4 border-t border-zinc-100 bg-zinc-50 p-5 md:border-s md:border-t-0">
                {(() => {
                  const { Icon, tone } = defaultVisual(serviceItem.code);
                  return (
                    <>
                      <div
                        className={cn(
                          'flex h-28 w-28 items-center justify-center rounded-3xl',
                          tone,
                        )}
                      >
                        <Icon className="h-14 w-14" strokeWidth={1.4} />
                      </div>
                      <p className="text-center text-lg font-bold text-[#1e3a5f]">
                        {serviceItem.nameAr}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          : null}
        </DialogContent>
      </Dialog>

      <section
        id="pos-receipt-print"
        aria-hidden={receiptSnapshot ? undefined : true}
        className="hidden"
      >
        <div className="pos-receipt-wrap" dir="rtl">
          <img src="/logo.png" alt="Safari Fast" className="pos-receipt-logo" />
          <h2>Safari Laundry</h2>
          <p className="pos-receipt-sub">Farwaniya, 00</p>
          <p className="pos-receipt-sub">
            Shop Tel: 24899399 - Call Center: 22200299
          </p>
          <div className="pos-receipt-meta-grid">
            <p><strong>INV#:</strong> {receiptSnapshot?.orderNumber ?? '-'}</p>
            <p>
              <strong>Employee:</strong>{' '}
              {receiptSnapshot ?
                `${receiptSnapshot.employeeId} / ${receiptSnapshot.employeeName}`
              : '-'}
            </p>
            <p>
              <strong>Date:</strong>{' '}
              {(receiptSnapshot?.createdAt ?
                new Date(receiptSnapshot.createdAt)
              : new Date()
              ).toLocaleString(dateLocale)}
            </p>
          </div>
          <div className="pos-customer-box">
            <div className="pos-customer-row">
              <span><strong>Name:</strong> {receiptSnapshot?.customerName ?? '-'}</span>
              <span><strong>Mobile:</strong> {receiptSnapshot?.customerMobile ?? '-'}</span>
            </div>
            <div className="pos-customer-row">
              <span>
                <strong>Balance:</strong>{' '}
                {Number.parseFloat(receiptSnapshot?.customerBalance ?? '0')
                  .toFixed(3)}{' '}
                KWD
              </span>
            </div>
            <div className="pos-customer-address">
              <strong>Address:</strong> {receiptSnapshot?.customerAddress ?? '-'}
            </div>
          </div>
          <table className="pos-receipt-table">
            <thead>
              <tr>
                <th>الأصناف</th>
                <th>Type</th>
                <th className="text-end">K.D</th>
                <th className="text-end">F</th>
              </tr>
            </thead>
            <tbody>
              {(receiptSnapshot?.lines ?? []).map((line, idx) => (
                <tr key={`${line.label}-${idx}`}>
                  <td className="pos-receipt-desc">
                    <div>{line.label}</div>
                    <div className="pos-receipt-qty">{line.quantity} x</div>
                    {(line.neshaLevel !== '0%' || line.foldingStyle) ?
                      <div className="pos-receipt-specs">
                        <div><strong>المحددات:</strong></div>
                        <div>NESHA: {line.neshaLevel}</div>
                        {line.foldingStyle ? <div>Style: {line.foldingStyle}</div> : null}
                      </div>
                    : null}
                  </td>
                  <td>{receiptSnapshot?.serviceType ?? 'N WASH'}</td>
                  <td className="text-end">{formatKwdParts(line.lineTotal).dinar}</td>
                  <td className="text-end">{formatKwdParts(line.lineTotal).fils}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pos-receipt-totals">
            <div>
              <span>Total</span>
              <span>
                {(
                  (receiptSnapshot?.total ?? 0) +
                  (receiptSnapshot?.discountAmount ?? 0)
                ).toFixed(3)} KWD
              </span>
            </div>
            <div>
              <span>
                الخصم ({receiptSnapshot?.discountType === 'PERCENTAGE' ? 'النسبة' : 'القيمة'})
              </span>
              <span>{(receiptSnapshot?.discountAmount ?? 0).toFixed(3)} KWD</span>
            </div>
            <div className="net">
              <span>الصافي / Net</span>
              <span>{(receiptSnapshot?.total ?? 0).toFixed(3)} KWD</span>
            </div>
            {receiptSnapshot?.paymentLabel ?
              <div className="mt-1 text-[9px] text-muted-foreground">
                <strong>الدفع / Payment:</strong> {receiptSnapshot.paymentLabel}
              </div>
            : null}
          </div>
          <div className="pos-receipt-notes">
            <p><strong>ملاحظات:</strong></p>
            {(receiptSnapshot?.lines ?? [])
              .filter((l) => l.itemNote.trim().length > 0)
              .map((l, i) => (
                <p key={`${l.label}-note-${i}`}>
                  - {l.label}: {l.itemNote}
                </p>
              ))}
          </div>
          <div className="pos-receipt-terms">
            <p>الشروط والأحكام:</p>
            <p>
              يبدأ المندوب في تسليم الملابس المستعجلة بعد 4 ساعات من استلامها في الأيام
              العادية و 24 ساعة فترة الأعياد. المحل غير مسئول عن ملاحظات الخدمة بعد
              مرور 24 ساعة من تسليم الملابس. - يبدأ تسليم الملابس للعميل بعد 5:00
              مساءً. الماركات العالمية لها عناية مميزة وأسعار خاصة - المحل غير مسئول
              عن فقدان المتعلقات الشخصية. المحل غير ملزم عن تخزين الملابس بعد مرور
              30 يوما من استلامها. - قيمة تعويض الملابس التالفة تكون بنسبة 25% من
              قيمتها شريطة تقديم الفاتورة الأصلية.
            </p>
          </div>
        </div>
      </section>

      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
          if (!o) resetNewCustomerForm();
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,720px)] max-w-lg overflow-y-auto"
          dir={rtl ? 'rtl' : 'ltr'}
        >
          <DialogHeader className="text-start">
            <DialogTitle>{t('pos.newCustomer.title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="pos-nn" className="text-start">
                {t('pos.newCustomer.name')}
              </Label>
              <Input
                id="pos-nn"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-background text-start"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-np" className="text-start">
                {t('pos.newCustomer.mobile')}
              </Label>
              <Input
                id="pos-np"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="bg-background text-start"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-np2" className="text-start">
                {t('pos.newCustomer.mobileSecondary')}
              </Label>
              <Input
                id="pos-np2"
                value={newPhone2}
                onChange={(e) => setNewPhone2(e.target.value)}
                className="bg-background text-start"
                inputMode="tel"
              />
            </div>
            <p className="pt-1 text-xs font-medium text-muted-foreground">
              {t('pos.newCustomer.addressSection')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pos-a1" className="text-start">
                  {t('pos.newCustomer.addressArea')}
                </Label>
                <Input
                  id="pos-a1"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pos-a2" className="text-start">
                  {t('pos.newCustomer.addressBlock')}
                </Label>
                <Input
                  id="pos-a2"
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a3" className="text-start">
                  {t('pos.newCustomer.addressStreet')}
                </Label>
                <Input
                  id="pos-a3"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a4" className="text-start">
                  {t('pos.newCustomer.addressAvenue')}
                </Label>
                <Input
                  id="pos-a4"
                  value={newAvenue}
                  onChange={(e) => setNewAvenue(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="pos-a5" className="text-start">
                  {t('pos.newCustomer.addressHouse')}
                </Label>
                <Input
                  id="pos-a5"
                  value={newHouse}
                  onChange={(e) => setNewHouse(e.target.value)}
                  className="bg-background text-start"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              {t('pos.newCustomer.cancel')}
            </Button>
            <Button
              type="button"
              disabled={savingCustomer}
              onClick={() => void saveNewCustomer()}
            >
              {savingCustomer ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : t('pos.newCustomer.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
