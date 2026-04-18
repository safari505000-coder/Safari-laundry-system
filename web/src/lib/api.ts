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
  /** Set for branch-scoped staff; drives merged price list when using JWT defaults. */
  branchId?: string | null;
};

export type LoginResponse = {
  accessToken: string;
  user: LoginUser;
};

/** SafariStream global context (`GET /api/safari-stream/snapshot`). */
export type SafariStreamSnapshot = {
  stream: string;
  user: LoginUser;
  wallet: {
    fieldCashAvailableKd: string | null;
    pendingDepositHoldKd: string | null;
    pendingDebtOrdersKd: string | null;
  };
  institution: {
    allDriversFieldCashKd: string;
    allDriversPendingDepositsKd: string;
    financialDayNetProfitKd: string;
    financialDateIso: string;
  } | null;
  permissions: string[];
  /**
   * Laundry catalog version token. Bumped when OWNER edits any item / category
   * / branch override. `usePriceList` watches this value from the snapshot and
   * reloads its cache when it changes — which is how Driver POS picks up price
   * changes without a dedicated push channel.
   */
  priceListVersion?: string;
  /**
   * Dastur §3 — Manager Accountability alert surface.
   * - fleet.*: Owner / Accountant dashboards (fleet-wide overdue count & KD).
   * - mine.*:  Manager sidebar badge (their own pending bags + overdue count).
   */
  managerCustody?: {
    fleet: {
      pendingAmountKd: string;
      overdueCount: number;
      overdueAmountKd: string;
    } | null;
    mine: {
      pendingCount: number;
      pendingAmountKd: string;
      overdueCount: number;
    } | null;
  };
};

export type UnifiedLedgerStreamRow = {
  id: string;
  at: string;
  streamType: string;
  amountKd: string;
  memo: string | null;
  driverId: string | null;
  driverName: string | null;
  attachmentUrl: string | null;
  refKind: 'ORDER' | 'EXPENSE' | 'DEPOSIT';
  refId: string;
};

export type UnifiedLedgerStreamResponse = {
  from: string;
  to: string;
  rows: UnifiedLedgerStreamRow[];
};

export function getUnifiedLedgerStream(
  token: string,
  params: { from: string; to: string; driverId?: string; branchId?: string },
) {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
  });
  if (params.driverId) qs.set('driverId', params.driverId);
  if (params.branchId) qs.set('branchId', params.branchId);
  return apiJson<UnifiedLedgerStreamResponse>(
    `/api/reports/unified-ledger-stream?${qs.toString()}`,
    { token },
  );
}

export type ApiWrapped<T> = {
  meta: { application: string };
  data: T;
};

/**
 * API origin only (e.g. `http://localhost:3000`). Do not include `/api` — every
 * request path already starts with `/api/...`; a trailing `/api` would produce
 * `/api/api/expenses` and Nest returns 404 (`Cannot POST /api/api/expenses`).
 */
function apiBase(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let base = raw.trim().replace(/\/+$/, '');
  base = base.replace(/\/api$/i, '');
  return base;
}

/** Nest `ExpensesController` (`@Controller('expenses')`) + global prefix `api`. */
export const API_EXPENSES = '/api/expenses';

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

/*
 * Dastur §3 — per-driver pending invoice aggregates returned by
 * /api/finance/driver-balance. `heldCashTotal` is preserved for callers
 * that only care about cash; `pending*Kd` expose the full
 * invoice-level liability (Cash + K-Net + Link + Online) used by the
 * Staff Debts report.
 */
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
  pendingCashKd: string;
  pendingKnetKd: string;
  pendingLinkKd: string;
  pendingOnlineKd: string;
  pendingTotalKd: string;
  pendingInvoiceCount: number;
};

export type DriverBalanceResponse = {
  drivers: DriverBalanceRow[];
};

export type FinanceRealtimeTotals = {
  totalCash: string;
  totalOnline: string;
  totalDebt: string;
  totalSubscriptionUsage: string;
};

export type DriverMonitoringRow = {
  driverId: string;
  fullName: string;
  username: string;
  phone: string | null;
  vehicleLabel: string;
  status: 'ON_SHIFT';
  source: 'LIVE_GPS' | 'BRANCH_FALLBACK';
  lastKnownLocation: { lat: number; lng: number } | null;
  markerLocation: { lat: number; lng: number } | null;
  branch: { id: string; name: string; location: string } | null;
};

export type DriverMonitoringResponse = {
  drivers: DriverMonitoringRow[];
};

export type DriverTrackingUpdatePayload = {
  vehicleLabel?: string;
  lastKnownLocation?: string;
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
    /** Optional — when omitted the bag enters the new two-step PENDING_DEPOSIT flow. */
    depositReceiptUrl?: string;
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

export type DepositType = 'CASH' | 'KNET';
export type DepositStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type DepositAuditRow = {
  id: string;
  driverId: string;
  driverName: string;
  amount: string;
  type: DepositType;
  receiptImage: string;
  status: DepositStatus;
  auditComment: string | null;
  auditedBy: { id: string; fullName: string; username: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type DepositsListResponse = {
  rows: DepositAuditRow[];
};

export function getDeposits(
  token: string,
  query?: { status?: DepositStatus; driverId?: string; driverName?: string },
) {
  const q = new URLSearchParams();
  if (query?.status) q.set('status', query.status);
  if (query?.driverId) q.set('driverId', query.driverId);
  if (query?.driverName?.trim()) q.set('driverName', query.driverName.trim());
  const qs = q.toString();
  return apiJson<DepositsListResponse>(`/api/finance/deposits${qs ? `?${qs}` : ''}`, {
    token,
  });
}

/** DRIVER — multipart deposit request (PENDING until accountant approves). */
export async function uploadDriverDeposit(
  token: string,
  params: { file: File; type: DepositType; amount: number },
): Promise<DepositAuditRow> {
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('type', params.type);
  fd.append('amount', String(params.amount));
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(buildUrl('/api/finance/deposits'), {
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
    throw new ApiError('Invalid API response (missing data)', res.status);
  }
  return json.data as DepositAuditRow;
}

export function updateDepositStatus(
  token: string,
  id: string,
  body: { status: DepositStatus; auditComment?: string },
) {
  return apiJson<{ id: string; status: DepositStatus; auditComment: string | null; updatedAt: string }>(
    `/api/finance/deposits/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
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
  salePrice: string;
  actualBalance: string;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubscriberListRow = {
  customerId: string;
  customerName: string;
  /** Dastur §5 (V1.5) — phone for WhatsApp nudges (may be null). */
  customerPhone: string | null;
  subscriptionType: string;
  /** Dastur §5 (V1.5) — plan ID reused on Renew. Null ⇒ Renew disabled. */
  planId: string | null;
  startDate: string | null;
  expiryDate: string | null;
  remainingDays: number | null;
  balance: string;
  rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
  /** Days since the subscription was last activated. Null if unknown. */
  invoiceAgeDays: number | null;
  /** Cumulative 24h-guarded reminders for this subscriber. */
  reminderCount: number;
  lastReminderAtIso: string | null;
  /** Backend says "true" when another `/reminder` call would succeed. */
  canRemindNow: boolean;
};

/**
 * Dastur §5 (V1.5) — Response from
 * POST /api/call-center/{orders|subscribers}/:id/reminder.
 */
export type ReminderResult = {
  sent: boolean;
  reminderCount: number;
  lastReminderAtIso: string | null;
  nextAllowedAtIso: string | null;
  hoursUntilNext: number | null;
};

/**
 * Dastur §1 (V1.5) — Owner Serial Management island types.
 */
export type DriverPrefixRow = {
  id: string;
  fullName: string;
  username: string;
  driverPrefix: string | null;
  branchName: string | null;
  isActive: boolean;
};

export type SerialLogRow = {
  orderId: string;
  serialNumber: string;
  driverId: string | null;
  driverName: string | null;
  driverPrefix: string | null;
  customerName: string | null;
  totalPriceKd: string;
  createdAtIso: string;
};

export type SerialLog = {
  currentCounter: number;
  rows: SerialLogRow[];
};

export type CallCenterPlan = {
  id: string;
  name: string;
  salePrice: string;
  actualBalance: string;
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

export type CustomerDirectoryRow = {
  customer: {
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
    updatedAt: string;
  };
  debt: {
    walletDebt: string;
    subscriptionOveruseDebt: string;
    totalDebt: string;
  };
  subscription: {
    walletBalance: string;
    subscriptionPlanId: string | null;
    subscriptionPlanName: string | null;
    subscriptionActivatedAt: string | null;
    subscriptionExpiresAt: string | null;
    totalSubscriptionUsage: string;
    debtSettledBySubscriptions: string;
  };
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
  createdAtIso: string;
  invoiceAgeDays: number;
  reminderCount: number;
  lastReminderAtIso: string | null;
  canRemindNow: boolean;
};

/**
 * Dastur V1.5.3 — Management Room "Extend Subscription" response.
 * `POST /api/call-center/subscriptions/extend`
 */
export type ExtendSubscriptionResult = {
  customerId: string;
  extensionDays: number;
  previousExpiresAt: string;
  newExpiresAt: string;
  planId: string;
  planName: string | null;
};

/**
 * Dastur §5 — Call Center Ops Dashboard (3 KPI cards).
 * GET /api/call-center/operations-summary — CALL_CENTER + OWNER.
 */
export type CallCenterOperationsSummary = {
  totalMarketDebtKd: string;
  debtCollectedTodayKd: string;
  pendingLinksCount: number;
  dayIso: string;
};

/**
 * Dastur §5 — Owner Debt Recovery Report (time-series).
 * GET /api/call-center/debt-recovery-report — OWNER only.
 */
export type DebtRecoveryDayRow = {
  dayIso: string;
  recoveredKd: string;
  settlementCount: number;
  subscriptionCount: number;
};

export type DebtRecoveryReport = {
  from: string;
  to: string;
  totalRecoveredKd: string;
  days: DebtRecoveryDayRow[];
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
    salePrice: string;
    actualBalance: string;
  };
  wallet: { balance: string; debt: string };
  settlement: SubscriptionActivationSettlement;
};

export type LaundryPriceTier =
  | 'NORMAL'
  | 'URGENT'
  | 'PRESS_ONLY'
  | 'URGENT_PRESS';

export type LaundryItemCategoryRow = {
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
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly: string | null;
  priceUrgentPress: string | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryNameAr?: string | null;
  categoryNameEn?: string | null;
  categorySortOrder?: number | null;
};

// ── Dastur §4 Smart Inventory ───────────────────────────────────────────────

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type InventoryCategoryRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
};

export type StockItemRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  categoryId: string | null;
  categoryNameAr: string | null;
  reorderPointDefault: string;
  lastUnitCost: string | null;
  isActive: boolean;
};

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
};

export type InventoryReportRow = {
  id: string;
  stockItemId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  categoryId: string | null;
  categoryNameAr: string | null;
  categoryNameEn: string | null;
  branchId: string;
  branchName: string;
  quantityOnHand: string;
  reorderPointEffective: string;
  avgUnitCost: string | null;
  lastUnitCost: string | null;
  lastMovementAt: string | null;
  status: InventoryStatus;
};

export type InventoryReportSummary = {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inventoryValueKd: string;
};

export type InventoryReportResponse = {
  rows: InventoryReportRow[];
  summary: InventoryReportSummary;
};

export type InventoryReportFilters = {
  categoryId?: string;
  branchId?: string;
  status?: InventoryStatus;
};

export function getInventoryReport(
  token: string,
  filters: InventoryReportFilters,
) {
  const qs = new URLSearchParams();
  if (filters.categoryId) qs.set('categoryId', filters.categoryId);
  if (filters.branchId) qs.set('branchId', filters.branchId);
  if (filters.status) qs.set('status', filters.status);
  const search = qs.toString();
  return apiJson<InventoryReportResponse>(
    `/api/inventory/report${search ? `?${search}` : ''}`,
    { token },
  );
}

export function listInventoryCategories(token: string) {
  return apiJson<InventoryCategoryRow[]>('/api/inventory/categories', { token });
}

export function listStockItems(token: string) {
  return apiJson<StockItemRow[]>('/api/inventory/items', { token });
}

export function listSuppliers(token: string) {
  return apiJson<SupplierRow[]>('/api/inventory/suppliers', { token });
}

export type StockInPayload = {
  stockItemId: string;
  branchId: string;
  quantity: number;
  unitCost: number;
  supplierId?: string;
  supplierName?: string;
  reference?: string;
  note?: string;
  receiptUrl?: string;
};

export type StockInResponse = {
  id: string;
  stockItemId: string;
  branchId: string;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  supplierId: string | null;
  reference: string | null;
  newQuantityOnHand: string;
  newAvgUnitCost: string;
  createdAt: string;
};

export function recordStockIn(token: string, body: StockInPayload) {
  return apiJson<StockInResponse>('/api/inventory/stock-in', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

/** OWNER-only — partial update of a master `LaundryPriceListItem`. */
export type UpdateLaundryPriceItemPayload = {
  nameAr?: string;
  nameEn?: string | null;
  sortOrder?: number;
  manualEntry?: boolean;
  priceNormal?: number;
  priceUrgent?: number;
  pricePressOnly?: number | null;
  priceUrgentPress?: number | null;
  categoryId?: string | null;
};

export function updateLaundryPriceItem(
  token: string,
  id: string,
  body: UpdateLaundryPriceItemPayload,
) {
  return apiJson<LaundryPriceListItemRow>(
    `/api/laundry-price-list/items/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
  );
}

/** OWNER-only — partial update of a `LaundryItemCategory`. */
export type UpdateLaundryCategoryPayload = {
  nameAr?: string;
  nameEn?: string | null;
  sortOrder?: number;
};

export function updateLaundryCategory(
  token: string,
  id: string,
  body: UpdateLaundryCategoryPayload,
) {
  return apiJson<LaundryItemCategoryRow>(
    `/api/laundry-price-list/categories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
  );
}

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
  expenseMethod?: 'CASH' | 'PREPAID_CARD';
  status: 'PENDING_ACCOUNTANT' | 'APPROVED' | 'REJECTED' | 'AUDIT';
  note: string | null;
  receiptUrl: string | null;
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
  branch: { id: string; name: string } | null;
};

export function getPendingExpenseApprovals(token: string) {
  return apiJson<ExpenseRow[]>(`${API_EXPENSES}/pending-approval`, { token });
}

export function updateExpenseStatus(
  token: string,
  id: string,
  status: ExpenseRow['status'],
) {
  return apiJson<ExpenseRow>(`${API_EXPENSES}/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status }),
  });
}

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
  driverId?: string | null;
  grossRevenueKd: string;
  variableSoapFuelKd: string;
  miscOperationalKd: string;
  fixedExpensesKd: string;
  subscriptionSubsidyKd: string;
  enterpriseSubscriptionSubsidyKd: string;
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

// ---------------------------------------------------------------------------
// Dastur §3 — Manager Cash Custody (director-level accountability).
// ---------------------------------------------------------------------------

export type ManagerCashCustodyStatus =
  | 'PENDING_DEPOSIT'
  | 'AWAITING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED';

export type ManagerCashCustodyRow = {
  id: string;
  managerId: string;
  managerName: string;
  managerUsername: string;
  managerPhone: string | null;
  driverId: string;
  driverName: string;
  driverUsername: string;
  branchId: string | null;
  branchName: string | null;
  shiftId: string | null;
  amountKd: string;
  settledOrderCount: number;
  status: ManagerCashCustodyStatus;
  receivedFromDriverAt: string;
  slipUploadedAt: string | null;
  depositSlipUrl: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  ageHours: number;
  isOverdue: boolean;
};

export type ManagerCustodyAgingSummary = {
  pendingCount: number;
  awaitingVerificationCount: number;
  overdueCount: number;
  totalPendingKd: string;
  totalOverdueKd: string;
  bucket: { FRESH: number; WARNING_12H: number; OVERDUE_24H: number };
};

export type ManagerCustodyAgingResponse = {
  rows: ManagerCashCustodyRow[];
  summary: ManagerCustodyAgingSummary;
};

/**
 * MANAGER — approve receipt of cash from a driver.
 * The 24h aging clock starts now. No deposit slip required at this step.
 */
export function approveReceiptFromDriver(
  token: string,
  body: {
    driverId: string;
    declaredHandoverTotal?: number;
    note?: string;
  },
) {
  return apiJson<ManagerCashCustodyRow>('/api/manager-custody/approve-receipt', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

/** MANAGER — list my custody bags (all statuses, most recent first). */
export function listMyManagerCustody(token: string) {
  return apiJson<ManagerCashCustodyRow[]>('/api/manager-custody/mine', {
    token,
  });
}

/** MANAGER — attach an already-uploaded deposit slip URL to a custody bag. */
export function attachDepositSlip(
  token: string,
  custodyId: string,
  body: {
    depositSlipUrl: string;
    declaredDepositTotal?: number;
    note?: string;
  },
) {
  return apiJson<ManagerCashCustodyRow>(
    `/api/manager-custody/${custodyId}/upload-slip`,
    { method: 'POST', body: JSON.stringify(body), token },
  );
}

/** MANAGER — upload the slip image (multipart); returns the URL for attachDepositSlip. */
export async function uploadDepositSlipImage(
  token: string,
  file: File,
): Promise<{ depositSlipUrl: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(buildUrl('/api/manager-custody/upload-slip-image'), {
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
    throw new ApiError('Invalid API response (missing data)', res.status);
  }
  return json.data as { depositSlipUrl: string };
}

/** ACCOUNTANT — approve deposit slip → custody VERIFIED. */
export function verifyManagerCustody(
  token: string,
  custodyId: string,
  body?: { note?: string },
) {
  return apiJson<ManagerCashCustodyRow>(
    `/api/manager-custody/${custodyId}/verify`,
    { method: 'POST', body: JSON.stringify(body ?? {}), token },
  );
}

/** ACCOUNTANT — reject deposit slip → custody back to PENDING_DEPOSIT. */
export function rejectManagerCustody(
  token: string,
  custodyId: string,
  body: { rejectionReason: string },
) {
  return apiJson<ManagerCashCustodyRow>(
    `/api/manager-custody/${custodyId}/reject`,
    { method: 'POST', body: JSON.stringify(body), token },
  );
}

/**
 * OWNER / ACCOUNTANT — "Cash Held by Managers" aging report.
 * Rows with `isOverdue === true` (>=24h, not VERIFIED) should be highlighted RED.
 */
export function getManagerCustodyAging(
  token: string,
  filters?: {
    status?: ManagerCashCustodyStatus;
    managerId?: string;
    branchId?: string;
  },
) {
  const q = new URLSearchParams();
  if (filters?.status) q.set('status', filters.status);
  if (filters?.managerId) q.set('managerId', filters.managerId);
  if (filters?.branchId) q.set('branchId', filters.branchId);
  const qs = q.toString();
  return apiJson<ManagerCustodyAgingResponse>(
    `/api/manager-custody/aging${qs ? `?${qs}` : ''}`,
    { token },
  );
}
