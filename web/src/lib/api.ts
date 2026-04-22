export type SafariRole =
  | 'OWNER'
  | 'GENERAL_MANAGER'
  | 'MANAGER'
  | 'DRIVER'
  | 'CALL_CENTER'
  | 'CALL_CENTER_SUPERVISOR'
  | 'FLEET_SUPERVISOR'
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
  refKind: 'ORDER' | 'EXPENSE' | 'DEPOSIT' | 'GL';
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
  /**
   * The driver's OPEN shift at handover time (stamped as an audit link on
   * the flipped orders). Null when no shift was open — cash handover is
   * independent of the shift cycle per Dastur §3.
   */
  shiftId: string | null;
  bankDepositReceiptUrl: string | null;
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

/**
 * A3.D8 — Consolidated cash snapshot. Every pool of KD the institution
 * holds summed to a single total, with a breakdown for audit.
 */
export type ConsolidatedCashSnapshot = {
  atIso: string;
  driverFieldCashKd: string;
  managerCustodyPendingKd: string;
  branchWalletsKd: string;
  unverifiedBankDepositsKd: string;
  totalKd: string;
  breakdown: {
    driverCount: number;
    custodyBagCount: number;
    branchWalletCount: number;
    unverifiedBankDepositCount: number;
  };
};

export function getConsolidatedCashSnapshot(token: string) {
  return apiJson<ConsolidatedCashSnapshot>('/api/finance/consolidated-cash', {
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

// V19.10 — per-driver cash trace (collected → manager custody → bank).
export type DriverCashTraceBag = {
  id: string;
  amountKd: string;
  settledOrderCount: number;
  status:
    | 'PENDING_DEPOSIT'
    | 'AWAITING_VERIFICATION'
    | 'VERIFIED'
    | 'REJECTED';
  managerId: string | null;
  managerName: string | null;
  managerUsername: string | null;
  branchId: string | null;
  branchName: string | null;
  receivedFromDriverAt: string;
  slipUploadedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
};

export type DriverCashTraceDriver = {
  driverId: string;
  username: string;
  fullName: string;
  branchId: string | null;
  branchName: string | null;
  collectedKd: string;
  collectedOrderCount: number;
  handedToManagerKd: string;
  handedToManagerBagCount: number;
  pendingWithDriverKd: string;
  atBankKd: string;
  pendingAtManagerKd: string;
  awaitingVerificationKd: string;
  rejectedKd: string;
  bags: DriverCashTraceBag[];
};

export type DriverCashTraceResponse = {
  range: { from: string; to: string };
  kpis: {
    totalCollectedKd: string;
    totalHandedToManagerKd: string;
    totalAtBankKd: string;
    totalPendingWithDriverKd: string;
    totalPendingAtManagerKd: string;
    totalAwaitingVerificationKd: string;
    totalRejectedKd: string;
    totalCollectedOrderCount: number;
    totalBagCount: number;
  };
  drivers: DriverCashTraceDriver[];
};

export function getDriverCashTrace(
  token: string,
  params: { from: string; to: string; driverId?: string; branchId?: string },
) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.driverId) search.set('driverId', params.driverId);
  if (params.branchId) search.set('branchId', params.branchId);
  return apiJson<DriverCashTraceResponse>(
    `/api/finance/reports/driver-cash-trace?${search.toString()}`,
    { token },
  );
}

// V19.10 — Unpaid invoices list (قائمة مديونيات الفواتير).
export type UnpaidInvoiceRow = {
  orderId: string;
  serialNumber: string | null;
  invoiceNumber: string | null;
  issuedAt: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerPhone2: string | null;
  branchId: string | null;
  branchName: string | null;
  actorUserId: string | null;
  actorUserName: string | null;
  actorUserRole: string | null;
  invoiceTotalKd: string;
  debtAmountKd: string;
  paidKd: string;
  remainingKd: string;
  entryCount: number;
  currentCustomerDebtKd: string;
  isOpen: boolean;
  lastEntryAt: string;
};

export type UnpaidInvoicesKpis = {
  invoiceCount: number;
  openInvoiceCount: number;
  customerCount: number;
  openCustomerCount: number;
  totalInvoicesKd: string;
  totalDebtKd: string;
  totalPaidKd: string;
  openDebtKd: string;
  avgDebtPerInvoiceKd: string;
};

export type UnpaidInvoicesResponse = {
  from: string | null;
  to: string | null;
  kpis: UnpaidInvoicesKpis;
  rows: UnpaidInvoiceRow[];
};

export function getUnpaidInvoices(
  token: string,
  params: {
    from?: string;
    to?: string;
    branchId?: string;
    actorUserId?: string;
    customerPhone?: string;
  },
) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.branchId) search.set('branchId', params.branchId);
  if (params.actorUserId) search.set('actorUserId', params.actorUserId);
  if (params.customerPhone)
    search.set('customerPhone', params.customerPhone);
  const qs = search.toString();
  return apiJson<UnpaidInvoicesResponse>(
    `/api/finance/reports/unpaid-invoices${qs ? `?${qs}` : ''}`,
    { token },
  );
}

// DUSTUR §2 — automatic midnight-to-midnight shift cycle (Kuwait time).
export type ShiftCycleSnapshot = {
  timezone: string;
  cycleStartAt: string;
  cycleEndAt: string;
  nextCycleAt: string;
  driversOnShift: number;
  activeDriversTotal: number;
  staleOpenShifts: number;
};

export type RecentShiftCycleRow = {
  cycleStartAt: string;
  cycleEndAt: string;
  shiftsOpened: number;
  shiftsClosed: number;
};

export function getCurrentShiftCycle(token: string) {
  return apiJson<ShiftCycleSnapshot>('/api/shifts/cycle/current', { token });
}

export function getRecentShiftCycles(token: string, days = 7) {
  return apiJson<RecentShiftCycleRow[]>(
    `/api/shifts/cycle/recent?days=${encodeURIComponent(String(days))}`,
    { token },
  );
}

export function runShiftCycleNow(token: string) {
  return apiJson<{ closed: number; opened: number; cycleStartAt: string }>(
    '/api/shifts/cycle/run-now',
    { token, method: 'POST', body: '{}' },
  );
}

// Dastur §3.8 — order-serial gap monitor (Owner Serials island).
export type SerialGapReport = {
  scannedAtIso: string;
  currentCounter: number;
  presentCount: number;
  gapCount: number;
  firstGaps: number[];
  allGapsTruncated: boolean;
};

export type SerialGapLatest = {
  latest: {
    report: SerialGapReport;
    hadGaps: boolean;
    recordedAtIso: string;
  } | null;
};

export function getLatestSerialGapReport(token: string) {
  return apiJson<SerialGapLatest>('/api/owner/serials/gaps', { token });
}

export function scanSerialGapsNow(token: string) {
  return apiJson<SerialGapReport>('/api/owner/serials/gaps/scan-now', {
    token,
    method: 'POST',
    body: '{}',
  });
}

/* ── Debt Transfer (Dastur §5) ───────────────────────────────────────── */

export type DebtTransferStatus =
  | 'DRAFT'
  | 'AWAITING_SIGNATURES'
  | 'COMPLETED'
  | 'CANCELLED';

export type DebtTransferParticipant = {
  id: string;
  username: string;
  fullName: string;
  safariRole: SafariRole;
  branchId?: string | null;
};

export type DebtTransferOrderLine = {
  id: string;
  amountSnapshot: string;
  order: {
    id: string;
    invoiceNumber: string | null;
    serialNumber: string | null;
    status: string;
    cashStatus: string;
    totalPrice: string;
    posPaymentMethod: string | null;
    completedAt: string | null;
    customer: {
      id: string;
      displayName: string | null;
      phone: string;
    };
  };
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
  executedBy: DebtTransferParticipant;
  executedByRole: SafariRole;
  sourceSignedAt: string | null;
  targetSignedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  cancelledBy: DebtTransferParticipant | null;
  systemSignature: string | null;
  createdAt: string;
  updatedAt: string;
  orders: DebtTransferOrderLine[];
};

export type DebtTransferListResponse = {
  total: number;
  limit: number;
  offset: number;
  rows: DebtTransferRow[];
};

export type DebtTransferListFilters = {
  status?: DebtTransferStatus;
  sourceDriverId?: string;
  targetDriverId?: string;
  executedById?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type DriverOutstanding = {
  driverId: string;
  orderCount: number;
  totalAmount: string;
  orders: Array<{
    id: string;
    invoiceNumber: string | null;
    serialNumber: string | null;
    totalPrice: string;
    posPaymentMethod: string | null;
    completedAt: string | null;
    customer: {
      id: string;
      displayName: string | null;
      phone: string;
    };
  }>;
};

export type CreateDebtTransferInput = {
  sourceDriverId: string;
  targetDriverId: string;
  orderIds: string[];
  reason?: string;
  notes?: string;
};

function buildQuery(
  filters: Record<string, string | number | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function listDebtTransfers(
  token: string,
  filters: DebtTransferListFilters = {},
) {
  return apiJson<DebtTransferListResponse>(
    `/api/debt-transfers${buildQuery(filters)}`,
    { token },
  );
}

export function listMyDebtTransfers(token: string) {
  return apiJson<{ rows: DebtTransferRow[] }>('/api/debt-transfers/mine', {
    token,
  });
}

export function listDebtTransferDrivers(token: string) {
  return apiJson<{
    drivers: Array<{
      id: string;
      fullName: string;
      username: string;
      safariRole: SafariRole;
      branchId: string | null;
    }>;
  }>('/api/debt-transfers/drivers', { token });
}

export function getDebtTransfer(token: string, id: string) {
  return apiJson<DebtTransferRow>(`/api/debt-transfers/${id}`, { token });
}

export function getDriverOutstandingOrders(token: string, driverId: string) {
  return apiJson<DriverOutstanding>(
    `/api/debt-transfers/drivers/${driverId}/outstanding`,
    { token },
  );
}

export function createDebtTransfer(
  token: string,
  input: CreateDebtTransferInput,
) {
  return apiJson<DebtTransferRow>('/api/debt-transfers', {
    token,
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function finalizeDebtTransfer(token: string, id: string) {
  return apiJson<DebtTransferRow>(`/api/debt-transfers/${id}/finalize`, {
    token,
    method: 'POST',
    body: '{}',
  });
}

export function cancelDebtTransfer(
  token: string,
  id: string,
  reason: string | null,
) {
  return apiJson<DebtTransferRow>(`/api/debt-transfers/${id}/cancel`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? undefined }),
  });
}

export function signDebtTransferSource(token: string, id: string) {
  return apiJson<DebtTransferRow>(`/api/debt-transfers/${id}/sign/source`, {
    token,
    method: 'POST',
    body: '{}',
  });
}

export function signDebtTransferTarget(token: string, id: string) {
  return apiJson<DebtTransferRow>(`/api/debt-transfers/${id}/sign/target`, {
    token,
    method: 'POST',
    body: '{}',
  });
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
  // V19.7.5 — serialNumber + completedAt are already returned by
  // `/api/orders/:id` (see `orderDetailSelect` in orders.service.ts).
  // Surfacing them on the type so the invoice-print page can render a
  // human-readable document number + completion timestamp without a
  // bespoke DTO.
  serialNumber?: string | null;
  completedAt?: string | null;
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
    branch: { id: string; name: string } | null;
  } | null;
  lineItems: {
    id: string;
    label: string | null;
    quantity: string;
    unitPrice: string;
    // Starch preference is optional per-line metadata captured at the
    // POS; the invoice page prints it as a small chip next to the
    // item so the customer can verify their request.
    starchOption?: string | null;
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
  /**
   * V19.4 — CC pack #1. Customer's current outstanding debt (KWD 4dp).
   * Drives the "Pay part of debt" card in the Manage-Account dialog;
   * when "0.0000" the card is hidden.
   */
  debt: string;
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
  /**
   * V1.6.8 — minutes until the cooldown lifts. Preferred by the
   * Collections toast because the order-reminder window is 2.5 h
   * (9_000_000 ms). Null mirrors `hoursUntilNext` semantics.
   */
  minutesUntilNext: number | null;
};

/**
 * V1.6.9 — "تم الدفع" confirmation.
 *
 * The Call Center agent picks the method the customer actually used.
 * Subscription-wallet and debt-on-account are NOT offered here because
 * they are closed through their own workflows (activation / POS).
 */
export type MarkPaidMethod = 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE';

export type MarkOrderPaidResult = {
  orderId: string;
  alreadySettled: boolean;
  amountKd: string;
  posPaymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'DEBT_ON_ACCOUNT'
    | 'ONLINE';
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

/**
 * V19.11.4 — NET open debt grouped by the invoice's original issuer.
 * Σ rows[].openDebtKd === /unpaid-invoices openDebtKd === /collections
 * totalMarketDebtKd, so the dashboard's distribution chart reconciles
 * with every other debt screen.
 */
export type OpenDebtByIssuerReport = {
  rows: Array<{
    issuer: 'DRIVER' | 'BRANCH' | 'OTHER';
    openDebtKd: string;
    openInvoiceCount: number;
    openCustomerCount: number;
  }>;
  totalOpenDebtKd: string;
  openInvoiceCount: number;
  openCustomerCount: number;
  computedAt: string;
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
/**
 * V1.5.6 — every uncollected invoice, regardless of payment method.
 * `paymentUrl` is nullable because only ONLINE/PAYMENT_LINK rows have one.
 */
export type CollectionUnpaidOnlineRow = {
  orderId: string;
  /**
   * V1.6.5 — human-readable ID: driver `serialNumber` if set, otherwise
   * the paper `invoiceNumber`, otherwise `#<last-6 of uuid>`. Safe to
   * render as-is in the table.
   */
  readableId: string;
  /**
   * V1.6.6 — raw paper invoice number when present (nullable). Used by
   * the WhatsApp template's "رقم الفاتورة" line; falls back to
   * `readableId` in the UI layer when null.
   */
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string;
  /** KWD 3-decimal precision (fils), e.g. "2.400". */
  amountKd: string;
  paymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'DEBT_ON_ACCOUNT'
    | 'ONLINE'
    | null;
  paymentUrl: string | null;
  createdAtIso: string;
  invoiceAgeDays: number;
  reminderCount: number;
  lastReminderAtIso: string | null;
  canRemindNow: boolean;
  /**
   * V19.4 — CC pack #5. Branch + driver names enrich the WhatsApp
   * template and the Collections table so the customer sees which
   * branch the debt originated from and the agent can cross-check
   * the driver who delivered the order. Nullable because legacy
   * office bookings may lack a driver, and older customers may
   * predate `originBranchId` tracking.
   */
  branchName: string | null;
  driverName: string | null;
  /**
   * V1.6.6 — itemized breakdown for the WhatsApp template's Items List.
   * Quantity is a decimal string; prices are serialized in KWD 3dp.
   */
  lineItems: {
    label: string | null;
    quantity: string;
    unitPriceKd: string;
    lineTotalKd: string;
  }[];
};

/**
 * V3.8 — Driver island "Field Collection Tracker" row
 * (`GET /api/orders/driver/pending-invoices`).
 *
 * Read-only projection of the driver's own unpaid non-canceled orders.
 * Strictly isolated from the Call Center debt-recovery workflow —
 * there is no `paymentUrl`, no `reminderCount`, and no WhatsApp hook.
 */
export type DriverPendingInvoiceRow = {
  orderId: string;
  /** Human-readable: serialNumber → invoiceNumber → `#<last-6 uuid>`. */
  readableId: string;
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string;
  /** KWD 3-decimal precision (fils), e.g. "2.400". */
  amountKd: string;
  paymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'DEBT_ON_ACCOUNT'
    | 'ONLINE'
    | null;
  /** Full free-text notes from the Order row (driver-facing). */
  notes: string | null;
  /** Raw Prisma OrderStatus so the UI can localise the badge label. */
  orderStatus:
    | 'PENDING'
    | 'PICKED_UP'
    | 'IN_PROGRESS'
    | 'OUT_FOR_DELIVERY'
    | 'COMPLETED'
    | 'CANCELED';
  /**
   * true when the order is COMPLETED but cash is still UNPAID — the
   * badge flips from "Unpaid" to "Pending Approval" in this state.
   */
  pendingApproval: boolean;
  createdAtIso: string;
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
  /** Narrow "collected via payment link today" — historical green KPI. */
  debtCollectedTodayKd: string;
  /**
   * A3.D10 — broad "debt recovered today" matching the Owner Debt
   * Recovery Report formula (ORDER_WALLET_SETTLEMENT +
   * SUBSCRIPTION_ACTIVATION, Kuwait-local today). Added so the Call
   * Center and the Owner report display identical numbers for the same
   * window.
   */
  debtRecoveredTodayKd: string;
  pendingLinksCount: number;
  /** Reference day in Kuwait-local (UTC+3) timezone, YYYY-MM-DD. */
  dayIso: string;
  /** V1.6.1 — echoed branch filter; `null` = "All Branches". */
  branchId: string | null;
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
  /**
   * V19.4 — CC pack #2. Identifier of the freshly-opened
   * `CustomerSubscription` row; undefined on legacy clients that haven't
   * been redeployed after the rollover migration.
   */
  subscriptionId?: string;
  /**
   * Predecessor subscription id when a rollover happened, null otherwise.
   */
  rolledOverFromSubscriptionId?: string | null;
  /**
   * Signed string (4dp). + credit carried, - debt carried, '0.0000' none.
   */
  carriedBalanceKd?: string;
};

/**
 * V19.4 — CC pack #1. Request body for
 * `POST /api/call-center/customers/:id/partial-debt-payment`.
 *
 * `discountKd` is optional — omit (or send '0') for a straight
 * collection. The server enforces `amount + discount <= wallet.debt`
 * and rejects an all-zero pair.
 */
export type RecordPartialDebtPaymentRequest = {
  amountKd: string;
  discountKd?: string;
  paymentMethod: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE';
  note?: string;
};

/**
 * V19.4 — CC pack #1. Response from the partial-debt-payment endpoint;
 * the UI toast renders the breakdown and refreshes the wallet snapshot.
 */
export type RecordPartialDebtPaymentResponse = {
  amountCollectedKd: string;
  discountAppliedKd: string;
  totalReducedKd: string;
  previousDebtKd: string;
  newDebtKd: string;
  walletBalanceKd: string;
  paymentMethod: 'CASH' | 'KNET' | 'PAYMENT_LINK' | 'ONLINE';
};

/**
 * V19.4 — CC pack #2. Read-only preview shape returned by
 * `GET /api/call-center/customers/:id/subscription-rollover-preview`.
 */
export type SubscriptionRolloverPreview = {
  hasPrevious: boolean;
  carriedBalanceKd?: string;
  previousPlanName?: string;
  previousActivatedAtIso?: string;
  previousExpiresAtIso?: string;
  currentWalletBalanceKd?: string;
  currentWalletDebtKd?: string;
};

/**
 * V19.4 — CC pack #11/#12. One entry in a customer's subscription chain.
 */
export type CustomerSubscriptionRow = {
  id: string;
  status:
    | 'ACTIVE'
    | 'EXPIRED'
    | 'ROLLED_OVER'
    | 'CUT_OFF'
    | 'CANCELLED';
  planNameSnapshot: string;
  planSalePriceSnapshot: string;
  planActualBalanceSnapshot: string;
  planValidityDaysSnapshot: number;
  carriedBalanceKd: string;
  parentSubscriptionId?: string;
  activatedAtIso: string;
  expiresAtIso: string;
  closedAtIso?: string;
  closedReason?: string;
  invoices: Array<{
    orderId: string;
    invoiceNumber?: string;
    totalPriceKd: string;
    status: string;
    cashStatus: string;
    createdAtIso: string;
    completedAtIso?: string;
  }>;
};

/**
 * V19.4 — CC pack #8 + #10 + #11. Unified "customer 360" ledger.
 * Feeds the Customers-page Ledger tab (timeline + invoices + cut-off
 * banner) with a single round-trip.
 */
export type CustomerLedgerEventKind =
  | 'SUBSCRIPTION_ACTIVATION'
  | 'SUBSCRIPTION_ROLLOVER_CARRY'
  | 'ORDER_SETTLEMENT'
  | 'PARTIAL_DEBT_PAYMENT';

export type CustomerLedgerActivationBreakdown = {
  totalCollectedKd: string;
  actualBalanceKd: string;
  subsidyKd: string;
  debtSettledKd: string;
  creditedToBalanceKd: string;
  carriedBalanceKd: string;
};

export type CustomerLedgerClosedInvoice = {
  id: string;
  serial: string | null;
  totalKd: string;
  createdAtIso: string;
};

export type CustomerLedgerEvent = {
  id: string;
  atIso: string;
  rawType: 'SUBSCRIPTION_ACTIVATION' | 'ORDER_WALLET_SETTLEMENT';
  kind: CustomerLedgerEventKind;
  amountKd: string;
  balanceBeforeKd: string;
  balanceAfterKd: string;
  debtBeforeKd: string;
  debtAfterKd: string;
  debtSettledKd: string;
  debtDiscountKd: string;
  paymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'ONLINE'
    | null;
  orderId: string | null;
  orderSerial: string | null;
  subscriptionId: string | null;
  subscriptionLabel: string | null;
  performedByUserId: string | null;
  performedByName: string | null;
  performedByRole: string | null;
  note: string | null;
  activationBreakdown: CustomerLedgerActivationBreakdown | null;
  closedInvoices: CustomerLedgerClosedInvoice[];
};

export type CustomerLedgerInvoice = {
  id: string;
  serial: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
  totalKd: string;
  status: string;
  cashStatus: string;
  paymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'ONLINE'
    | null;
  driverName: string | null;
  branchName: string | null;
  subscriptionId: string | null;
  subscriptionStatus:
    | 'ACTIVE'
    | 'EXPIRED'
    | 'ROLLED_OVER'
    | 'CUT_OFF'
    | 'CANCELLED'
    | null;
  subscriptionLabel: string | null;
  issuedWhileCutOff: boolean;
  openDebt: boolean;
};

export type CustomerLedgerResponse = {
  customer: {
    id: string;
    displayName: string | null;
    phone: string | null;
    phone2: string | null;
    originBranchId: string | null;
    originBranchName: string | null;
    walletBalanceKd: string;
    walletDebtKd: string;
  };
  activeSubscription: {
    id: string;
    status: 'ACTIVE' | 'EXPIRED' | 'ROLLED_OVER' | 'CUT_OFF' | 'CANCELLED';
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
  } | null;
  isCutOff: boolean;
  fromIso: string | null;
  toIso: string | null;
  events: CustomerLedgerEvent[];
  invoices: CustomerLedgerInvoice[];
  totals: {
    eventCount: number;
    invoiceCount: number;
    openInvoiceCount: number;
    totalCollectedKd: string;
    totalDiscountedKd: string;
  };
};

/**
 * V19.8.9 — Response for
 * `POST /api/call-center/customers/:id/statement-share-link`.
 * A signed URL (7-day TTL) the Call Center forwards over WhatsApp so
 * the customer can view and save their statement as PDF from their
 * own device (wa.me itself cannot attach files).
 */
export type CustomerStatementShareLink = {
  token: string;
  shareUrl: string;
  expiresAtIso: string;
};

export function createCustomerStatementShareLink(
  token: string | null,
  customerId: string,
  params: { from?: string | null; to?: string | null },
): Promise<CustomerStatementShareLink> {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return apiJson<CustomerStatementShareLink>(
    `/api/call-center/customers/${customerId}/statement-share-link${qs ? `?${qs}` : ''}`,
    { method: 'POST', token },
  );
}

export function getPublicCustomerStatement(
  shareToken: string,
): Promise<CustomerLedgerResponse> {
  return apiJson<CustomerLedgerResponse>(
    `/api/public/statement/${encodeURIComponent(shareToken)}`,
  );
}

/**
 * V1.7.0 — Public payment status for the customer-facing
 * /payment/success and /payment/failed return pages. No auth —
 * the customer holding the UPayments return URL polls this every
 * few seconds until `isPaid` flips to `true` (gateway callback
 * has finalized the order on the server).
 */
export type PublicPaymentStatus = {
  orderId: string;
  status:
    | 'PENDING'
    | 'PICKED_UP'
    | 'IN_PROGRESS'
    | 'OUT_FOR_DELIVERY'
    | 'COMPLETED'
    | 'CANCELED';
  isPaid: boolean;
  amountKd: string;
};

export function getPublicPaymentStatus(
  orderId: string,
): Promise<PublicPaymentStatus> {
  return apiJson<PublicPaymentStatus>(
    `/api/payments/status/${encodeURIComponent(orderId)}`,
  );
}

/**
 * V19.4 — CC pack #4. Daily collector feed for the Collections page
 * activity panel. Covers every debt-reducing event in the Kuwait-local
 * day window (partial debt payments + full settlements + mark-paid-via-link).
 */
export type DailyCollectionEvent = {
  id: string;
  atIso: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  orderId: string | null;
  orderSerial: string | null;
  amountCollectedKd: string;
  discountAppliedKd: string;
  paymentMethod:
    | 'SUBSCRIPTION_WALLET'
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'ONLINE'
    | null;
  kind: 'PARTIAL_DEBT_PAYMENT' | 'FULL_ORDER_SETTLEMENT';
  performedByUserId: string | null;
  performedByName: string | null;
  performedByRole: string | null;
  branchName: string | null;
  driverName: string | null;
  note: string | null;
  customerDebtAfterKd: string;
};

export type DailyCollectionsAgentTotal = {
  agentId: string | null;
  agentName: string | null;
  agentRole: string | null;
  eventCount: number;
  uniqueCustomers: number;
  collectedKd: string;
  discountKd: string;
};

export type DailyCollectionsResponse = {
  dayIsoLocal: string;
  dayStartIso: string;
  dayEndIso: string;
  totals: {
    eventCount: number;
    uniqueCustomers: number;
    collectedKd: string;
    discountKd: string;
  };
  byAgent: DailyCollectionsAgentTotal[];
  events: DailyCollectionEvent[];
};

// V19.5 — CC reconciliation guard (TransactionHistory ↔ GeneralLedger).
// The Daily Collector Panel renders a ✓/⚠ badge based on `overallStatus`.
export type ReconciliationCheck = {
  id: string;
  status: 'MATCH' | 'DRIFT';
  transactionHistoryKd: string;
  generalLedgerKd: string;
  deltaKd: string;
  note: string;
};

export type DailyCollectionsReconciliationResponse = {
  dayIsoLocal: string;
  dayStartIso: string;
  dayEndIso: string;
  overallStatus: 'MATCH' | 'DRIFT';
  checks: ReconciliationCheck[];
  totals: {
    transactionHistory: { collectedKd: string; discountKd: string };
    generalLedger: { collectedKd: string; discountKd: string };
  };
  generatedAtIso: string;
};

// V19.4 CC pack #9 — "Convert debt → subscription" preview.
// Every monetary field is a 4dp-formatted string (internal KWD precision).
// The UI can render at 3dp by trimming the trailing zero.
export type DebtConversionPlanOption = {
  planId: string;
  planName: string;
  planValidityDays: number;
  cashRequiredKd: string;
  planActualBalanceKd: string;
  debtToSettleKd: string;
  remainingDebtKd: string;
  creditedToBalanceKd: string;
  projectedWalletBalanceKd: string;
  projectedWalletDebtKd: string;
  subsidyKd: string;
  convertsDebt: boolean;
  clearsAllDebt: boolean;
  recommended: boolean;
};

export type DebtConversionOptionsResponse = {
  customerId: string;
  currentDebtKd: string;
  currentBalanceKd: string;
  hasDebt: boolean;
  options: DebtConversionPlanOption[];
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
  isActive: boolean;
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

export type StockMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export type StockOutPayload = {
  stockItemId: string;
  branchId: string;
  quantity: number;
  reference?: string;
  note?: string;
};

export type StockAdjustmentPayload = {
  stockItemId: string;
  branchId: string;
  delta: number;
  reason: string;
  reference?: string;
};

export type StockTransferPayload = {
  stockItemId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  reference?: string;
  note?: string;
};

export type StocktakeLinePayload = {
  stockItemId: string;
  countedQuantity: number;
  note?: string;
};

export type StocktakePayload = {
  branchId: string;
  reference?: string;
  note?: string;
  lines: StocktakeLinePayload[];
};

export type StockMovementResult = {
  id: string;
  stockItemId: string;
  branchId: string;
  type: StockMovementType;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  reference: string | null;
  newQuantityOnHand: string;
  createdAt: string;
};

export function recordStockOut(token: string, body: StockOutPayload) {
  return apiJson<StockMovementResult>('/api/inventory/stock-out', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function recordStockAdjustment(token: string, body: StockAdjustmentPayload) {
  return apiJson<StockMovementResult>('/api/inventory/adjust', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function recordStockTransfer(token: string, body: StockTransferPayload) {
  return apiJson<{
    reference: string;
    out: StockMovementResult;
    in: StockMovementResult;
  }>('/api/inventory/transfer', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function submitStocktake(token: string, body: StocktakePayload) {
  return apiJson<{
    reference: string;
    branchId: string;
    totalLines: number;
    adjustedLines: number;
    results: Array<{
      stockItemId: string;
      counted: string;
      previous: string;
      delta: string;
      adjusted: boolean;
    }>;
  }>('/api/inventory/stocktake', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export type StockMovementRow = {
  id: string;
  type: StockMovementType;
  stockItem: { code: string; nameAr: string; nameEn: string | null; unit: string };
  branchName: string;
  supplierName: string | null;
  recordedBy: { fullName: string; username: string } | null;
  quantity: string;
  unitCost: string | null;
  totalCost: string | null;
  reference: string | null;
  note: string | null;
  receiptUrl: string | null;
  createdAt: string;
};

export type ListStockMovementsFilters = {
  branchId?: string;
  stockItemId?: string;
  type?: StockMovementType;
  from?: string;
  to?: string;
  limit?: number;
};

export function listStockMovements(
  token: string,
  filters: ListStockMovementsFilters = {},
) {
  const qs = new URLSearchParams();
  if (filters.branchId) qs.set('branchId', filters.branchId);
  if (filters.stockItemId) qs.set('stockItemId', filters.stockItemId);
  if (filters.type) qs.set('type', filters.type);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (filters.limit) qs.set('limit', String(filters.limit));
  const search = qs.toString();
  return apiJson<StockMovementRow[]>(
    `/api/inventory/movements${search ? `?${search}` : ''}`,
    { token },
  );
}

export type LowStockRow = {
  stockItemId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  branchId: string;
  branchName: string;
  quantityOnHand: string;
  reorderPoint: string;
  status: 'LOW_STOCK' | 'OUT_OF_STOCK';
};

export type LowStockResponse = {
  rows: LowStockRow[];
  summary: {
    total: number;
    outOfStock: number;
    lowStock: number;
    generatedAt: string;
  };
};

export function getLowStock(token: string, branchId?: string) {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return apiJson<LowStockResponse>(`/api/inventory/low-stock${qs}`, { token });
}

export function getLowStockLatestSnapshot(token: string) {
  return apiJson<{
    hadAlerts: boolean;
    recordedAtIso: string;
    report: LowStockResponse;
  } | null>('/api/inventory/low-stock/latest', { token });
}

export type CreateInventoryCategoryPayload = {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  sortOrder?: number;
};

export function createInventoryCategory(
  token: string,
  body: CreateInventoryCategoryPayload,
) {
  return apiJson<InventoryCategoryRow>('/api/inventory/categories', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export type CreateStockItemPayload = {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  unit?: string;
  categoryId?: string | null;
  reorderPointDefault?: number;
  isActive?: boolean;
};

export function createStockItem(token: string, body: CreateStockItemPayload) {
  return apiJson<StockItemRow>('/api/inventory/items', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export type CreateSupplierPayload = {
  name: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
};

export function createSupplier(token: string, body: CreateSupplierPayload) {
  return apiJson<SupplierRow>('/api/inventory/suppliers', {
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
  isActive?: boolean;
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

/** OWNER-only — create a new master `LaundryPriceListItem`. */
export type CreateLaundryPriceItemPayload = {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  categoryId?: string | null;
  sortOrder?: number;
  manualEntry?: boolean;
  priceNormal?: number;
  priceUrgent?: number;
  pricePressOnly?: number | null;
  priceUrgentPress?: number | null;
};

export function createLaundryPriceItem(
  token: string,
  body: CreateLaundryPriceItemPayload,
) {
  return apiJson<LaundryPriceListItemRow>('/api/laundry-price-list/items', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

/**
 * OWNER-only — hard delete a master tariff item. The server refuses with a
 * `400` when an existing order line still references the item by label; the
 * caller should then flip `isActive=false` via the update endpoint instead.
 */
export function deleteLaundryPriceItem(token: string, id: string) {
  return apiJson<{ deletedId: string }>(
    `/api/laundry-price-list/items/${encodeURIComponent(id)}`,
    { method: 'DELETE', token },
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

// ─── V19.10 — Fleet Supervisor / Vehicle Expenses ───────────────────
// Mounts on Nest `VehicleExpensesController` (`@Controller('vehicle-expenses')`).
export const API_VEHICLE_EXPENSES = '/api/vehicle-expenses';

export type VehicleExpenseStatus =
  | 'PENDING_ACCOUNTANT'
  | 'APPROVED'
  | 'REJECTED';

export type VehicleExpenseType =
  | 'FUEL'
  | 'OIL_CHANGE'
  | 'TIRES'
  | 'MECHANICAL_REPAIR'
  | 'ELECTRICAL_REPAIR'
  | 'BODY_REPAIR'
  | 'AC_REPAIR'
  | 'WASHING'
  | 'REGISTRATION'
  | 'INSURANCE'
  | 'SPARE_PARTS'
  | 'OTHER';

export type VehicleExpenseRow = {
  id: string;
  vehiclePlate: string;
  vehicleLabel: string | null;
  expenseType: VehicleExpenseType;
  amount: string;
  odometerKm: number | null;
  vendorName: string | null;
  description: string | null;
  status: VehicleExpenseStatus;
  receiptUrl: string;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: {
    id: string;
    fullName: string;
    username: string;
  };
  reviewedBy: {
    id: string;
    fullName: string;
    username: string;
  } | null;
};

export type VehicleExpenseCreateBody = {
  vehiclePlate: string;
  vehicleLabel?: string;
  expenseType: VehicleExpenseType;
  amount: number;
  odometerKm?: number;
  vendorName?: string;
  description?: string;
  expenseDate?: string;
  receiptUrl: string;
};

export type VehicleExpenseReport = {
  from: string;
  to: string;
  totalKd: string;
  count: number;
  byVehicle: Array<{
    vehiclePlate: string;
    vehicleLabel: string | null;
    amountKd: string;
    count: number;
  }>;
  byType: Array<{
    expenseType: VehicleExpenseType;
    amountKd: string;
    count: number;
  }>;
  byMonth: Array<{
    month: string;
    amountKd: string;
    count: number;
  }>;
};

export function createVehicleExpense(
  token: string,
  body: VehicleExpenseCreateBody,
) {
  return apiJson<VehicleExpenseRow>(API_VEHICLE_EXPENSES, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function listVehicleExpenses(
  token: string,
  params?: {
    from?: string;
    to?: string;
    status?: VehicleExpenseStatus;
    expenseType?: VehicleExpenseType;
    vehiclePlate?: string;
  },
) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.status) qs.set('status', params.status);
  if (params?.expenseType) qs.set('expenseType', params.expenseType);
  if (params?.vehiclePlate) qs.set('vehiclePlate', params.vehiclePlate);
  const qstr = qs.toString();
  return apiJson<VehicleExpenseRow[]>(
    `${API_VEHICLE_EXPENSES}${qstr ? `?${qstr}` : ''}`,
    { token },
  );
}

export function getPendingVehicleExpenseApprovals(token: string) {
  return apiJson<VehicleExpenseRow[]>(
    `${API_VEHICLE_EXPENSES}/pending-approval`,
    { token },
  );
}

export function updateVehicleExpenseStatus(
  token: string,
  id: string,
  payload: { status: VehicleExpenseStatus; rejectionReason?: string },
) {
  return apiJson<VehicleExpenseRow>(
    `${API_VEHICLE_EXPENSES}/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function getVehicleExpenseReport(
  token: string,
  params: { from: string; to: string },
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return apiJson<VehicleExpenseReport>(
    `${API_VEHICLE_EXPENSES}/report?${qs.toString()}`,
    { token },
  );
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
  /** V8.5 — KNET / card-link fees (reporting only). */
  bankFeesTotalKd: string;
  /** Gross completed sales minus bank fees (before soap/misc/payroll/fixed). */
  settledRevenueAfterBankFeesKd: string;
  variableSoapFuelKd: string;
  miscOperationalKd: string;
  fixedExpensesKd: string;
  subscriptionSubsidyKd: string;
  enterpriseSubscriptionSubsidyKd: string;
  payrollPaidKd: string;
  totalExpensesVariableAndFixedKd: string;
  netProfitKd: string;
};

/** Safe default so the Reports executive strip (incl. Bank fees) always renders before/after API. */
export const EMPTY_EXECUTIVE_SUMMARY_REPORT: ExecutiveSummaryReport = {
  from: '',
  to: '',
  branchId: null,
  driverId: null,
  grossRevenueKd: '0.0000',
  bankFeesTotalKd: '0.0000',
  settledRevenueAfterBankFeesKd: '0.0000',
  variableSoapFuelKd: '0.0000',
  miscOperationalKd: '0.0000',
  fixedExpensesKd: '0.0000',
  subscriptionSubsidyKd: '0.0000',
  enterpriseSubscriptionSubsidyKd: '0.0000',
  payrollPaidKd: '0.0000',
  totalExpensesVariableAndFixedKd: '0.0000',
  netProfitKd: '0.0000',
};

export type BankFeesByBranchResponse = {
  from: string;
  to: string;
  totalBankFeesKd: string;
  branches: Array<{ branchId: string | null; bankFeesKd: string }>;
};

/**
 * V19.13 — Monthly summary: one consolidated P&L + a row per branch.
 * Feeds the "الملخص الشهري" screen; all fields mirror
 * `ExecutiveSummaryReport` so cards render from the same helpers.
 */
export type MonthlySummaryBranchRow = {
  branchId: string;
  branchName: string;
  grossRevenueKd: string;
  bankFeesTotalKd: string;
  settledRevenueAfterBankFeesKd: string;
  variableSoapFuelKd: string;
  miscOperationalKd: string;
  fixedExpensesKd: string;
  payrollPaidKd: string;
  totalExpensesVariableAndFixedKd: string;
  subscriptionSubsidyKd: string;
  netProfitKd: string;
  /** V19.14 — collections health surfaced per branch. */
  collectedRevenueKd: string;
  uncollectedRevenueKd: string;
  /**
   * V19.14.3 — PAYMENT in range, order-linked only, invoice completedAt
   * strictly before report `from`. Excludes customer-level PAYMENT rows.
   */
  debtPaymentsReceivedKd: string;
  outstandingDebtKd: string;
};

export type MonthlySummaryReport = {
  from: string;
  to: string;
  consolidated: Omit<MonthlySummaryBranchRow, 'branchId' | 'branchName'>;
  branches: MonthlySummaryBranchRow[];
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

// ---------------------------------------------------------------------------
// Stage-D — Attendance module (DUSTUR §6).
// ---------------------------------------------------------------------------

export type AttendanceSource = 'SHIFT_AUTO' | 'BIOMETRIC' | 'MANUAL';

export type AttendanceRow = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  employeeId: string | null;
  branchId: string | null;
  branchName: string | null;
  /** Kuwait-local logical day YYYY-MM-DD. */
  date: string;
  checkInAtIso: string | null;
  checkOutAtIso: string | null;
  durationMinutes: number | null;
  source: AttendanceSource;
  externalRef: string | null;
  note: string | null;
};

export type AttendanceFilters = {
  from?: string;
  to?: string;
  userId?: string;
  branchId?: string;
  source?: AttendanceSource;
};

export function listAttendance(token: string, filters: AttendanceFilters = {}) {
  const qs = buildQuery(filters);
  return apiJson<AttendanceRow[]>(`/api/attendance${qs}`, { token });
}

export function upsertManualAttendance(
  token: string,
  dto: {
    userId: string;
    date: string;
    checkInAt?: string;
    checkOutAt?: string;
    note?: string;
  },
) {
  return apiJson<AttendanceRow>('/api/attendance/manual', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

export function runAttendanceSync(token: string, from: string, to: string) {
  const qs = buildQuery({ from, to });
  return apiJson<{ count: number }>(`/api/attendance/sync${qs}`, {
    method: 'POST',
    token,
  });
}

// ---------------------------------------------------------------------------
// Stage-B — server-side exports (Excel + PDF).
// Downloads a binary asset and triggers the browser Save dialog. We
// don't funnel these through `apiJson` because the response body is
// a stream, not JSON.
// ---------------------------------------------------------------------------

async function downloadBinary(
  path: string,
  token: string,
  fallbackFilename: string,
): Promise<void> {
  const res = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new ApiError(msg || `HTTP ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ExportInvoicesFilters = {
  from: string;
  to: string;
  driverId?: string;
  branchId?: string;
};

export function exportIssuedInvoicesXlsx(
  token: string,
  f: ExportInvoicesFilters,
) {
  return downloadBinary(
    `/api/exports/issued-invoices.xlsx${buildQuery(f)}`,
    token,
    'issued-invoices.xlsx',
  );
}

export function exportIssuedInvoicesPdf(
  token: string,
  f: ExportInvoicesFilters,
) {
  return downloadBinary(
    `/api/exports/issued-invoices.pdf${buildQuery(f)}`,
    token,
    'issued-invoices.pdf',
  );
}

export function exportUnifiedLedgerXlsx(
  token: string,
  f: ExportInvoicesFilters,
) {
  return downloadBinary(
    `/api/exports/unified-ledger.xlsx${buildQuery(f)}`,
    token,
    'unified-ledger.xlsx',
  );
}

export function exportAttendanceXlsx(
  token: string,
  f: { from?: string; to?: string; userId?: string; branchId?: string },
) {
  return downloadBinary(
    `/api/exports/attendance.xlsx${buildQuery(f)}`,
    token,
    'attendance.xlsx',
  );
}

export function exportPayrollXlsx(
  token: string,
  f: { from: string; to: string; branchId?: string },
) {
  return downloadBinary(
    `/api/exports/payroll.xlsx${buildQuery(f)}`,
    token,
    'payroll.xlsx',
  );
}

export function exportFinancialCycleXlsx(token: string, date?: string) {
  return downloadBinary(
    `/api/exports/financial-cycle.xlsx${buildQuery({ date })}`,
    token,
    'financial-cycle.xlsx',
  );
}

export function exportInventoryReportXlsx(
  token: string,
  f: InventoryReportFilters,
) {
  return downloadBinary(
    `/api/exports/inventory.xlsx${buildQuery(f)}`,
    token,
    'inventory.xlsx',
  );
}

export function exportStockMovementsXlsx(
  token: string,
  f: ListStockMovementsFilters,
) {
  return downloadBinary(
    `/api/exports/stock-movements.xlsx${buildQuery(f)}`,
    token,
    'stock-movements.xlsx',
  );
}

// ---------------------------------------------------------------------------
// Stage-C — AI / BI insights.
// ---------------------------------------------------------------------------

export type CashForecastPoint = {
  date: string;
  revenue: number;
  expense: number;
  netCash: number;
};

export type CashForecastResponse = {
  windowDays: number;
  horizonDays: number;
  historical: CashForecastPoint[];
  forecast: CashForecastPoint[];
  summary: {
    avgDailyRevenue: number;
    avgDailyExpense: number;
    avgDailyNet: number;
    forecastTotalRevenue: number;
    forecastTotalExpense: number;
    forecastTotalNet: number;
  };
};

export type AnomalyPoint = {
  date: string;
  value: number;
  orders?: number;
};

export type AnomalyFlag = {
  date: string;
  value: number;
  expected: number;
  zScore: number;
  direction: 'HIGH' | 'LOW';
};

export type AnomaliesResponse = {
  windowDays: number;
  zThreshold: number;
  revenue: { series: AnomalyPoint[]; anomalies: AnomalyFlag[] };
  expense: { series: AnomalyPoint[]; anomalies: AnomalyFlag[] };
};

export type DriverScoreRow = {
  driverId: string;
  fullName: string;
  branchName: string | null;
  trips: number;
  revenueKd: number;
  revenuePerTripKd: number;
  avgTurnaroundHours: number;
  score: number;
};

export type DriverScorecardResponse = {
  periodDays: number;
  drivers: DriverScoreRow[];
};

export type WeeklyReportEntry = {
  key: string;
  filename: string;
  sizeBytes: number;
  generatedAt: string;
  periodFrom?: string;
  periodTo?: string;
};

export function getCashForecast(token: string, days = 30) {
  return apiJson<CashForecastResponse>(
    `/api/insights/cash-forecast${buildQuery({ days })}`,
    { token },
  );
}

export function getAnomalies(token: string, days = 30) {
  return apiJson<AnomaliesResponse>(
    `/api/insights/anomalies${buildQuery({ days })}`,
    { token },
  );
}

export function getDriverScorecard(token: string, days = 30) {
  return apiJson<DriverScorecardResponse>(
    `/api/insights/driver-scorecard${buildQuery({ days })}`,
    { token },
  );
}

export function listWeeklyReports(token: string) {
  return apiJson<WeeklyReportEntry[]>(`/api/insights/executive/weekly`, {
    token,
  });
}

export function regenerateWeeklyReport(token: string) {
  return apiJson<WeeklyReportEntry>(
    `/api/insights/executive/weekly/regenerate`,
    { method: 'POST', token },
  );
}

export function downloadWeeklyReport(token: string, key: string) {
  return downloadBinary(
    `/api/insights/executive/weekly/${encodeURIComponent(key)}`,
    token,
    `${key}.pdf`,
  );
}

// ---------------------------------------------------------------------------
// Stage-D — Leave requests + Employee loans.
// ---------------------------------------------------------------------------

export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type LeaveRow = {
  id: string;
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  status: LeaveStatus;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    employeeId: string | null;
    civilId: string | null;
    jobTitle: string | null;
    branch: { id: string; name: string } | null;
  };
  approvedBy: {
    id: string;
    fullName: string;
    username: string;
  } | null;
};

export type LeaveFilters = {
  status?: LeaveStatus;
  type?: LeaveType;
  userId?: string;
  from?: string;
  to?: string;
};

export function listLeaves(token: string, filters: LeaveFilters = {}) {
  return apiJson<LeaveRow[]>(`/api/leaves${buildQuery(filters)}`, { token });
}

export function listMyLeaves(token: string) {
  return apiJson<LeaveRow[]>('/api/leaves/mine', { token });
}

export function getLeave(token: string, id: string) {
  return apiJson<LeaveRow>(`/api/leaves/${id}`, { token });
}

export function createLeave(
  token: string,
  dto: { type: LeaveType; startDate: string; endDate: string; reason?: string },
) {
  return apiJson<LeaveRow>('/api/leaves', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

export function approveLeave(token: string, id: string) {
  return apiJson<LeaveRow>(`/api/leaves/${id}/approve`, {
    method: 'PATCH',
    token,
  });
}

export function rejectLeave(token: string, id: string, reason: string) {
  return apiJson<LeaveRow>(`/api/leaves/${id}/reject`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ reason }),
  });
}

export function cancelLeave(token: string, id: string) {
  return apiJson<LeaveRow>(`/api/leaves/${id}/cancel`, {
    method: 'PATCH',
    token,
  });
}

// ─── Employee loans ─────────────────────────────────────────────────────

export type LoanStatusApi =
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SETTLED'
  | 'REJECTED';

export type LoanRow = {
  id: string;
  userId: string;
  amount: string;
  installmentCount: number;
  monthlyDeduction: string;
  remaining: string;
  reason: string | null;
  status: LoanStatusApi;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    employeeId: string | null;
    civilId: string | null;
    jobTitle: string | null;
    branch: { id: string; name: string } | null;
  };
  approvedBy: {
    id: string;
    fullName: string;
    username: string;
  } | null;
};

export type LoanFilters = {
  status?: LoanStatusApi;
  userId?: string;
};

export function listLoans(token: string, filters: LoanFilters = {}) {
  return apiJson<LoanRow[]>(`/api/loans${buildQuery(filters)}`, { token });
}

export function listMyLoans(token: string) {
  return apiJson<LoanRow[]>('/api/loans/mine', { token });
}

export function getLoan(token: string, id: string) {
  return apiJson<LoanRow>(`/api/loans/${id}`, { token });
}

export function createLoan(
  token: string,
  dto: {
    userId?: string;
    amount: number;
    installmentCount: number;
    reason?: string;
  },
) {
  return apiJson<LoanRow>('/api/loans', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

export function approveLoan(token: string, id: string) {
  return apiJson<LoanRow>(`/api/loans/${id}/approve`, {
    method: 'PATCH',
    token,
  });
}

export function rejectLoan(token: string, id: string, reason: string) {
  return apiJson<LoanRow>(`/api/loans/${id}/reject`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ reason }),
  });
}

// ---------------------------------------------------------------------------
// Stage-D — Payslip (single-row fetch for the A4 printable).
// ---------------------------------------------------------------------------

export type PayslipRow = {
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
  user: {
    id: string;
    fullName: string;
    username: string;
    employeeId: string | null;
    civilId: string | null;
    nationality: string | null;
    address: string | null;
    bankName: string | null;
    bankIban: string | null;
    hireDate: string | null;
    jobTitle: string | null;
  };
  branch: { id: string; name: string; location: string };
};

export function getPayslip(token: string, id: string) {
  return apiJson<PayslipRow>(`/api/payroll/${id}`, { token });
}

/** Manual test hook for the biometric webhook stub (OWNER/GM). */
export function recordBiometricAttendance(
  token: string,
  dto: {
    civilId?: string;
    externalUserRef?: string;
    action: 'CHECK_IN' | 'CHECK_OUT';
    atIso: string;
    deviceId: string;
    meta?: string;
  },
) {
  return apiJson<AttendanceRow>('/api/attendance/biometric', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

// ---------------------------------------------------------------------------
// Stage-F Cosmetic — Purchase Order workflow.
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type PurchaseOrderListRow = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  totalKd: string;
  expectedAt: string | null;
  createdAt: string;
  createdById: string;
  createdByName: string;
  lineCount: number;
  receivedRatio: number;
};

export type PurchaseOrderListResponse = {
  rows: PurchaseOrderListRow[];
  total: number;
};

export type PurchaseOrderDetail = PurchaseOrderListRow & {
  notes: string | null;
  cancelledReason: string | null;
  approvedAt: string | null;
  lines: Array<{
    id: string;
    stockItemId: string;
    stockItemCode: string;
    stockItemName: string;
    unit: string;
    quantityOrdered: string;
    quantityReceived: string;
    unitCost: string;
    lineTotal: string;
  }>;
  receipts: Array<{
    id: string;
    receivedAt: string;
    receivedByName: string;
    note: string | null;
    lines: Array<{
      id: string;
      stockItemId: string;
      stockItemName: string;
      quantityReceived: string;
      unitCost: string;
    }>;
  }>;
};

export type CreatePurchaseOrderBody = {
  supplierId: string;
  branchId: string;
  lines: Array<{
    stockItemId: string;
    quantityOrdered: number;
    unitCost: number;
  }>;
  expectedAt?: string;
  notes?: string;
};

export type ReceivePurchaseOrderBody = {
  lines: Array<{
    purchaseOrderLineId: string;
    quantityReceived: number;
    unitCost?: number;
  }>;
  note?: string;
};

export type PurchaseOrdersQuery = {
  status?: PurchaseOrderStatus;
  supplierId?: string;
  branchId?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
  offset?: number;
};

export function listPurchaseOrders(
  token: string,
  q: PurchaseOrdersQuery = {},
) {
  return apiJson<PurchaseOrderListResponse>(
    `/api/purchase-orders${buildQuery(q)}`,
    { token },
  );
}

export function getPurchaseOrder(token: string, id: string) {
  return apiJson<PurchaseOrderDetail>(`/api/purchase-orders/${id}`, { token });
}

export function createPurchaseOrder(
  token: string,
  body: CreatePurchaseOrderBody,
) {
  return apiJson<PurchaseOrderDetail>('/api/purchase-orders', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function sendPurchaseOrder(token: string, id: string) {
  return apiJson<PurchaseOrderDetail>(`/api/purchase-orders/${id}/send`, {
    method: 'POST',
    token,
  });
}

export function cancelPurchaseOrder(
  token: string,
  id: string,
  reason?: string,
) {
  return apiJson<PurchaseOrderDetail>(`/api/purchase-orders/${id}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  });
}

export function receivePurchaseOrder(
  token: string,
  id: string,
  body: ReceivePurchaseOrderBody,
) {
  return apiJson<PurchaseOrderDetail>(`/api/purchase-orders/${id}/receive`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

/* -----------------------------------------------------------------
 * V19.9 — CALL_CENTER_SUPERVISOR invoice edit/void + reports.
 * ---------------------------------------------------------------- */

export type InvoiceAuditAction = 'EDIT' | 'VOID';

export type EditInvoiceLineItemInput = {
  /** Present → update that existing line. Absent → insert a new line. */
  id?: string;
  label?: string;
  starchOption?: 'NONE' | 'STARCH_25';
  quantity: string;
  unitPrice: string;
};

export type EditInvoiceBody = {
  totalPrice?: string;
  posPaymentMethod?:
    | 'CASH'
    | 'KNET'
    | 'PAYMENT_LINK'
    | 'ONLINE'
    | 'DEBT_ON_ACCOUNT'
    | 'SUBSCRIPTION_WALLET';
  notes?: string;
  reason?: string;
  /**
   * V19.9.1 — full replacement set. When provided, the backend diffs
   * against existing rows (add / update / delete) and recomputes
   * `totalPrice` from Σ(qty × unitPrice) so the header ties to the
   * line breakdown.
   */
  lineItems?: EditInvoiceLineItemInput[];
};

export type EditInvoiceResult = {
  orderId: string;
  auditId: string;
  changedFields: string[];
  newTotal: string;
  newPaymentMethod: EditInvoiceBody['posPaymentMethod'] | null;
};

export function editInvoiceSameDay(
  token: string,
  orderId: string,
  body: EditInvoiceBody,
) {
  return apiJson<EditInvoiceResult>(`/api/invoice-audit/orders/${orderId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export type VoidInvoiceResult = {
  orderId: string;
  auditId: string;
  reversedAmount: string;
  reason: string;
};

export function voidInvoice(
  token: string,
  orderId: string,
  reason: string,
) {
  return apiJson<VoidInvoiceResult>(
    `/api/invoice-audit/orders/${orderId}/void`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    },
  );
}

export type InvoiceAuditLogRow = {
  id: string;
  orderId: string;
  action: InvoiceAuditAction;
  actor: { id: string; fullName: string; safariRole: SafariRole };
  actorRoleAtTime: SafariRole;
  actorNameAtTime: string;
  reason: string | null;
  changedFields: string[];
  financialImpactKd: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  kuwaitDay: string;
  createdAt: string;
  order: {
    id: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    totalPriceKd: string;
    status: string;
    customer: {
      id: string;
      displayName: string | null;
      phone: string | null;
    } | null;
  } | null;
};

export type InvoiceAuditLogResponse = {
  rows: InvoiceAuditLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export type InvoiceAuditLogQuery = {
  from?: string;
  to?: string;
  action?: InvoiceAuditAction;
  actorId?: string;
  limit?: number;
  offset?: number;
};

export function listInvoiceAuditLog(
  token: string,
  query: InvoiceAuditLogQuery,
) {
  const q = new URLSearchParams();
  if (query.from) q.set('from', query.from);
  if (query.to) q.set('to', query.to);
  if (query.action) q.set('action', query.action);
  if (query.actorId) q.set('actorId', query.actorId);
  if (query.limit !== undefined) q.set('limit', String(query.limit));
  if (query.offset !== undefined) q.set('offset', String(query.offset));
  const qs = q.toString();
  return apiJson<InvoiceAuditLogResponse>(
    `/api/invoice-audit/log${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export type CcPerformanceAgent = {
  agentId: string;
  agentName: string;
  role: SafariRole;
  collectedKd: string;
  debtSettledKd: string;
  activationsCount: number;
  customersServed: number;
};

export type CcPerformanceResponse = {
  from: string;
  to: string;
  agents: CcPerformanceAgent[];
  totals: {
    collectedKd: string;
    debtSettledKd: string;
    activationsCount: number;
    customersServed: number;
  };
};

export function getCcPerformance(
  token: string,
  query: { from?: string; to?: string },
) {
  const q = new URLSearchParams();
  if (query.from) q.set('from', query.from);
  if (query.to) q.set('to', query.to);
  const qs = q.toString();
  return apiJson<CcPerformanceResponse>(
    `/api/invoice-audit/cc-performance${qs ? `?${qs}` : ''}`,
    { token },
  );
}

