import fs from 'node:fs';
const typesRaw = fs.readFileSync('src/modules/shared/hooks/_pos-types.txt', 'utf8');
const types =
  typesRaw
    .replace(/^type CartLine/gm, 'export type CartLine')
    .replace(/^type ReceiptSnapshot/gm, 'export type ReceiptSnapshot')
    .replace(/^type PosSubOrder/gm, 'export type PosSubOrder')
    .replace(/^type ServiceOption/gm, 'export type ServiceOption');

let inner = fs.readFileSync('src/modules/shared/hooks/_pos-inner.txt', 'utf8');
inner = inner.replace(
  /  const \[posPaymentMethod, setPosPaymentMethod\] = useState<\n    'CASH' \| 'KNET' \| 'PAYMENT_LINK' \| 'DEBT_ON_ACCOUNT'\n  >\('CASH'\);\n  const \[operating, setOperating\] = useState<OperatingStatusPayload \| null>\(\n    null,\n  \);\n\n  useEffect\(\(\) => \{\n    if \(user\?\.safariRole !== 'DRIVER'\) return;[\s\S]*?\}, \[user\?\.safariRole, token\]\);\n\n/,
  `  const [posPaymentMethod, setPosPaymentMethod] = useState<
    'CASH' | 'KNET' | 'PAYMENT_LINK' | 'DEBT_ON_ACCOUNT'
  >('CASH');

  useEffect(() => {
    if (variant !== 'driver') return;
    setPosPaymentMethod('CASH');
  }, [variant]);

`,
);

inner = inner.replace(
  /      const useBundle =\n        nonEmptyOrdered\.length > 1 &&\n        posPaymentMethod === 'PAYMENT_LINK' &&\n        bundlePrep\.allNeedExternal;/,
  `      const useBundle =
        variant !== 'driver' &&
        nonEmptyOrdered.length > 1 &&
        posPaymentMethod === 'PAYMENT_LINK' &&
        bundlePrep.allNeedExternal;`,
);

inner = inner.replace(
  /        const extMethod: PosPaymentMethod \| undefined = needsExt\n          \? posPaymentMethod\n          : undefined;/,
  `        const checkoutPayMethod = variant === 'driver' ? 'CASH' : posPaymentMethod;
        const extMethod: PosPaymentMethod | undefined = needsExt
          ? checkoutPayMethod
          : undefined;`,
);

inner = inner.replace(
  /        const paymentLabelForOrder =\n          needsExt \?\n            posPaymentMethod === 'PAYMENT_LINK' \?\n              t\('pos\.payment\.online'\)\n            : posPaymentMethod === 'DEBT_ON_ACCOUNT' \?\n              t\('pos\.payment\.debt'\)\n            : t\(`pos\.pay\.\$\{posPaymentMethod\}` as const\)/,
  `        const paymentLabelForOrder =
          needsExt ?
            checkoutPayMethod === 'PAYMENT_LINK' ?
              t('pos.payment.online')
            : checkoutPayMethod === 'DEBT_ON_ACCOUNT' ?
              t('pos.payment.debt')
            : t(\`pos.pay.\${checkoutPayMethod}\` as const)`,
);

inner = inner.replace(
  /        if \(paymentLinkUrl && posPaymentMethod === 'PAYMENT_LINK'\)/,
  '        if (paymentLinkUrl && checkoutPayMethod === \'PAYMENT_LINK\')',
);

const header = `import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bed,
  Frame,
  Layers,
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
  getOperatingStatus,
  type LaundryPriceListItemRow,
  type OperatingStatusPayload,
  type OrderRow,
  type PosCheckoutBundleResponse,
  type PosCheckoutResponse,
  type PosPaymentMethod,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  computeMultiInvoiceParts,
  computeSessionTotals,
  DELIVERY_FEE_KD,
  sumLinesKd,
} from '@/utils/finance-engine';

`;

const footer = `
export type PosEngineVariant = 'driver' | 'branch';

export type PosEngineOptions =
  | { variant: 'branch' }
  | {
      variant: 'driver';
      operating: OperatingStatusPayload | null;
      setOperating: Dispatch<SetStateAction<OperatingStatusPayload | null>>;
    };

function noopOperating() {}

export function usePosEngine(opts: PosEngineOptions) {
  const variant = opts.variant;
  const operating = variant === 'driver' ? opts.operating : null;
  const setOperating =
    variant === 'driver' ? opts.setOperating : noopOperating;

${inner}

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
    activeSubOrderIndex,
    setActiveSubOrderIndex,
    searchQ,
    setSearchQ,
    searchHits,
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
    checkoutBusy,
    receiptSheets,
    scanOrderDetail,
    scanOrderDialogOpen,
    setScanOrderDialogOpen,
    serviceOpen,
    setServiceOpen,
    serviceItem,
    serviceQty,
    serviceNesha,
    serviceFolding,
    serviceNeshaLevel,
    serviceFoldingStyle,
    serviceItemNote,
    setServiceItemNote,
    setServiceQty,
    setServiceNesha,
    setServiceFolding,
    setServiceNeshaLevel,
    setServiceFoldingStyle,
    billing,
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
    completePayment,
    handlePrintReceipt,
    handlePrintGarmentTags,
    signOut,
    defaultVisual,
    basePriceKd,
    serviceOptionsForItem,
    garmentTagCount,
    setSubOrders,
    setSelected,
    setSearchHits,
    setSearchQ,
    setNewOpen,
    setServiceOpen,
    setServiceItem,
    setReceiptSheets,
    setScanOrderDetail,
    setScanOrderDialogOpen,
    setBilling,
    setCatalogItems,
    setCatalogLoading,
    setCatalogFailed,
    setSavingCustomer,
    setCheckoutBusy,
    catalogItems,
    searchHits,
    newOpen,
    newName,
    newPhone,
    newPhone2,
    newArea,
    newBlock,
    newStreet,
    newAvenue,
    newHouse,
    savingCustomer,
    receiptSheets,
    scanOrderDetail,
    serviceOpen,
    serviceItem,
  };
}
`;

const out = `${header}
${types}

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
      labelAr: 'ط؛ط³ظٹظ„ ظˆظƒظˆظٹ ط¹ط§ط¯ظٹ',
      price: normal,
      available: Number.isFinite(normal),
    },
    {
      key: 'URGENT',
      labelAr: 'ط؛ط³ظٹظ„ ظˆظƒظˆظٹ ظ…ط³طھط¹ط¬ظ„',
      price: urgent,
      available: Number.isFinite(urgent),
    },
    {
      key: 'PRESS_ONLY',
      labelAr: 'ظƒظˆظٹ ط¹ط§ط¯ظٹ',
      price: press,
      available: Number.isFinite(press),
    },
    {
      key: 'URGENT_PRESS',
      labelAr: 'ظƒظˆظٹ ظ…ط³طھط¹ط¬ظ„',
      price: urgentPress,
      available: Number.isFinite(urgentPress),
    },
  ];
}

export function garmentTagCount(qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(50, Math.max(1, Math.round(n)));
}

${footer}`;

fs.writeFileSync('src/modules/shared/hooks/use-pos-engine.ts', out);
console.log('written', out.split('\n').length);
