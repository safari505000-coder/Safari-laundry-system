export type QuickPaymentMethod =
  | 'CASH'
  | 'KNET'
  | 'PAYMENT_LINK'
  | 'ONLINE'
  | 'DEBT_ON_ACCOUNT';

export type DriverPendingInvoiceRow = {
  orderId: string;
  readableId: string;
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string;
  amountKd: string;
  paymentMethod: QuickPaymentMethod | 'SUBSCRIPTION_WALLET' | null;
  notes: string | null;
  orderStatus: string;
  linkStatus: 'PENDING' | 'EXPIRED' | null;
  createdAtIso: string;
};

export type DriverPendingInvoicesResponse = {
  rows: DriverPendingInvoiceRow[];
  totalAmountKd: string;
  filteredCount: number;
  totalCount: number;
};

export type DriverCashCustodySummary = {
  cashTotalKd: string;
  cashOrderCount: number;
  grandTotalKd: string;
};

export type QuickCreateOrderRequest = {
  customerPhone: string;
  customerDisplayName?: string;
  customerAddress?: string;
  totalPrice: number;
  posPaymentMethod: QuickPaymentMethod;
  notes?: string;
  serviceType?: 'NORMAL' | 'EXPRESS';
};

export type QuickCreateOrderResponse = {
  id: string;
  serialNumber: string | null;
  invoiceNumber: string | null;
  totalPrice: string | number;
  status: string;
};

export type OrderDetailRow = {
  id: string;
  status: string;
  totalPrice: string;
  cashStatus: string;
  posPaymentMethod?: QuickPaymentMethod | null;
  invoiceNumber: string | null;
  serialNumber?: string | null;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    phone: string;
    displayName?: string | null;
    address: string | null;
  };
  driver: {
    id: string;
    fullName: string;
  } | null;
};
