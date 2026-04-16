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

export type ConfirmHandoverResponse = {
  settledOrderCount: number;
  systemHandoverTotal: string;
  shiftId: string;
  bankDepositReceiptUrl: string;
};

/** Multipart upload — bank deposit receipt for driver cash collection. */
export async function uploadHandoverReceipt(
  token: string,
  file: File,
): Promise<{ depositReceiptUrl: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(buildUrl('/api/finance/handover/upload-receipt'), {
      method: 'POST',
      headers,
      body: fd,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Network request failed';
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
  return json.data as { depositReceiptUrl: string };
}

export function confirmHandover(
  token: string,
  body: {
    driverId: string;
    depositReceiptUrl: string;
    declaredHandoverTotal?: number;
  },
) {
  return apiJson<ConfirmHandoverResponse>('/api/finance/handover/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export type BankDepositType = 'CASH_DEPOSIT_SLIP' | 'KNET_Z_REPORT';

export type BankDepositLogEntry = {
  id: string;
  depositType: BankDepositType;
  amountKd: string;
  receiptImageUrl: string;
  shiftId: string | null;
  createdAt: string;
  verifiedAt: string | null;
  uploadedBy: { id: string; fullName: string; username: string };
  verifiedByAccountant: {
    id: string;
    fullName: string;
    username: string;
  } | null;
};

export type BankDepositsListResponse = {
  from: string;
  to: string;
  entries: BankDepositLogEntry[];
};

export function getBankDeposits(
  token: string,
  query?: { from?: string; to?: string; take?: number },
) {
  const q = new URLSearchParams();
  if (query?.from) q.set('from', query.from);
  if (query?.to) q.set('to', query.to);
  if (query?.take != null) q.set('take', String(query.take));
  const qs = q.toString();
  return apiJson<BankDepositsListResponse>(
    `/api/finance/bank-deposits${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export async function uploadBankDeposit(
  token: string,
  params: {
    file: File;
    depositType: BankDepositType;
    amount: number;
    shiftId?: string;
  },
): Promise<BankDepositLogEntry> {
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('depositType', params.depositType);
  fd.append('amount', String(params.amount));
  if (params.shiftId?.trim()) {
    fd.append('shiftId', params.shiftId.trim());
  }
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(buildUrl('/api/finance/bank-deposits'), {
      method: 'POST',
      headers,
      body: fd,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Network request failed';
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
  return json.data as BankDepositLogEntry;
}

export function verifyBankDeposit(token: string, id: string) {
  return apiJson<BankDepositLogEntry>(
    `/api/finance/bank-deposits/${encodeURIComponent(id)}/verify`,
    { method: 'POST', token },
  );
}

export type FinancialCycleRow = {
  orderId: string;
  amountKd: string;
  collectedAt: string | null;
  collectedByManager: { id: string; fullName: string; username: string } | null;
  depositLogId: string | null;
  receiptImageUrl: string | null;
  verifiedAt: string | null;
  verifiedByAccountant: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  lastUpdatedAt: string;
};

export type FinancialCycleReportResponse = {
  rows: FinancialCycleRow[];
};

export function getFinancialCycleReport(token: string) {
  return apiJson<FinancialCycleReportResponse>(
    '/api/finance/reports/financial-cycle',
    { token },
  );
}

export type OwnerWalletSummary = {
  totalWalletLiabilities: string;
  totalCustomerDebts: string;
  debtFromIssuedInvoices: string;
  debtFromSubscriptionOveruse: string;
  debtSettledBySubscriptions: string;
  debtByBranch: string;
  debtByDriver: string;
  debtByOwner: string;
  debtByCallCenter: string;
  totalSubscriptionUsage: string;
};

export type OrderRow = {
  id: string;
  status: string;
  serviceType: string;
  totalPrice: string;
  cashStatus: string;
  posPaymentMethod?: PosPaymentMethod | null;
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
  motherContact?: string | null;
  wifeContact?: string | null;
  sonContact?: string | null;
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
  | 'PAYMENT_LINK'
  | 'ONLINE'
  | 'DEBT_ON_ACCOUNT';

export type DailyPosSalesByPaymentMethodReport = {
  from: string;
  to: string;
  rows: Array<{
    posPaymentMethod: PosPaymentMethod;
    orderCount: number;
    totalRevenue: string;
  }>;
};

export type DebtByCategoryReport = {
  from: string;
  to: string;
  rows: Array<{
    category: 'BRANCH' | 'DRIVER' | 'OWNER' | 'CALL_CENTER';
    source: 'SUBSCRIPTION_OVERUSE' | 'INVOICE_SHORTFALL';
    entryCount: number;
    totalDebt: string;
  }>;
};

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

/** Call center — unpaid hosted-payment orders (`GET /api/orders/collections/unpaid-online`). */
export type CollectionUnpaidOnlineRow = {
  orderId: string;
  customerName: string;
  customerPhone: string;
  amountKd: string;
  paymentUrl: string;
};

/** Multi-invoice POS: one gateway session for several orders (`POST /api/pos/checkout-bundle`). */
export type PosCheckoutBundleResponse = {
  bundleId: string;
  orders: PosCheckoutResponse[];
  paymentLink: PosPaymentLinkResult;
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
  isActive: boolean;
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
