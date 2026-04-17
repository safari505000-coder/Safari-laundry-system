import fs from 'node:fs';
const typesRaw = fs.readFileSync('src/modules/shared/hooks/_pos-types.txt', 'utf8');
const types =
  typesRaw
    .replace(/^type CartLine/gm, 'export type CartLine')
    .replace(/^type ReceiptSnapshot/gm, 'export type ReceiptSnapshot')
    .replace(/^type PosSubOrder/gm, 'export type PosSubOrder')
    .replace(/^type ServiceOption/gm, 'export type ServiceOption')
    .replace(/^function garmentTagCount/gm, 'export function garmentTagCount')
    .replace(/^function defaultVisual/gm, 'export function defaultVisual')
    .replace(/^function basePriceKd/gm, 'export function basePriceKd')
    .replace(/^function serviceOptionsForItem/gm, 'export function serviceOptionsForItem');

const inner = fs.readFileSync('src/modules/shared/hooks/_pos-inner.txt', 'utf8');

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

const tail = `
export type PosEngineVariant = 'driver' | 'branch';

export type PosEngineOptions =
  | { variant: 'branch' }
  | {
      variant: 'driver';
      operating: OperatingStatusPayload | null;
      setOperating: Dispatch<SetStateAction<OperatingStatusPayload | null>>;
    };

function noopOperating(_: SetStateAction<OperatingStatusPayload | null>) {}

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
    setCatalogItems,
    catalogLoading,
    setCatalogLoading,
    catalogFailed,
    setCatalogFailed,
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
    serviceNesha,
    setServiceNesha,
    serviceFolding,
    setServiceFolding,
    serviceNeshaLevel,
    setServiceNeshaLevel,
    serviceFoldingStyle,
    setServiceFoldingStyle,
    serviceItemNote,
    setServiceItemNote,
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
  };
}
`;

fs.writeFileSync(
  'src/modules/shared/hooks/use-pos-engine.ts',
  `${header}${types}\n\n${tail}`,
);
console.log('done');
