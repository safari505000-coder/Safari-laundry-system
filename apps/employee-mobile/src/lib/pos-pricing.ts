import type {
  LaundryPriceListItemRow,
  PosCartLine,
  PosCheckoutRequest,
  PosCustomerRow,
  PosPaymentMethod,
  PosServiceKey,
} from '@/api/pos-types';

export const DELIVERY_FEE_KD = 0.25;
export const DELIVERY_LINE_LABEL_AR = 'توصيل داخل المنطقة';

export type ServiceOption = {
  key: PosServiceKey;
  labelAr: string;
  price: number;
  available: boolean;
};

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

export function buildCheckoutRequest(
  customer: PosCustomerRow,
  lines: PosCartLine[],
  paymentMethod: PosPaymentMethod,
): PosCheckoutRequest {
  const lineSum = sumLinesKd(lines);
  const deliveryForOrder = lineSum > 0 ? DELIVERY_FEE_KD : 0;
  const netTotal = lineSum + deliveryForOrder;
  const phone = customer.phone.replace(/[\s-]/g, '').trim();

  return {
    customerPhone: phone,
    customerId: customer.id,
    customerDisplayName: customer.displayName?.trim() || undefined,
    customerAddress: customer.address?.trim() || undefined,
    totalPrice: netTotal,
    lineItems: [
      ...lines.map((line) => ({
        label: line.nameAr,
        laundryPriceListItemId: line.laundryId,
        posServiceKey: line.serviceKey,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    ],
    serviceType: 'NORMAL',
    posPaymentMethod: paymentMethod,
  };
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
