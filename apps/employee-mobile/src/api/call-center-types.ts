export type CustomerDirectoryRow = {
  customer: {
    id: string;
    phone: string;
    phone2?: string | null;
    displayName?: string | null;
    address: string | null;
  };
  debt: {
    walletDebt: string;
    subscriptionOveruseDebt: string;
    totalDebt: string;
  };
};

export type CustomerSearchHit = {
  id: string;
  displayName: string;
  phone: string;
  phone2: string | null;
  totalDebtKd: string;
};

export type CustomerCollectionDebtBreakdown = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalDebtKd: string;
  lines: Array<{
    orderId: string;
    readableId: string;
    invoiceNumber: string | null;
    amountKd: string;
    paymentMethod: string | null;
    orderDateIso: string;
    reasonAr: string;
  }>;
};

export type CollectionUnpaidOnlineRow = {
  orderId: string;
  customerId: string;
  readableId: string;
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string;
  amountKd: string;
  paymentMethod: string | null;
  paymentUrl: string | null;
  fullBalanceLinkKd?: string | null;
  fullBalancePaymentUrl?: string | null;
  createdAtIso: string;
  canSendCollectionPaymentWa?: boolean;
  canRemindNow: boolean;
  branchName: string | null;
  driverName: string | null;
};

export type SendPaymentLinkWhatsappResult = {
  paymentUrl: string;
  serverPush: boolean;
};

export type FullBalanceLinkResult = {
  breakdown: CustomerCollectionDebtBreakdown;
  paymentUrl: string;
  serverPush: boolean;
};

export type WebsiteOrderRequestStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'CONVERTED'
  | 'CANCELLED';

export type WebsiteOrderRequestRow = {
  id: string;
  publicReference: string;
  status: WebsiteOrderRequestStatus;
  customerPhone: string;
  customerDisplayName: string | null;
  customerAddress: string | null;
  serviceType: string;
  notes: string | null;
  createdAtIso: string;
  reviewedAtIso: string | null;
};

export type WebsiteCustomerPaymentFilter = 'PENDING' | 'PAID' | 'ALL';

export type WebsiteCustomerPaymentRow = {
  orderId: string;
  invoiceNumber: string | null;
  serialNumber: string | null;
  customerPhone: string;
  customerDisplayName: string | null;
  totalAmountKd: string;
  remainingAmountKd: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paymentUrl: string | null;
  requestedAtIso: string | null;
  createdAtIso: string;
};
