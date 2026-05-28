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

export type SubscriptionPlanDto = {
  id: string;
  name: string;
  salePrice: string;
  actualBalance: string;
};

export type ActivateSubscriptionDto = {
  customerId: string;
  planId: string;
  autoCloseInvoices?: boolean;
  paymentMethod: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE' | 'DEBT_ON_ACCOUNT';
  companySupportAmountKd?: string;
};

export type CancelSubscriptionDto = {
  customerId: string;
  reason?: string;
};

export type RecordPartialDebtPaymentDto = {
  amountKd: string;
  discountKd?: string;
  paymentMethod: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE';
  note?: string;
};

export type CustomerLedgerHeader = {
  id: string;
  displayName: string | null;
  phone: string | null;
  phone2: string | null;
  originBranchId: string | null;
  originBranchName: string | null;
  walletBalanceKd: string;
  walletDebtKd: string;
  collectionsReceivableKd: string;
  remainingDebtKd: string;
  operationalDebtKd: string;
};

export type CustomerLedgerSubscription = {
  id: string;
  status: string;
  planNameSnapshot: string;
  planSalePriceKd: string;
  planActualBalanceKd: string;
  planValidityDays: number;
  carriedBalanceKd: string;
  parentSubscriptionId: string | null;
  activatedAtIso: string;
  expiresAtIso: string;
  closedAtIso: string | null;
  closedReason: string | null;
};

export type CustomerLedgerEventKind =
  | 'SUBSCRIPTION_ACTIVATION'
  | 'SUBSCRIPTION_CANCELLATION'
  | 'SUBSCRIPTION_ROLLOVER_CARRY'
  | 'ORDER_PAID_IN_FULL'
  | 'ORDER_SETTLEMENT_SUBSCRIPTION'
  | 'ORDER_INVOICE_PARTIAL_PAYMENT'
  | 'ORDER_INVOICE_ON_ACCOUNT'
  | 'PARTIAL_DEBT_PAYMENT';

export type CustomerLedgerEvent = {
  id: string;
  atIso: string;
  rawType: string;
  kind: CustomerLedgerEventKind;
  amountKd: string;
  balanceBeforeKd: string;
  balanceAfterKd: string;
  debtBeforeKd: string;
  debtAfterKd: string;
  debtSettledKd: string;
  debtDiscountKd: string;
  paymentMethod: string | null;
  orderId: string | null;
  orderSerial: string | null;
  subscriptionId: string | null;
  subscriptionLabel: string | null;
  performedByName: string | null;
  note: string | null;
};

export type CustomerLedgerInvoice = {
  id: string;
  serial: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
  totalKd: string;
  status: string;
  cashStatus: string;
  paymentMethod: string | null;
  driverName: string | null;
  branchName: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionLabel: string | null;
  issuedWhileCutOff: boolean;
  openDebt: boolean;
  projectionGroup: 'UNPAID' | 'PAID' | 'CANCELED';
};

export type CustomerLedgerResponse = {
  customer: CustomerLedgerHeader;
  activeSubscription: CustomerLedgerSubscription | null;
  isCutOff: boolean;
  fromIso: string | null;
  toIso: string | null;
  events: CustomerLedgerEvent[];
  invoices: CustomerLedgerInvoice[];
  totals: {
    eventCount: number;
    invoiceCount: number;
    openInvoiceCount: number;
    totalInvoicedKd: string;
    totalPaidInvoicesKd: string;
    totalOpenInvoicesKd: string;
    unpaidInvoiceCount: number;
    paidInvoiceCount: number;
    canceledInvoiceCount: number;
    totalCollectedKd: string;
    totalDiscountedKd: string;
  };
};

