import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Baby,
  Bed,
  Briefcase,
  Circle,
  Crown,
  Droplets,
  Eye,
  Feather,
  Flower,
  Frame,
  Gem,
  GraduationCap,
  HardHat,
  Layers,
  Moon,
  Ruler,
  ShieldCheck,
  Shirt,
  Sparkles,
  Square,
  Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type CustomerBillingProfile,
  type CustomerSearchRow,
  getOperatingStatus,
  type LaundryPriceListItemRow,
  type OperatingStatusPayload,
  type OrderRow,
  type PosCheckoutBundleResponse,
  type PosCheckoutResponse,
  type PosPaymentMethod,
  apiJson,
  ApiError,
  getPublicPaymentStatus,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import type { PriceListBridge } from '@/modules/shared/hooks/use-price-list';
import {
  computeMultiInvoiceParts,
  computeSessionTotals,
  DELIVERY_FEE_KD,
  DELIVERY_LINE_LABEL_AR,
  VIP_LINE_LABEL_AR,
  VIP_SURCHARGE_KD,
  sumLinesKd,
} from '@/utils/finance-engine';

export type CartLine = {
  lineKey: string;
  laundryId: string;
  code: string;
  nameAr: string;
  serviceKey: 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS';
  serviceLabel: string;
  neshaLevel: '100%' | '50%' | '25%' | '0%';
  foldingStyle: string;
  itemNote: string;
  unitPrice: number;
  quantity: number;
};

export type ReceiptSnapshot = {
  orderId: string;
  branchLabel: string;
  orderNumber: string;
  createdAt: string;
  employeeName: string;
  employeeId: string;
  customerName: string;
  customerMobile: string;
  customerBalance: string;
  /**
   * V19.4 — CC pack #7 ("المديونية في الفاتورة للعميل").
   *
   * Outstanding debt on the customer's wallet AFTER this checkout has
   * been applied. Captured at the same moment we refresh
   * `customerBalance` from `/api/pos/customers/:id/billing`. The print
   * template hides this line when the string parses to zero (or NaN)
   * so existing zero-debt receipts keep the old layout.
   *
   * Stored as a string (same format as `customerBalance`) to preserve
   * the server's decimal precision; the UI parses with parseFloat when
   * it needs to decide whether to render.
   */
  customerDebt: string;
  customerAddress: string;
  serviceType: string;
  /** Sum of line items before delivery (last completed order on receipt). */
  lineItemsSubtotal: number;
  deliveryFee: number;
  freeDelivery: boolean;
  lines: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    neshaLevel: '100%' | '50%' | '25%' | '0%';
    foldingStyle: string;
    itemNote: string;
  }>;
  total: number;
  paymentLabel?: string;
  /** True when order awaits gateway (PAYMENT_LINK path). */
  paymentPending?: boolean;
  /** Attached invoice: always show delivery line as 0.000 KWD on the receipt. */
  attachedInvoice?: boolean;
};

export function garmentTagCount(qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(50, Math.max(1, Math.round(n)));
}


export type PosSubOrder = {
  id: string;
  kind: 'primary' | 'attached';
  lines: CartLine[];
  /**
   * Optional VIP surcharge toggle (+1.000 KWD). Staff flips it per-invoice
   * from the POS UI; it only bills on checkout when the sub-order has at
   * least one garment line (VIP on an empty tab is a no-op).
   */
  vipEnabled?: boolean;
};

export type ServiceOption = {
  key: 'NORMAL' | 'URGENT' | 'PRESS_ONLY' | 'URGENT_PRESS';
  labelAr: string;
  price: number;
  available: boolean;
};

/**
 * V6.8 — Minimalist line-art icon mapping for every base item in the Master
 * tariff. Each of the 39 seed codes gets a dedicated Lucide icon + tinted
 * tone so staff (especially drivers and new trainees) can scan the POS grid
 * visually instead of reading Arabic labels. Keys mirror
 * `src/bootstrap/laundry-price-list.seed.ts` ROWS exactly — do not rename a key here
 * without updating the seed in the same commit.
 *
 * Services (VIP_SERVICE, DELIVERY_INSIDE_AREA) intentionally have no entry
 * because they are not rendered in the item grid — they are injected in the
 * footer via `finance-engine.ts`.
 */
const POS_VISUAL: Record<string, { Icon: LucideIcon; tone: string }> = {
  // MENS — 8
  DISHDASHA_ORD: { Icon: Shirt, tone: 'bg-violet-100 text-primary' },
  DISHDASHA_WOOL: { Icon: Shirt, tone: 'bg-slate-200 text-primary' },
  SUIT_FULL: { Icon: Briefcase, tone: 'bg-stone-200 text-primary' },
  MILITARY_SUIT_2PC: { Icon: ShieldCheck, tone: 'bg-emerald-100 text-primary' },
  SHIRT: { Icon: Shirt, tone: 'bg-sky-100 text-primary' },
  TROUSERS: { Icon: Ruler, tone: 'bg-blue-100 text-primary' },
  GOTRA: { Icon: Wind, tone: 'bg-amber-100 text-primary' },
  GOTRA_WHITE: { Icon: Wind, tone: 'bg-zinc-100 text-primary' },

  // JACKETS_BISHT — 5
  OVER_COAT: { Icon: Shirt, tone: 'bg-zinc-200 text-primary' },
  JACKET: { Icon: Shirt, tone: 'bg-rose-100 text-primary' },
  JACKET_SNAP_ON: { Icon: Shirt, tone: 'bg-orange-100 text-primary' },
  BISHT_OCCASION: { Icon: Crown, tone: 'bg-amber-100 text-primary' },
  BISHT_DANDER: { Icon: Crown, tone: 'bg-rose-100 text-primary' },

  // LADIES — 10
  ABAYA: { Icon: Moon, tone: 'bg-indigo-100 text-primary' },
  CRYSTAL_ABAYA: { Icon: Gem, tone: 'bg-purple-100 text-primary' },
  SHEILA: { Icon: Feather, tone: 'bg-pink-100 text-primary' },
  SHAWL: { Icon: Wind, tone: 'bg-fuchsia-100 text-primary' },
  SCARVES: { Icon: Flower, tone: 'bg-rose-100 text-primary' },
  NIQAB: { Icon: Eye, tone: 'bg-neutral-200 text-primary' },
  SKIRT: { Icon: Ruler, tone: 'bg-pink-100 text-primary' },
  BLOUSE: { Icon: Shirt, tone: 'bg-pink-100 text-primary' },
  GOWN: { Icon: Shirt, tone: 'bg-purple-100 text-primary' },
  LADIES_DRESS: { Icon: Sparkles, tone: 'bg-pink-100 text-primary' },

  // HOUSEHOLD — 10
  FITTED_SHEET: { Icon: Bed, tone: 'bg-teal-100 text-primary' },
  BLANKET_ALL: { Icon: Bed, tone: 'bg-cyan-100 text-primary' },
  COVER_DEBAJ: { Icon: Layers, tone: 'bg-emerald-100 text-primary' },
  HOTEL_MATTRESS: { Icon: Bed, tone: 'bg-amber-100 text-primary' },
  SLIP: { Icon: Shirt, tone: 'bg-sky-100 text-primary' },
  PILLOW: { Icon: Circle, tone: 'bg-neutral-100 text-primary' },
  LIGHT_SHEET: { Icon: Feather, tone: 'bg-teal-100 text-primary' },
  BATH_SHEET: { Icon: Droplets, tone: 'bg-sky-100 text-primary' },
  PILLOW_CASE: { Icon: Square, tone: 'bg-neutral-100 text-primary' },
  PARDA: { Icon: Frame, tone: 'bg-stone-200 text-primary' },

  // MISC — 6
  INSIDE_CLOTHES: { Icon: Shirt, tone: 'bg-slate-100 text-primary' },
  SYRUP: { Icon: Droplets, tone: 'bg-green-100 text-primary' },
  TAQIYA: { Icon: HardHat, tone: 'bg-neutral-200 text-primary' },
  KABB: { Icon: GraduationCap, tone: 'bg-stone-200 text-primary' },
  PYJAMA: { Icon: Moon, tone: 'bg-indigo-100 text-primary' },
  BABY_CLOTHES: { Icon: Baby, tone: 'bg-pink-100 text-primary' },
};

export function defaultVisual(code: string): { Icon: LucideIcon; tone: string } {
  return (
    POS_VISUAL[code] ?? {
      Icon: Sparkles,
      tone: 'bg-slate-100 text-primary',
    }
  );
}

export function basePriceKd(item: LaundryPriceListItemRow): number {
  return Number.parseFloat(item.priceNormal);
}

export function serviceOptionsForItem(item: LaundryPriceListItemRow): ServiceOption[] {
  const normal = Number.parseFloat(item.priceNormal);
  const urgent = Number.parseFloat(item.priceUrgent);
  const press = item.pricePressOnly ? Number.parseFloat(item.pricePressOnly) : NaN;
  const urgentPress = item.priceUrgentPress ?
      Number.parseFloat(item.priceUrgentPress)
    : NaN;

  return [
    {
      key: 'NORMAL',
      labelAr: 'غسيل عادي',
      price: normal,
      available: Number.isFinite(normal),
    },
    {
      key: 'URGENT',
      labelAr: 'خدمة سريعة',
      price: urgent,
      available: Number.isFinite(urgent),
    },
    {
      key: 'PRESS_ONLY',
      labelAr: 'كي فقط',
      price: press,
      available: Number.isFinite(press),
    },
    {
      key: 'URGENT_PRESS',
      labelAr: 'دراي كلين سريع',
      price: urgentPress,
      available: Number.isFinite(urgentPress),
    },
  ];
}


export type PosEngineVariant = 'driver' | 'branch';

export type PosEngineOptions =
  | { variant: 'branch'; priceList: PriceListBridge }
  | {
      variant: 'driver';
      operating: OperatingStatusPayload | null;
      setOperating: Dispatch<SetStateAction<OperatingStatusPayload | null>>;
      priceList: PriceListBridge;
    };

function noopOperating(_: SetStateAction<OperatingStatusPayload | null>) {}

export function usePosEngine(opts: PosEngineOptions) {
  const variant = opts.variant;
  const operating = variant === 'driver' ? opts.operating : null;
  const setOperating =
    variant === 'driver' ? opts.setOperating : noopOperating;

  const priceList = opts.priceList;
  const catalogItems = priceList.items;
  const catalogLoading = priceList.loading;
  const catalogFailed = priceList.failed;
  const loadCatalog = priceList.reload;

  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dateLocale = useAppLocale();
  const { token, user, logout } = useAuth();
  const [subOrders, setSubOrders] = useState<PosSubOrder[]>([
    { id: crypto.randomUUID(), kind: 'primary', lines: [] },
  ]);
  const [activeSubOrderIndex, setActiveSubOrderIndex] = useState(0);
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
  /** Synchronous re-entry guard — `checkoutBusy` alone loses double-clicks before React re-renders. */
  const checkoutInFlightRef = useRef(false);
  const [receiptSheets, setReceiptSheets] = useState<ReceiptSnapshot[] | null>(
    null,
  );
  /**
   * V1.7.2 — live poll for hosted-link payments. After POS prints the
   * receipt with a pending payment, we poll `GET /api/payments/status/:orderId`
   * every 5s until the gateway callback settles the order. On settle we
   * flip the receipt banner to «مدفوع ✅» and refresh the billing profile
   * so the cashier sees wallet/debt update without reloading the page.
   */
  const pendingPayOrderIdsRef = useRef<Set<string>>(new Set());
  const pendingPayTimerRef = useRef<number | null>(null);
  const [scanOrderDetail, setScanOrderDetail] = useState<OrderRow | null>(null);
  const [scanOrderDialogOpen, setScanOrderDialogOpen] = useState(false);
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
  const [serviceNeshaLevel, setServiceNeshaLevel] = useState<'100%' | '50%' | '25%' | '0%'>(
    '0%',
  );
  const [serviceStyle, setServiceStyle] = useState<'SEEDA' | 'MIRZAAM' | 'MURABAA' | ''>('');
  const [servicePackaging, setServicePackaging] = useState<'SHARSHAF' | 'TASFEET' | ''>('');
  const [serviceItemNote, setServiceItemNote] = useState('');
  const [serviceManualUnitPrice, setServiceManualUnitPrice] = useState('');
  const [billing, setBilling] = useState<CustomerBillingProfile | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [posPaymentMethod, setPosPaymentMethod] = useState<
    'CASH' | 'KNET' | 'PAYMENT_LINK' | 'DEBT_ON_ACCOUNT'
  >('CASH');

  useEffect(() => {
    const clearPrintMode = () => {
      document.body.classList.remove('print-tags-mode');
    };
    window.addEventListener('afterprint', clearPrintMode);
    return () => window.removeEventListener('afterprint', clearPrintMode);
  }, []);

  useEffect(() => {
    setSubOrders([{ id: crypto.randomUUID(), kind: 'primary', lines: [] }]);
    setActiveSubOrderIndex(0);
  }, [selected?.id]);

  /** SafariStream / POS constitution: customer search is debounced and non-blocking (payment UI stays live). */
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

  const cart = subOrders[activeSubOrderIndex]?.lines ?? [];

  const combinedLineSubtotal = useMemo(
    () => subOrders.reduce((s, o) => s + sumLinesKd(o.lines), 0),
    [subOrders],
  );

  const balanceNum = billing
    ? Number.parseFloat(billing.remainingBalance)
    : NaN;
  const debtNum = billing ? Number.parseFloat(billing.debt) : NaN;
  /** Hide low-balance alert for walk-ins (0 balance, no subscription); show for debt or active subscription with low/exhausted balance. */
  const isBalanceWarning = (() => {
    if (!billing || !Number.isFinite(balanceNum)) return false;
    const balanceZero = Math.abs(balanceNum) < 1e-6;
    const subActive = billing.subscriptionActive === true;
    if (balanceZero && !subActive) return false;
    if (balanceNum < -1e-9) return true;
    if (subActive && balanceNum < 10 - 1e-9) return true;
    return false;
  })();

  const financeTotals = useMemo(
    () =>
      computeSessionTotals(
        subOrders.map((o) => ({
          lines: o.lines.map((l) => ({
            label: l.nameAr,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            neshaLevel: l.neshaLevel,
            foldingStyle: l.foldingStyle,
            itemNote: l.itemNote,
          })),
          vipEnabled: o.vipEnabled ?? false,
        })),
        billing,
      ),
    [subOrders, billing],
  );
  const grandTotal = financeTotals.grandTotal;

  /** If billing is unknown, assume shortfall until server confirms — always send external method when grand total > 0. */
  const needsExternalPayment =
    grandTotal > 0 &&
    (billing === null ||
      !Number.isFinite(balanceNum) ||
      balanceNum + 1e-9 < grandTotal);

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
    setServiceNeshaLevel('0%');
    setServiceStyle('');
    setServicePackaging('');
    setServiceItemNote('');
    setServiceManualUnitPrice('');
    setServiceOpen(true);
  }

  function setQty(lineKey: string, qty: number) {
    setSubOrders((prev) => {
      const next = [...prev];
      const i = activeSubOrderIndex;
      if (!next[i]) return prev;
      const lines = next[i].lines;
      const newLines =
        qty < 1 ?
          lines.filter((x) => x.lineKey !== lineKey)
        : lines.map((x) =>
            x.lineKey === lineKey ? { ...x, quantity: qty } : x,
          );
      next[i] = { ...next[i], lines: newLines };
      return next;
    });
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
      toast.error(t('pos.serviceModal.selectAtLeastOne'));
      return;
    }

    const parseManualKwd = (raw: string) => {
      const n = Number.parseFloat(String(raw).replace(/,/g, '').trim());
      return n;
    };
    const manualEntryItem = serviceItem.manualEntry === true;
    const needsManual =
      manualEntryItem ||
      selectedLines.some((l) => l.option.price <= 0);
    const manualParsed = parseManualKwd(serviceManualUnitPrice);
    if (needsManual) {
      if (!Number.isFinite(manualParsed) || manualParsed <= 0) {
        toast.error(t('pos.serviceModal.manualPriceInvalid'));
        return;
      }
    }

    const isRedZoneItem = /GHUTRA|SHEMAGH/i.test(serviceItem.code);
    const foldingStyle = isRedZoneItem ?
      [serviceStyle, servicePackaging].filter(Boolean).join(' / ')
    : '';
    const extrasLabel = isRedZoneItem ?
        `${serviceNeshaLevel !== '0%' ? ` + NESHA ${serviceNeshaLevel}` : ''}${serviceStyle ? ` + ${serviceStyle}` : ''}${servicePackaging ? ` + ${servicePackaging}` : ''}`
      : '';
    setSubOrders((prev) => {
      const orders = [...prev];
      const i = activeSubOrderIndex;
      if (!orders[i]) return prev;
      const next = [...orders[i].lines];
      for (const line of selectedLines) {
        const lineKey =
          `${serviceItem.id}:${line.option.key}:${isRedZoneItem ? serviceNeshaLevel : '0%'}:${foldingStyle}:${serviceItemNote.trim()}`;
        const existingIndex = next.findIndex((x) => x.lineKey === lineKey);
        const displayName =
          `${serviceItem.nameAr} - ${line.option.labelAr}${extrasLabel}`;

        const unitPrice =
          manualEntryItem || line.option.price <= 0 ?
            manualParsed
          : line.option.price;

        if (existingIndex === -1) {
          next.push({
            lineKey,
            laundryId: serviceItem.id,
            code: serviceItem.code,
            nameAr: displayName,
            serviceKey: line.option.key,
            serviceLabel: line.option.labelAr,
            neshaLevel: isRedZoneItem ? serviceNeshaLevel : '0%',
            foldingStyle,
            itemNote: serviceItemNote.trim(),
            unitPrice,
            quantity: line.quantity,
          });
        } else {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + line.quantity,
          };
        }
      }
      orders[i] = { ...orders[i], lines: next };
      return orders;
    });
    setServiceOpen(false);
    toast.success(t('pos.serviceModal.addedToCart'));
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
      const phone2T = newPhone2.replace(/[\s-]/g, '').trim();
      const payload: Record<string, string> = {
        displayName: name,
        phone,
        addressArea: String(newArea ?? '').trim(),
        addressBlock: String(newBlock ?? '').trim(),
        addressStreet: String(newStreet ?? '').trim(),
        addressAvenue: String(newAvenue ?? '').trim(),
        addressHouse: String(newHouse ?? '').trim(),
      };
      if (phone2T.length >= 8) payload.phone2 = phone2T;

      const row = await apiJson<CustomerSearchRow>('/api/pos/customers', {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      });
      if (!row || typeof row.id !== 'string' || row.id.length === 0) {
        toast.error(t('errors.unexpected'));
        return;
      }
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

  function addAttachedOrder() {
    setSubOrders((prev) => {
      const next = [
        ...prev,
        { id: crypto.randomUUID(), kind: 'attached' as const, lines: [] },
      ];
      setActiveSubOrderIndex(next.length - 1);
      return next;
    });
  }

  /**
   * Toggle the optional VIP surcharge (+1.000 KWD) for a specific sub-order.
   * Passing `next` forces the value; omitting it flips the current state.
   * VIP lives at the sub-order level (not the session) so a customer can pick
   * VIP only for one of several invoices in the same collection trip.
   */
  function setVipForSubOrder(index: number, next?: boolean) {
    setSubOrders((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const target = prev[index];
      const resolved = typeof next === 'boolean' ? next : !target.vipEnabled;
      if ((target.vipEnabled ?? false) === resolved) return prev;
      const copy = [...prev];
      copy[index] = { ...target, vipEnabled: resolved };
      return copy;
    });
  }

  async function completePayment() {
    if (!token || !user) return;
    if (!selected) {
      toast.error(t('pos.checkout.pickCustomer'));
      return;
    }
    const nonEmptyOrdered = subOrders.filter((o) => o.lines.length > 0);
    if (nonEmptyOrdered.length === 0) {
      toast.error(t('pos.checkout.emptyCart'));
      return;
    }
    if (checkoutInFlightRef.current) {
      return;
    }
    checkoutInFlightRef.current = true;
    setCheckoutBusy(true);
    const phone = selected.phone.replace(/[\s-]/g, '').trim();

    const customerAddressStr =
      [
        selected.addressArea,
        selected.addressBlock,
        selected.addressStreet,
        selected.addressAvenue,
        selected.addressHouse,
      ]
        .filter(Boolean)
        .join(' · ') || selected.address || '-';

    type ReceiptSheetExtras = Pick<
      ReceiptSnapshot,
      | 'serviceType'
      | 'lineItemsSubtotal'
      | 'deliveryFee'
      | 'freeDelivery'
      | 'lines'
      | 'total'
      | 'paymentLabel'
      | 'paymentPending'
      | 'attachedInvoice'
    >;

    const buildSheetBase = (
      created: PosCheckoutResponse,
      balanceAfter: string,
      debtAfter: string,
      extras: ReceiptSheetExtras,
    ): ReceiptSnapshot => ({
      orderId: created.id,
      /**
       * Human-facing INV#: owner serial (A-3) → paper invoice # → last-resort
       * short id (8 hex), **not** the full uuid — the full `orderId` is printed
       * only on the "سيريال كود" line so the two lines are never identical.
       * Mirrors `docNumber` in `invoice-print-page.tsx`.
       */
      orderNumber:
        created.serialNumber?.trim() ||
        created.invoiceNumber?.trim() ||
        (created.id ? created.id.slice(0, 8).toUpperCase() : '') ||
        '-',
      createdAt: created.createdAt || new Date().toISOString(),
      branchLabel: t('pos.branchLabelFallback'),
      employeeName: user.fullName || user.username,
      employeeId: user.username,
      customerName: selected.displayName?.trim() || t('pos.receiptWalkIn'),
      customerMobile: selected.phone,
      customerBalance: balanceAfter,
      customerDebt: debtAfter,
      customerAddress: customerAddressStr,
      ...extras,
    });

    try {
      const bundlePrep = computeMultiInvoiceParts(
        nonEmptyOrdered.map((o) => ({
          lines: o.lines.map((l) => ({
            label: l.nameAr,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            neshaLevel: l.neshaLevel,
            foldingStyle: l.foldingStyle,
            itemNote: l.itemNote,
          })),
          vipEnabled: o.vipEnabled ?? false,
        })),
        billing,
      );
      const useBundle =
        variant !== 'driver' &&
        nonEmptyOrdered.length > 1 &&
        posPaymentMethod === 'PAYMENT_LINK' &&
        bundlePrep.allNeedExternal;

      if (useBundle) {
        const { parts, ordersPayload } = bundlePrep;
        const bundleRes = await apiJson<PosCheckoutBundleResponse>(
          '/api/pos/checkout-bundle',
          {
            method: 'POST',
            token,
            body: JSON.stringify({
              customerPhone: phone,
              customerId: selected.id,
              customerDisplayName: selected.displayName ?? undefined,
              customerAddress: customerAddressStr !== '-' ? customerAddressStr : undefined,
              serviceType: 'NORMAL',
              orders: ordersPayload,
            }),
          },
        );

        let balanceAfter = selected.wallet?.balance ?? '0.0000';
        // V19.4 — CC pack #7. Mirror the same stale→fresh refresh
        // pattern we use for `balanceAfter` so the printed receipt
        // shows the debt AFTER this bundle has been applied, not the
        // pre-checkout value.
        let debtAfter = selected.wallet?.debt ?? '0.0000';
        try {
          const fresh = await apiJson<CustomerBillingProfile>(
            `/api/pos/customers/${selected.id}/billing`,
            { token },
          );
          balanceAfter = fresh.remainingBalance;
          debtAfter = fresh.debt;
          setBilling(fresh);
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

        const paymentLinkUrl = bundleRes.paymentLink?.url?.trim();

        const sheets: ReceiptSnapshot[] = parts.map((part, k) => {
          const ord = bundleRes.orders[k];
          const attached = k > 0;
          return buildSheetBase(ord, balanceAfter, debtAfter, {
            serviceType: 'NORMAL',
            lineItemsSubtotal: part.lineSum,
            deliveryFee: attached ? 0 : part.deliveryForOrder,
            freeDelivery: attached ? false : part.deliveryForOrder <= 0,
            attachedInvoice: attached,
            lines: part.receiptLines,
            total: part.netTotal,
            paymentLabel: t('pos.payment.online'),
            paymentPending: Boolean(paymentLinkUrl),
          });
        });
        setReceiptSheets(sheets);

        toast.success(t('pos.checkout.paymentLinkCreated'));
        if (paymentLinkUrl) {
          trackPendingPaymentSettlement(bundleRes.orders.map((o) => o.id));
        }
        setSubOrders([{ id: crypto.randomUUID(), kind: 'primary', lines: [] }]);
        setActiveSubOrderIndex(0);
        window.setTimeout(() => {
          window.print();
        }, 120);
        return;
      }

      let billingSnapshot: CustomerBillingProfile | null = billing;
      let balanceAfter = selected.wallet?.balance ?? '0.0000';
      // V19.4 — CC pack #7. Track debt alongside balance so each sheet
      // in a multi-sub-order checkout can show the live debt value.
      let debtAfter =
        billingSnapshot?.debt ?? selected.wallet?.debt ?? '0.0000';
      const sheets: ReceiptSnapshot[] = [];
      let sawPaymentLink = false;
      const pendingLinkOrderIds: string[] = [];

      for (let k = 0; k < nonEmptyOrdered.length; k++) {
        const o = nonEmptyOrdered[k];
        const lineSum = sumLinesKd(o.lines);
        const isFirst = k === 0;
        const bal = billingSnapshot
          ? Number.parseFloat(billingSnapshot.remainingBalance)
          : NaN;
        const walletCoversLinesOnly =
          Number.isFinite(bal) && bal + 1e-9 >= lineSum;
        // Collection-trip delivery rule:
        //   k === 0 → 0.250 KWD (subject to subscription waiver)
        //   k > 0  → 0.000 KWD free-tier row
        const baseDel = isFirst ? DELIVERY_FEE_KD : 0;
        const deliveryForOrder =
          walletCoversLinesOnly && lineSum > 0 ? 0 : baseDel;
        const vipSurcharge =
          o.vipEnabled && lineSum > 0 ? VIP_SURCHARGE_KD : 0;
        const netTotal = lineSum + deliveryForOrder + vipSurcharge;
        const needsExt =
          netTotal > 0 &&
          (billingSnapshot === null ||
            !Number.isFinite(bal) ||
            bal + 1e-9 < netTotal);
        const checkoutPayMethod = posPaymentMethod;
        const extMethod: PosPaymentMethod | undefined = needsExt
          ? checkoutPayMethod
          : undefined;

        // Garment lines first, service rows after — keeps the Arabic receipt
        // reading naturally. Always emit the delivery row (even at 0.000) so
        // the backend `OrderLineItem` table has a uniform trip-fee trail.
        const garmentLines = o.lines.map((c) => ({
          label: c.nameAr,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
        }));
        const serviceLines: Array<{
          label: string;
          quantity: number;
          unitPrice: number;
        }> = [];
        if (vipSurcharge > 0) {
          serviceLines.push({
            label: VIP_LINE_LABEL_AR,
            quantity: 1,
            unitPrice: VIP_SURCHARGE_KD,
          });
        }
        serviceLines.push({
          label: DELIVERY_LINE_LABEL_AR,
          quantity: 1,
          unitPrice: deliveryForOrder,
        });
        const lineItemsPayload = [...garmentLines, ...serviceLines];

        const created = await apiJson<PosCheckoutResponse>(
          '/api/pos/checkout',
          {
            method: 'POST',
            token,
            body: JSON.stringify({
              customerPhone: phone,
              customerId: selected.id,
              customerDisplayName: selected.displayName ?? undefined,
              totalPrice: netTotal,
              lineItems: lineItemsPayload,
              serviceType: 'NORMAL',
              ...(extMethod ? { posPaymentMethod: extMethod } : {}),
            }),
          },
        );

        const receiptLines = o.lines.map((c) => ({
          label: c.nameAr,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          lineTotal: c.quantity * c.unitPrice,
          neshaLevel: c.neshaLevel,
          foldingStyle: c.foldingStyle,
          itemNote: c.itemNote,
        }));

        const paymentLabelForOrder =
          needsExt ?
            posPaymentMethod === 'PAYMENT_LINK' ?
              t('pos.payment.online')
            : posPaymentMethod === 'DEBT_ON_ACCOUNT' ?
              t('pos.payment.debt')
            : t(`pos.pay.${posPaymentMethod}` as const)
          : t('pos.pay.SUBSCRIPTION_WALLET');

        const attachedInvoice = nonEmptyOrdered.length > 1 && k > 0;
        const paymentLinkUrl = created.paymentLink?.url?.trim();
        if (paymentLinkUrl && checkoutPayMethod === 'PAYMENT_LINK') {
          sawPaymentLink = true;
          if (created.id) {
            pendingLinkOrderIds.push(created.id);
          }
        }

        sheets.push(
          buildSheetBase(created, balanceAfter, debtAfter, {
            serviceType: 'NORMAL',
            lineItemsSubtotal: lineSum,
            deliveryFee: attachedInvoice ? 0 : deliveryForOrder,
            freeDelivery: attachedInvoice ? false : deliveryForOrder <= 0,
            attachedInvoice,
            lines: receiptLines,
            total: netTotal,
            paymentLabel: paymentLabelForOrder,
            paymentPending: Boolean(paymentLinkUrl),
          }),
        );

        try {
          const fresh = await apiJson<CustomerBillingProfile>(
            `/api/pos/customers/${selected.id}/billing`,
            { token },
          );
          billingSnapshot = fresh;
          balanceAfter = fresh.remainingBalance;
          debtAfter = fresh.debt;
          setBilling(fresh);
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
      }

      if (sheets.length === 0) return;

      const finalBal = balanceAfter;
      const finalDebt = debtAfter;
      setReceiptSheets(
        sheets.map((s) => ({
          ...s,
          customerBalance: finalBal,
          customerDebt: finalDebt,
        })),
      );

      if (sawPaymentLink) {
        toast.success(t('pos.checkout.paymentLinkCreated'));
        trackPendingPaymentSettlement(pendingLinkOrderIds);
      } else if (nonEmptyOrdered.length > 1) {
        toast.success(
          t('pos.checkout.doneMulti', { count: nonEmptyOrdered.length }),
        );
      } else {
        toast.success(t('pos.checkout.done'));
      }
      setSubOrders([{ id: crypto.randomUUID(), kind: 'primary', lines: [] }]);
      setActiveSubOrderIndex(0);
      window.setTimeout(() => {
        window.print();
      }, 120);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errorCode === 'SYSTEM_CLOSED') {
          toast.error(e.message);
          void getOperatingStatus().then(setOperating);
        } else {
          toast.error(e.message);
        }
      }
    } finally {
      checkoutInFlightRef.current = false;
      setCheckoutBusy(false);
    }
  }

  const refreshSelectedCustomerBilling = useCallback(async () => {
    if (!selected?.id) {
      return;
    }
    try {
      const fresh = await apiJson<CustomerBillingProfile>(
        `/api/pos/customers/${selected.id}/billing`,
        { token },
      );
      setBilling(fresh);
      setSelected((prev) =>
        prev && prev.id === selected.id
          ? {
              ...prev,
              wallet: {
                balance: fresh.remainingBalance,
                debt: fresh.debt,
              },
            }
          : prev,
      );
    } catch {
      /* ignore — next interaction refetches */
    }
  }, [selected?.id, token]);

  const trackPendingPaymentSettlement = useCallback(
    (orderIds: string[]) => {
      const keep = orderIds.filter(Boolean);
      if (keep.length === 0) return;
      for (const id of keep) pendingPayOrderIdsRef.current.add(id);
      if (pendingPayTimerRef.current != null) return;
      const stopAt = Date.now() + 15 * 60_000;
      const tick = async () => {
        if (pendingPayOrderIdsRef.current.size === 0) {
          if (pendingPayTimerRef.current != null) {
            window.clearInterval(pendingPayTimerRef.current);
            pendingPayTimerRef.current = null;
          }
          return;
        }
        const snapshot = [...pendingPayOrderIdsRef.current];
        let anySettled = false;
        await Promise.all(
          snapshot.map(async (orderId) => {
            try {
              const status = await getPublicPaymentStatus(orderId);
              if (status.isPaid) {
                pendingPayOrderIdsRef.current.delete(orderId);
                anySettled = true;
                setReceiptSheets((prev) =>
                  prev
                    ? prev.map((s) =>
                        s.orderId === orderId
                          ? { ...s, paymentPending: false }
                          : s,
                      )
                    : prev,
                );
              }
            } catch {
              /* transient — retry next tick */
            }
          }),
        );
        if (anySettled) {
          toast.success(t('pos.checkout.paymentSettled'));
          void refreshSelectedCustomerBilling();
        }
        if (Date.now() > stopAt) {
          pendingPayOrderIdsRef.current.clear();
          if (pendingPayTimerRef.current != null) {
            window.clearInterval(pendingPayTimerRef.current);
            pendingPayTimerRef.current = null;
          }
        }
      };
      pendingPayTimerRef.current = window.setInterval(() => {
        void tick();
      }, 5000);
      void tick();
    },
    [refreshSelectedCustomerBilling, t],
  );

  useEffect(() => {
    return () => {
      if (pendingPayTimerRef.current != null) {
        window.clearInterval(pendingPayTimerRef.current);
        pendingPayTimerRef.current = null;
      }
      pendingPayOrderIdsRef.current.clear();
    };
  }, []);

  function handlePrintReceipt() {
    if (!receiptSheets?.length) {
      toast.error('No receipt ready to print yet.');
      return;
    }
    document.body.classList.remove('print-tags-mode');
    window.print();
  }

  function handlePrintGarmentTags() {
    if (!receiptSheets?.some((s) => s.orderId)) {
      toast.error('No receipt ready to print yet.');
      return;
    }
    document.body.classList.add('print-tags-mode');
    window.print();
  }

  function signOut() {
    logout();
    navigate('/login', { replace: true });
  }

  const rtl = i18n.language.startsWith('ar');

  return {
    variant,
    operating,
    setOperating,
    rtl,
    dateLocale,
    t,
    i18n,
    navigate,
    token,
    user,
    logout,
    catalogItems,
    catalogLoading,
    catalogFailed,
    subOrders,
    setSubOrders,
    activeSubOrderIndex,
    setActiveSubOrderIndex,
    searchQ,
    setSearchQ,
    searchHits,
    setSearchHits,
    searching,
    selected,
    setSelected,
    newOpen,
    setNewOpen,
    newName,
    setNewName,
    newPhone,
    setNewPhone,
    newPhone2,
    setNewPhone2,
    newArea,
    setNewArea,
    newBlock,
    setNewBlock,
    newStreet,
    setNewStreet,
    newAvenue,
    setNewAvenue,
    newHouse,
    setNewHouse,
    savingCustomer,
    setSavingCustomer,
    checkoutBusy,
    receiptSheets,
    setReceiptSheets,
    scanOrderDetail,
    setScanOrderDetail,
    scanOrderDialogOpen,
    setScanOrderDialogOpen,
    serviceOpen,
    setServiceOpen,
    serviceItem,
    setServiceItem,
    serviceQty,
    setServiceQty,
    serviceNeshaLevel,
    setServiceNeshaLevel,
    serviceStyle,
    setServiceStyle,
    servicePackaging,
    setServicePackaging,
    serviceItemNote,
    setServiceItemNote,
    serviceManualUnitPrice,
    setServiceManualUnitPrice,
    billing,
    setBilling,
    billingLoading,
    posPaymentMethod,
    setPosPaymentMethod,
    loadCatalog,
    cart,
    combinedLineSubtotal,
    balanceNum,
    debtNum,
    isBalanceWarning,
    firstFilledSubOrderIndex: financeTotals.firstFilledSubOrderIndex,
    isSubscriptionOrder: financeTotals.isSubscriptionOrder,
    sessionDeliveryCharge: financeTotals.sessionDeliveryCharge,
    combinedVipSurcharge: financeTotals.combinedVipSurcharge,
    grandTotal: financeTotals.grandTotal,
    needsExternalPayment,
    kwdSuffix,
    formatKwdParts,
    openServiceModal,
    setQty,
    changeServiceQty,
    addServiceSelectionToCart,
    resetNewCustomerForm,
    saveNewCustomer,
    addAttachedOrder,
    setVipForSubOrder,
    completePayment,
    handlePrintReceipt,
    handlePrintGarmentTags,
    signOut,
    defaultVisual,
    basePriceKd,
    serviceOptionsForItem,
    garmentTagCount,
  };
}

export type PosEngineApi = ReturnType<typeof usePosEngine>;
