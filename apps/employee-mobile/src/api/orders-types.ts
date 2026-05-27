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

export type IssuedInvoiceReportRow = {
  id: string;
  invoiceNumber: string | null;
  serialNumber: string | null;
  createdAt: string;
  totalPrice: string;
  status: string;
  posPaymentMethod: QuickPaymentMethod | 'SUBSCRIPTION_WALLET' | null;
  customer: {
    id: string;
    phone: string;
    displayName: string | null;
  };
};

export type IssuedInvoicesReport = {
  rows: IssuedInvoiceReportRow[];
  totals?: {
    totalKd?: string;
    count?: number;
  };
};

export type DriverCashReceiptRow = {
  id: string;
  receivedFromDriverAt: string;
  managerName: string;
  branchName: string | null;
  amountKd: string;
  settledOrderCount: number;
  status:
    | 'PENDING_DEPOSIT'
    | 'AWAITING_VERIFICATION'
    | 'VERIFIED'
    | 'REJECTED';
};

export type ExpenseCategory = 'SOAP' | 'FUEL' | 'MISC';
export type ExpenseMethod = 'CASH' | 'KNET' | 'PREPAID_CARD' | 'BANK_TRANSFER';
export type ExpenseStatus = 'PENDING_ACCOUNTANT' | 'APPROVED' | 'REJECTED' | 'AUDIT';

export type DriverExpenseRow = {
  id: string;
  title: string;
  amount: string;
  category: ExpenseCategory;
  expenseMethod: ExpenseMethod;
  status: ExpenseStatus;
  note: string | null;
  expenseDate: string;
};

export type CreateExpenseRequest = {
  title: string;
  amount: number;
  category: ExpenseCategory;
  expenseMethod?: ExpenseMethod;
  note?: string;
};

export type DebtTransferStatus =
  | 'DRAFT'
  | 'AWAITING_SIGNATURES'
  | 'COMPLETED'
  | 'CANCELLED';

export type DebtTransferParticipant = {
  id: string;
  username: string;
  fullName: string;
  safariRole: string;
  branchId?: string | null;
};

export type DebtTransferRow = {
  id: string;
  status: DebtTransferStatus;
  totalAmount: string;
  orderCount: number;
  reason: string | null;
  notes: string | null;
  sourceDriver: DebtTransferParticipant;
  targetDriver: DebtTransferParticipant;
  sourceSignedAt: string | null;
  targetSignedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};
