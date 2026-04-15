export type SafariRole =
  | 'OWNER'
  | 'MANAGER'
  | 'DRIVER'
  | 'CALL_CENTER'
  | 'ACCOUNTANT'
  | 'SUPERVISOR'
  | 'VIEWER';

export type LoginUser = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  safariRole: SafariRole;
};

export type LoginResponse = {
  accessToken: string;
  user: LoginUser;
};

export type ApiWrapped<T> = {
  meta: { application: string };
  data: T;
};

function apiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  return v ? v.replace(/\/$/, '') : '';
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const base = apiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  status: number;
  /** Server codes e.g. SYSTEM_CLOSED (operating hours). */
  errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

function parseApiBody(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatErrorMessage(
  json: Record<string, unknown>,
  status: number,
  rawText: string,
): string {
  const message = json.message;
  if (Array.isArray(message)) {
    return message
      .map((m) => (typeof m === 'string' ? m : JSON.stringify(m)))
      .join(', ');
  }
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  const err = json.error;
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  if (rawText.length > 0 && rawText.length < 400) {
    return rawText;
  }
  return `HTTP ${status}`;
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const { token: bearer, ...fetchInit } = init ?? {};
  const headers = new Headers(fetchInit.headers);
  if (!headers.has('Content-Type') && fetchInit.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (bearer) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path), { ...fetchInit, headers });
  } catch (e) {
    const m =
      e instanceof Error ? e.message : 'Network request failed';
    throw new ApiError(m, 0);
  }

  const rawText = await res.text();
  const json = parseApiBody(rawText);

  if (!res.ok) {
    const errorCode =
      typeof json.errorCode === 'string' ? json.errorCode : undefined;
    throw new ApiError(
      formatErrorMessage(json, res.status, rawText),
      res.status,
      errorCode,
    );
  }

  if (json.data === undefined) {
    throw new ApiError(
      'Invalid API response (missing data)',
      res.status,
    );
  }
  return json.data as T;
}

export function postLogin(username: string, password: string) {
  return apiJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
  });
}

export type OperatingStatusPayload = {
  isOpen: boolean;
  kuwaitTimeLabel: string;
  /** Kuwait date (YYYY-MM-DD) the system considers “active” for financial grouping. */
  financialDateIso: string;
  financialDateLabel: string;
  /** Default business start hour for reporting UI (Kuwait). */
  reportingDayStartHour: number;
  fullScreenClosedRoles: readonly string[];
};

/** Public — no JWT. Kuwait operating window for UI gates. */
export function getOperatingStatus() {
  return apiJson<OperatingStatusPayload>('/api/system/operating-status');
}

export type DriverBalanceRow = {
  driverId: string;
  employeeId: string | null;
  username: string;
  fullName: string;
  phone: string | null;
  branchId: string | null;
  currentShiftId: string | null;
  shiftStartedAt: string | null;
  heldCashTotal: string;
  pendingSettlementOrderCount: number;
};

export type DriverBalanceResponse = {
  drivers: DriverBalanceRow[];
};

export type OwnerWalletSummary = {
  totalWalletLiabilities: string;
  totalCustomerDebts: string;
};

export type OrderRow = {
  id: string;
  status: string;
  serviceType: string;
  totalPrice: string;
  cashStatus: string;
  walletSettledAt?: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    phone: string;
    phone2?: string | null;
    address: string | null;
    displayName?: string | null;
  };
  driver: {
    id: string;
    username: string;
    fullName: string;
    employeeId: string | null;
    jobTitle: string | null;
    phone: string | null;
    safariRole: string;
  } | null;
  lineItems: {
    id: string;
    label: string | null;
    quantity: string;
    unitPrice: string;
  }[];
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  price: string;
  creditAmount: string;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubscriberListRow = {
  customerId: string;
  customerName: string;
  subscriptionType: string;
  startDate: string | null;
  expiryDate: string | null;
  remainingDays: number | null;
  balance: string;
  rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
};

export type CallCenterPlan = {
  id: string;
  name: string;
  price: string;
  creditAmount: string;
};

export type CustomerSearchRow = {
  id: string;
  phone: string;
  phone2?: string | null;
  displayName?: string | null;
  address: string | null;
  addressArea?: string | null;
  addressBlock?: string | null;
  addressStreet?: string | null;
  addressAvenue?: string | null;
  addressHouse?: string | null;
  createdAt: string;
  wallet: { balance: string; debt: string } | null;
};

export type PosPaymentMethod =
  | 'SUBSCRIPTION_WALLET'
  | 'CASH'
  | 'KNET'
  | 'PAYMENT_LINK';

/** Hosted payment URL from Kuwait Gateway when checkout uses PAYMENT_LINK. */
export type PosPaymentLinkResult = {
  url: string;
  reference?: string;
};

/** POS checkout order payload (unwraps API `data`). */
export type PosCheckoutResponse = {
  id: string;
  invoiceNumber: string | null;
  createdAt: string;
  status?: string;
  paymentLink?: PosPaymentLinkResult;
};

export type CustomerBillingProfile = {
  subscriptionActive: boolean;
  planType: string | null;
  remainingBalance: string;
  debt: string;
  lastSubscriptionAt: string | null;
};

export type SubscriptionActivationSettlement = {
  totalCollected: string;
  debtSettled: string;
  creditedToBalance: string;
  previousBalance: string;
  previousDebt: string;
  newBalance: string;
  newDebt: string;
};

export type ActivateSubscriptionResponse = {
  customer: {
    id: string;
    phone: string;
    phone2?: string | null;
    address: string | null;
  };
  plan: {
    id: string;
    name: string;
    price: string;
    creditAmount: string;
  };
  wallet: { balance: string; debt: string };
  settlement: SubscriptionActivationSettlement;
};

export type LaundryPriceTier =
  | 'NORMAL'
  | 'URGENT'
  | 'PRESS_ONLY'
  | 'URGENT_PRESS';

export type LaundryPriceListItemRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
  manualEntry: boolean;
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly: string | null;
  priceUrgentPress: string | null;
};

export type TeamUserRow = {
  id: string;
  username: string;
  fullName: string;
  employeeId: string | null;
  jobTitle: string | null;
  phone: string | null;
  safariRole: SafariRole;
  roleId: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  role: { id: string; name: string };
  branch: { id: string; name: string; location: string } | null;
};

export type SettlementHistoryRow = {
  id: string;
  createdAt: string;
  type: string;
  totalCollected?: string;
  debtSettled?: string;
  creditedToBalance?: string;
  balanceAfter: string;
  debtAfter: string;
  planName?: string;
  orderId?: string;
};

export type IssuedInvoicesReport = {
  from: string;
  to: string;
  count: number;
  rows: Array<{
    id: string;
    status: string;
    serviceType: string;
    totalPrice: string;
    cashStatus: string;
    invoiceNumber: string | null;
    posPaymentMethod: string | null;
    completedAt: string | null;
    createdAt: string;
    customer: { id: string; phone: string; displayName: string | null };
    driver: {
      id: string;
      username: string;
      fullName: string;
      employeeId: string | null;
      branchId: string | null;
    } | null;
  }>;
};

export type DriverLedgerReport = {
  driver: {
    id: string;
    username: string;
    fullName: string;
    employeeId: string | null;
    phone: string | null;
    safariRole: string;
    branchId: string | null;
  };
  owedToOfficeKd: string;
  pendingSettlementOrderCount: number;
  period: { from: string; to: string };
  ordersInPeriod: Array<{
    id: string;
    status: string;
    totalPrice: string;
    cashStatus: string;
    posPaymentMethod: string | null;
    invoiceNumber: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

export type DailyCashClosingReport = {
  from: string;
  to: string;
  grossCashSalesKd: string;
  expensesTotalKd: string;
  netCashAfterExpensesKd: string;
  cashOrderCount: number;
};

export type ExpenseRow = {
  id: string;
  title: string;
  amount: string;
  category: string;
  note: string | null;
  receiptImageData: string | null;
  expenseDate: string;
  recordedById: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
  recordedBy: {
    id: string;
    fullName: string;
    username: string;
  };
};

export type BranchRow = {
  id: string;
  name: string;
  location: string;
  phone: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type ExecutiveSummaryReport = {
  from: string;
  to: string;
  branchId: string | null;
  grossRevenueKd: string;
  variableSoapFuelKd: string;
  miscOperationalKd: string;
  fixedExpensesKd: string;
  payrollPaidKd: string;
  totalExpensesVariableAndFixedKd: string;
  netProfitKd: string;
};

export type LiveFeedLine = {
  label: string | null;
  quantity: string;
  unitPrice: string;
};

export type LiveFeedOrder = {
  id: string;
  invoiceNumber: string | null;
  createdAt: string;
  totalPrice: string;
  customerName: string;
  branchName: string | null;
  branchId: string | null;
  lineItemCount: number;
  lines: LiveFeedLine[];
};

export type LiveFeedResponse = {
  orders: LiveFeedOrder[];
};

export type BranchOperationsLiveResponse = {
  branches: { branchId: string; isLive: boolean }[];
};

export type PayrollStatus = 'PENDING' | 'PAID';

export type PayrollRow = {
  id: string;
  userId: string;
  branchId: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  paymentDate: string;
  status: PayrollStatus;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string; username: string };
  branch: { id: string; name: string };
};

export type FixedExpenseCategoryApi =
  | 'RENT'
  | 'ELECTRICITY'
  | 'LEASE'
  | 'OTHER';

export type FixedExpenseScheduleRow = {
  id: string;
  branchId: string;
  title: string;
  category: FixedExpenseCategoryApi;
  monthlyAmount: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string };
};
