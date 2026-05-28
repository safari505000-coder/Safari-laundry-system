import type {
  CustomerBillingProfile,
  LaundryPriceListItemRow,
  PosCartLine,
  PosCheckoutRequest,
  PosCustomerRow,
  PosPaymentMethod,
  PosServiceKey,
} from '@/api/pos-types';

export const DELIVERY_FEE_KD = 0.25;
export const DELIVERY_LINE_LABEL_AR = 'توصيل داخل المنطقة';
export const VIP_SURCHARGE_KD = 1.0;
export const VIP_LINE_LABEL_AR = 'خدمة كبار الشخصيات';

export type PosSubOrder = {
  id: string;
  kind: 'primary' | 'attached';
  lines: PosCartLine[];
  vipEnabled: boolean;
};

export type ServiceOption = {
  key: PosServiceKey;
  labelAr: string;
  price: number;
  available: boolean;
};

export function createPrimarySubOrder(): PosSubOrder {
  return {
    id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind: 'primary',
    lines: [],
    vipEnabled: false,
  };
}

export function rowShowsInLiveCatalog(row: LaundryPriceListItemRow): boolean {
  if (row.manualEntry) {
    return false;
  }
  const v = row.isActive as unknown;
  if (v === false || v === 0) {
    return false;
  }
  if (typeof v === 'string' && v.trim().toLowerCase() === 'false') {
    return false;
  }
  return true;
}

export function serviceOptionsForItem(
  item: LaundryPriceListItemRow,
): ServiceOption[] {
  const normal = Number.parseFloat(item.priceNormal);
  const urgent = Number.parseFloat(item.priceUrgent);
  const press = item.pricePressOnly
    ? Number.parseFloat(item.pricePressOnly)
    : Number.NaN;
  const urgentPress = item.priceUrgentPress
    ? Number.parseFloat(item.priceUrgentPress)
    : Number.NaN;

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

export function sumLinesKd(
  lines: Array<{ quantity: number; unitPrice: number }>,
): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

export function formatPreviewKd(amount: number): string {
  return `${amount.toFixed(3)} د.ك`;
}

export function firstFilledSubOrderIndex(subOrders: PosSubOrder[]): number {
  return subOrders.findIndex((order) => sumLinesKd(order.lines) > 0);
}

export function grandTotalKd(
  subOrders: PosSubOrder[],
  paymentMethod: PosPaymentMethod,
  subscriptionProfile: CustomerBillingProfile | null,
): number {
  const firstIdx = firstFilledSubOrderIndex(subOrders);
  if (firstIdx < 0) {
    return 0;
  }
  return subOrders.reduce((sum, order, index) => {
    const lineSum = sumLinesKd(order.lines);
    if (lineSum <= 0) {
      return sum;
    }
    const delivery = deliveryForSubOrder({
      lineSum,
      isFirstInSession: index === firstIdx,
      paymentMethod,
      subscriptionProfile,
    });
    const vip =
      order.vipEnabled && lineSum > 0 ? VIP_SURCHARGE_KD : 0;
    return sum + lineSum + delivery + vip;
  }, 0);
}

export function deliveryForSubOrder(options: {
  lineSum: number;
  isFirstInSession: boolean;
  paymentMethod: PosPaymentMethod;
  subscriptionProfile: CustomerBillingProfile | null;
}): number {
  const { lineSum, isFirstInSession, paymentMethod, subscriptionProfile } =
    options;
  if (lineSum <= 0) {
    return 0;
  }
  const balance = Number.parseFloat(subscriptionProfile?.remainingBalance ?? '');
  const walletCoversLinesOnly =
    paymentMethod === 'SUBSCRIPTION' &&
    subscriptionProfile?.subscriptionActive === true &&
    Number.isFinite(balance) &&
    balance + 1e-9 >= lineSum;
  const baseDelivery = isFirstInSession ? DELIVERY_FEE_KD : 0;
  return walletCoversLinesOnly ? 0 : baseDelivery;
}

/** Matches web DriverPOS checkout payload (VIP row + delivery row + garment lines). */
export function buildSubOrderCheckoutRequest(
  customer: PosCustomerRow,
  subOrder: PosSubOrder,
  options: {
    isFirstInSession: boolean;
    paymentMethod: PosPaymentMethod;
    subscriptionProfile: CustomerBillingProfile | null;
    dispatchId?: string | null;
  },
): PosCheckoutRequest {
  const lineSum = sumLinesKd(subOrder.lines);
  const deliveryForOrder = deliveryForSubOrder({
    lineSum,
    isFirstInSession: options.isFirstInSession,
    paymentMethod: options.paymentMethod,
    subscriptionProfile: options.subscriptionProfile,
  });
  const vipSurcharge =
    subOrder.vipEnabled && lineSum > 0 ? VIP_SURCHARGE_KD : 0;
  const netTotal = lineSum + deliveryForOrder + vipSurcharge;
  const phone = customer.phone.replace(/[\s-]/g, '').trim();

  const garmentLines = subOrder.lines.map((line) => ({
    label: line.nameAr,
    laundryPriceListItemId: line.laundryId,
    posServiceKey: line.serviceKey,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }));
  const serviceLines: PosCheckoutRequest['lineItems'] = [];
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

  return {
    customerPhone: phone,
    customerId: customer.id,
    customerDisplayName: customer.displayName?.trim() || undefined,
    customerAddress: customer.address?.trim() || undefined,
    totalPrice: netTotal,
    lineItems: [...garmentLines, ...serviceLines],
    serviceType: 'NORMAL',
    posPaymentMethod: options.paymentMethod,
    dispatchId: options.dispatchId?.trim() || undefined,
  };
}

/** @deprecated Use buildSubOrderCheckoutRequest — kept for tests. */
export function buildCheckoutRequest(
  customer: PosCustomerRow,
  lines: PosCartLine[],
  paymentMethod: PosPaymentMethod,
  dispatchId?: string | null,
): PosCheckoutRequest {
  return buildSubOrderCheckoutRequest(
    customer,
    { id: 'legacy', kind: 'primary', lines, vipEnabled: false },
    {
      isFirstInSession: true,
      paymentMethod,
      subscriptionProfile: null,
      dispatchId,
    },
  );
}

export function addOrMergeCartLine(
  lines: PosCartLine[],
  next: Omit<PosCartLine, 'lineKey'> & { lineKey?: string },
): PosCartLine[] {
  const lineKey =
    next.lineKey ??
    `${next.laundryId}:${next.serviceKey}:${next.nameAr}:${next.unitPrice}`;
  const existing = lines.find((row) => row.lineKey === lineKey);
  if (existing) {
    return lines.map((row) =>
      row.lineKey === lineKey
        ? { ...row, quantity: row.quantity + next.quantity }
        : row,
    );
  }
  return [...lines, { ...next, lineKey }];
}
