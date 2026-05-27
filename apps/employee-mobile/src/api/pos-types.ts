export type LaundryCategoryRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
};

export type LaundryPriceListItemRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
  manualEntry: boolean;
  isActive: boolean;
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly: string | null;
  priceUrgentPress: string | null;
  categoryId?: string | null;
  categoryNameAr?: string | null;
};

export type PosCustomerRow = {
  id: string;
  phone: string;
  phone2?: string | null;
  displayName?: string | null;
  address: string | null;
  wallet: { balance: string; debt: string } | null;
};

export type CustomerBillingProfile = {
  subscriptionActive: boolean;
  planType: string | null;
  remainingBalance: string;
  debt: string;
  lastSubscriptionAt: string | null;
};

export type PosServiceKey =
  | 'NORMAL'
  | 'URGENT'
  | 'PRESS_ONLY'
  | 'URGENT_PRESS';

export type PosCartLine = {
  lineKey: string;
  laundryId: string;
  nameAr: string;
  serviceKey: PosServiceKey;
  serviceLabel: string;
  unitPrice: number;
  quantity: number;
};

export type PosPaymentMethod =
  | 'CASH'
  | 'KNET'
  | 'PAYMENT_LINK'
  | 'ONLINE'
  | 'DEBT_ON_ACCOUNT';

export type PosCheckoutLineItem = {
  label: string;
  quantity: number;
  unitPrice: number;
};

export type PosCheckoutRequest = {
  customerPhone: string;
  customerId?: string;
  customerDisplayName?: string;
  customerAddress?: string;
  totalPrice: number;
  lineItems: PosCheckoutLineItem[];
  serviceType: 'NORMAL' | 'EXPRESS';
  posPaymentMethod: PosPaymentMethod;
  notes?: string;
  dispatchId?: string;
};

export type PosCheckoutResponse = {
  id: string;
  invoiceNumber: string | null;
  serialNumber: string | null;
  createdAt: string;
  status?: string;
  paymentLink?: { url: string; reference?: string };
};

export type PosPaymentLinkResult = {
  url: string;
  reference?: string;
};
