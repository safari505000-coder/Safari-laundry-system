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
  | 'VIEWER'
  | 'CUSTOMER';

export type LoginUser = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  safariRole: SafariRole;
  /** Set for branch-scoped staff; drives merged price list when using JWT defaults. */
  branchId?: string | null;
  /** B2C portal — same id as Customer row this login may access. */
  linkedCustomerId?: string | null;
};

export type LoginResponse = {
  requiresPasswordChange?: boolean;
  tempToken?: string;
  accessToken?: string;
  /** Single-use refresh token (rotated on every `/auth/refresh-token`). Long-lived. */
  refreshToken?: string;
  user: LoginUser;
};

/** V19.29 — auth refresh endpoint response shape. */
export type RefreshTokenResponse = {
  accessToken: string;
  refreshToken: string;
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

/** Same URL resolver as apiJson — exposed for offline queue replay (`flushPendingMutations`). */
export function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const base = apiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  status: number;
  /** Server codes e.g. SYSTEM_CLOSED (operating hours). */
  errorCode?: string;
  blockReason?: string;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    blockReason?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.blockReason = blockReason;
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

/**
 * Map known English backend / Prisma messages to Arabic toasts. Keys are
 * full strings or /regex/ test patterns for parameterized Prisma codes.
 */
const API_ERROR_MSG_AR: Array<{ m: string | RegExp; ar: string }> = [
  // Note: generic `A database error occurred (P####)...` — handled first in `toUserFacingErrorMessage`.
  {
    m: 'A database error occurred. Please try again.',
    ar: 'تعذّر تنفيذ العملية على قاعدة البيانات. جرّب مرة أخرى أو تأكد من تطبيق الترحيلات.',
  },
  {
    m: 'Something went wrong. Please try again.',
    ar: 'حدث خطأ غير متوقع. جرّب مرة أخرى.',
  },
  {
    m: 'Invalid data was sent. Check your input and try again.',
    ar: 'بيانات غير صالحة. راجع المدخلات.',
  },
  {
    m: 'A required database table is missing. Run `npx prisma migrate deploy` on the server, then try again.',
    ar: 'جداول قاعدة البيانات غير مكتملة. نفّذ ترحيلات قاعدة البيانات على الخادم (migrate deploy) ثم أعد المحاولة.',
  },
  {
    m: 'A required database column is missing. Run migrations, then try again.',
    ar: 'عمود مفقود في قاعدة البيانات. نفّذ الترحيلات ثم أعد المحاولة.',
  },
  {
    m: 'Database schema mismatch. Ensure migrations are applied, then try again.',
    ar: 'عدم تطابق مخطط قاعدة البيانات. طبّق الترحيلات ثم أعد المحاولة.',
  },
  {
    m: 'Cannot reach the database server. Check DATABASE_URL and network, then try again.',
    ar: 'لا يمكن الوصول إلى خادم قاعدة البيانات. تحقّق من DATABASE_URL والشبكة ثم أعد المحاولة.',
  },
  {
    m: 'Database connection was closed or interrupted. Retry the operation.',
    ar: 'انقطع الاتصال بقاعدة البيانات. أعد المحاولة.',
  },
  {
    m: 'Timed out waiting for a database connection from the pool. Retry in a moment or reduce concurrent load.',
    ar: 'انتهى انتظار اتصال من تجمع الربط؛ أعد المحاولة أو خفّف الضغط المتزامن على الخادم.',
  },
  {
    m: 'Database transaction timed out or was aborted. Retry the operation.',
    ar: 'انتهت مهلة معاملة قاعدة البيانات؛ أعد المحاولة — غالباً ليس بسبب الترحيلات.',
  },
  {
    m: 'A concurrent database write conflict occurred. Retry the operation.',
    ar: 'تعارض كتابة متزامن على قاعدة البيانات؛ أعد المحاولة.',
  },
];

/**
 * Prisma exposes many failure modes; the dashboard used to blame "migrations" for
 * all of them. Map known codes when we only have the `(P####)` generic string.
 */
function prismaFallbackArabic(prismaCode: string): string {
  const schemaCodes = ['P2006', 'P2010', 'P2021', 'P2022'];
  const retryCodes = ['P2028', 'P2034', 'P2024', 'P2030', 'P1008'];
  const connectivity = ['P1001', 'P1017'];
  if (schemaCodes.includes(prismaCode))
    return `تعذّر التنفيذ (${prismaCode}). غالباً مخطّط أو بيانات غير متطابقة — تأكّد من ترحيلات قاعدة البيانات ثم أعد المحاولة.`;
  if (retryCodes.includes(prismaCode))
    return `تعذّر التنفيذ (${prismaCode}). أعد المحاولة بعد لحظات (مهلة معاملة أو ازدحام — ليس بالضرورة نقص ترحيلات).`;
  if (connectivity.includes(prismaCode))
    return `لا يمكن الاتصال بقاعدة البيانات (${prismaCode}). تحقّق من الاتصال و DATABASE_URL.`;
  return `تعذّر تنفيذ العملية على قاعدة البيانات (${prismaCode}). راجع طرفية الخادم للتفاصيل؛ إذا كان الإصدار حديثاً فتحقّق من الترحيلات أيضاً.`;
}

function toUserFacingErrorMessage(english: string): string {
  const legacyGeneric =
    /^A database error occurred \((P\d{4})\)\. Please try again, or run migrations if the system was just updated\.?$/;
  const legacy = legacyGeneric.exec(english);
  if (legacy?.[1]) return prismaFallbackArabic(legacy[1]);

  for (const row of API_ERROR_MSG_AR) {
    if (typeof row.m === 'string' && row.m === english) return row.ar;
    if (row.m instanceof RegExp && row.m.test(english)) return row.ar;
  }
  return english;
}

function formatErrorMessage(
  json: Record<string, unknown>,
  status: number,
  rawText: string,
): string {
  const message = json.message;
  let raw: string;
  if (Array.isArray(message)) {
    raw = message
      .map((m) => (typeof m === 'string' ? m : JSON.stringify(m)))
      .join(', ');
  } else if (typeof message === 'string' && message.length > 0) {
    raw = message;
  } else {
    const err = json.error;
    if (typeof err === 'string' && err.length > 0) {
      raw = err;
    } else if (rawText.length > 0 && rawText.length < 400) {
      raw = rawText;
    } else {
      return `HTTP ${status}`;
    }
  }
  return toUserFacingErrorMessage(raw);
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit & { token?: string | null; _retriedAfterRefresh?: boolean },
): Promise<T> {
  const {
    token: bearer,
    _retriedAfterRefresh,
    ...fetchInit
  } = init ?? {};
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

  // V19.29 — transparent access-token refresh. When an authenticated call
  // gets 401 we call the `AuthProvider` handler once to mint a new access
  // token from the stored refresh token, then retry. Keeps staff logged in
  // through the whole shift instead of being kicked every 15 minutes.
  const shouldTryRefresh =
    res.status === 401 &&
    bearer != null &&
    !_retriedAfterRefresh &&
    !path.includes('/api/auth/refresh-token') &&
    !path.includes('/api/auth/login') &&
    tokenRefreshHandler != null;
  if (shouldTryRefresh) {
    const fresh = await tryRefreshAccessToken();
    if (fresh) {
      return apiJson<T>(path, {
        ...init,
        token: fresh,
        _retriedAfterRefresh: true,
      });
    }
  }

  if (!res.ok) {
    const errorCode =
      typeof json.errorCode === 'string' ? json.errorCode : undefined;
    const blockReason =
      typeof json.blockReason === 'string' ? json.blockReason : undefined;
    throw new ApiError(
      formatErrorMessage(json, res.status, rawText),
      res.status,
      errorCode,
      blockReason,
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

export const apiFetch = apiJson;

export function postLogin(username: string, password: string) {
  return apiJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
  });
}

export function postChangePassword(
  token: string,
  body: { oldPassword: string; newPassword: string },
) {
  return apiJson<LoginResponse>('/api/auth/change-password', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function postRefreshToken(refreshToken: string) {
  return apiJson<RefreshTokenResponse>('/api/auth/refresh-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function postLogout(refreshToken: string): Promise<void> {
  return apiJson<void>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {
    // Best-effort — logout must never fail the UX flow.
  });
}

/**
 * Global refresh handler wired by `AuthProvider`. When an authenticated call
 * returns 401 because the short access token expired, apiJson calls this
 * ONCE per in-flight request to silently swap in a new access token and
 * retry — so staff are not kicked to the login screen every 15 minutes.
 *
 * Returns the new access token on success, or `null` if refresh failed
 * (caller should then force a logout).
 */
type RefreshHandler = () => Promise<string | null>;
let tokenRefreshHandler: RefreshHandler | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

export function setTokenRefreshHandler(handler: RefreshHandler | null): void {
  tokenRefreshHandler = handler;
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (!tokenRefreshHandler) return null;
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      return await tokenRefreshHandler!();
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

export type OperatingStatusPayload = {
  isOpen: boolean;
  /** false = OPERATING_HOURS_LOCK_ENABLED off; driver/branch not blocked by time. */
  lockEnabled?: boolean;
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

export type DriverCashCustodySummary = {
  cashTotalKd: string;
  cashOrderCount: number;
  grandTotalKd: string;
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

export type CashReconciliationSnapshot = {
  range: { from: string; to: string };
  notes: string[];
  eventBasedInRange: {
    collectedKd: string;
    handedToManagerKd: string;
    collectedOrderCount: number;
    handedBagCount: number;
  };
  stateBasedNow: {
    pendingWithDriversKd: string;
    pendingWithManagersDepositOrRejectedKd: string;
    pendingWithManagersDepositOrRejectedBagCount: number;
    awaitingVerificationKd: string;
    awaitingVerificationBagCount: number;
  };
  driverCashTraceKpis: DriverCashTraceResponse['kpis'];
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

export function getCashReconciliation(
  token: string,
  params: { from: string; to: string; driverId?: string; branchId?: string },
) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.driverId) search.set('driverId', params.driverId);
  if (params.branchId) search.set('branchId', params.branchId);
  return apiJson<CashReconciliationSnapshot>(
    `/api/finance/reports/cash-reconciliation?${search.toString()}`,
    { token },
  );
}

/** V19.32 — Interactive accountant dashboard (period = Kuwait window). */
export type AccountantDashboardPeriod = 'today' | 'week' | 'month';

export type AccountantDashboardKpi = {
  valueKd: string;
  drilldownType: string;
  trendPctVsPrevious: number;
  trendDirection: 'up' | 'down' | 'flat';
  previousKd?: string;
  count?: number;
  snapshot?: boolean;
};

export type AccountantDashboardSummary = {
  window: {
    period: AccountantDashboardPeriod;
    current: { fromIso: string; toIso: string };
    previous: { fromIso: string; toIso: string };
  };
  kpis: {
    totalSales: AccountantDashboardKpi & { previousKd: string };
    cashCollected: AccountantDashboardKpi & { previousKd: string };
    cashWithDrivers: AccountantDashboardKpi;
    cashWithManagers: AccountantDashboardKpi;
    bankDeposited: AccountantDashboardKpi & { previousKd: string };
    netProfit: AccountantDashboardKpi & { previousKd: string };
  };
  pipeline: {
    stages: Array<{
      key: string;
      label: string;
      amountKd: string;
      count: number;
      avgDelayHours: number;
      tone: 'green' | 'yellow' | 'red';
    }>;
  };
  expenses: {
    totalKd: string;
    topCategory: string | null;
    expenseRatioVsSales: string | null;
  };
  charts: {
    profitOverTime: { day: string; netKd: string }[];
    salesVsExpenses: { day: string; salesKd: string; expensesKd: string }[];
    cashStagesTrend: { day: string; collectedKd: string; handedKd: string }[];
  };
  drilldowns: {
    openCustodyBags: Array<{
      id: string;
      amountKd: string;
      status: string;
      managerName: string;
      driverName: string;
      ageHours: number;
      isOverdue: boolean;
    }>;
    pendingDrivers: Array<{
      driverId: string;
      name: string;
      pendingKd: string;
      lastCompletedAt: string;
    }>;
  };
  cacheTtlSec: number;
};

export type FinanceReconciliationDto = {
  window: { fromIso: string; toIso: string };
  collected: { kd: string; orderCount: number };
  handed: { kd: string; bagCount: number };
  pendingDrivers: { kd: string };
  pendingManagers: { kd: string };
  /** handed − collected (legacy name; same numeric value as deltaKd). */
  differenceKd: string;
  /** handed − collected */
  deltaKd: string;
  /** collected − handed (= −delta) */
  shortfallKd: string;
  /** Operator-facing status (drivers hold vs office ahead). Legacy `badge` kept for old clients. */
  status: 'GREEN' | 'RED' | 'YELLOW';
  /** Legacy timing-lag semantics on (handed − collected); unchanged. */
  badge: 'green' | 'yellow' | 'red';
};

export type FinanceReconciliationExplainDto = {
  window: { fromIso: string; toIso: string };
  byDate: Array<{
    day: string;
    collectedKd: string;
    handedKd: string;
  }>;
  byDriver: Array<{
    driverId: string;
    name: string;
    collectedKd: string;
    handedKd: string;
    /** collected − handed per driver */
    shortfallKd: string;
  }>;
  byManager: Array<{
    managerId: string;
    name: string;
    handedKd: string;
    bagCount: number;
  }>;
  /** Window totals: Σ collected − Σ handed */
  totalShortfallKd: string;
  /** Window totals: Σ handed − Σ collected */
  totalDeltaKd: string;
  summaryLabels: {
    driverHoldsLine: string | null;
    officeHoldsLine: string | null;
  };
  narratives: string[];
};

export type FinanceAlertDto = {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  code: string;
  title: string;
  detail: string;
  drilldownType: string;
  refId?: string;
};

export type FinanceAlertsResponse = {
  alerts: FinanceAlertDto[];
  generatedAt: string;
};

export type FinanceInsightsResponse = {
  lines: string[];
  generatedAt: string;
};

function accountantDashboardQs(
  period: AccountantDashboardPeriod,
  branchId?: string,
) {
  const p = new URLSearchParams({ period });
  if (branchId) p.set('branchId', branchId);
  return p.toString();
}

export function getAccountantDashboardSummary(
  token: string,
  params: { period: AccountantDashboardPeriod; branchId?: string },
) {
  return apiJson<AccountantDashboardSummary>(
    `/api/finance/dashboard-summary?${accountantDashboardQs(params.period, params.branchId)}`,
    { token },
  );
}

export function getFinanceReconciliationApi(
  token: string,
  params: { period: AccountantDashboardPeriod; branchId?: string },
) {
  return apiJson<FinanceReconciliationDto>(
    `/api/finance/reconciliation?${accountantDashboardQs(params.period, params.branchId)}`,
    { token },
  );
}

export function explainFinanceReconciliation(
  token: string,
  params: { period: AccountantDashboardPeriod; branchId?: string },
) {
  return apiJson<FinanceReconciliationExplainDto>(
    `/api/finance/reconciliation/explain?${accountantDashboardQs(params.period, params.branchId)}`,
    { token },
  );
}

export function getFinanceAlerts(
  token: string,
  params: { period: AccountantDashboardPeriod; branchId?: string },
) {
  return apiJson<FinanceAlertsResponse>(
    `/api/finance/alerts?${accountantDashboardQs(params.period, params.branchId)}`,
    { token },
  );
}

export function getFinanceInsights(
  token: string,
  params: { period: AccountantDashboardPeriod; branchId?: string },
) {
  return apiJson<FinanceInsightsResponse>(
    `/api/finance/insights?${accountantDashboardQs(params.period, params.branchId)}`,
    { token },
  );
}

export type CashControlStatus = 'OK' | 'MISMATCH' | 'CRITICAL';
export type CashControlSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type CashControlScopeType = 'ALL' | 'BRANCH' | 'DRIVER';

export type CashControlReconciliation = {
  date: string;
  branchId: string | null;
  expectedCash: string;
  collectedByDrivers: string;
  handedToBranch: string;
  receivedByManager: string;
  depositedToBank: string;
  differenceDriver: string;
  differenceBranch: string;
  differenceBank: string;
  totalDifference: string;
  status: CashControlStatus;
  breakdown: {
    driverId: string;
    driverName: string | null;
    collected: string;
    handed: string;
    difference: string;
    status: CashControlStatus;
  }[];
  accountability: {
    responsible: 'DRIVER' | 'BRANCH' | 'ACCOUNTING';
    amount: string;
    delayHours: number;
    severity: CashControlSeverity;
  }[];
  alerts: {
    type:
      | 'MISSING_HANDOVER'
      | 'DELAYED_DEPOSIT'
      | 'PARTIAL_DEPOSIT'
      | 'DEPOSIT_NOT_REGISTERED';
    severity: CashControlSeverity;
    entityId: string;
    message: string;
  }[];
  depositStatus?: 'MISSING' | 'PENDING' | 'VERIFIED' | 'MIXED';
  auditComplete?: boolean;
  flows?: {
    custodyId: string;
    shiftId: string | null;
    custodyAmount: string;
    linkedOrdersTotal: string;
    depositId: string | null;
    depositStatus: 'MISSING' | 'PENDING' | 'VERIFIED' | 'AMOUNT_MISMATCH';
    auditComplete: boolean;
    anomalyFlags: string[];
  }[];
  reconciliationMode: 'flow_based';
  ignoredTimingMismatch: boolean;
  actionsTaken: string[];
};

export type CashControlTimeline = {
  events: {
    type:
      | 'ORDER_COLLECTED'
      | 'DRIVER_HANDOVER'
      | 'MANAGER_CONFIRMED'
      | 'BANK_DEPOSITED';
    timestamp: string;
    amount: string;
    userId: string | null;
    sourceId: string;
  }[];
};

export function getAccountingReconciliation(
  token: string,
  params: {
    date: string;
    scopeType?: CashControlScopeType;
    branchId?: string;
    driverId?: string;
  },
) {
  const qs = new URLSearchParams({ date: params.date });
  if (params.scopeType) qs.set('scopeType', params.scopeType);
  if (params.branchId) qs.set('branchId', params.branchId);
  if (params.driverId) qs.set('driverId', params.driverId);
  return apiJson<CashControlReconciliation>(
    `/api/accounting/reconciliation?${qs.toString()}`,
    { token },
  );
}

export function getAccountingTimeline(
  token: string,
  params: {
    date: string;
    scopeType?: CashControlScopeType;
    driverId?: string;
    branchId?: string;
  },
) {
  const qs = new URLSearchParams({ date: params.date });
  if (params.scopeType) qs.set('scopeType', params.scopeType);
  if (params.driverId) qs.set('driverId', params.driverId);
  if (params.branchId) qs.set('branchId', params.branchId);
  return apiJson<CashControlTimeline>(
    `/api/accounting/timeline?${qs.toString()}`,
    { token },
  );
}

export type OwnerFinancialDashboard = {
  generatedAt: string;
  totalInvoicesToday: string;
  totalPaymentsToday: string;
  /**
   * V23.2 — Σ canonical receivable debt across all active customers
   * in the rollup. Renamed from `totalDueTotal` so the wire field
   * name reflects that the number is sourced from the canonical
   * banking layer (V20.4 `computeCanonicalCustomerDebt`), not the
   * legacy "invoices − payments" gross.
   */
  canonicalDebtTotal: string;
  cashInDrivers: string;
  cashInOffice: string;
  reconciliationDifference: string;
  alerts: {
    type: 'HIGH_DEBT' | 'DRIVER_DELAY' | 'EXPENSE_SPIKE' | 'CASH_MISMATCH';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    entityId: string;
    message: string;
    createdAt: string;
  }[];
  topCustomers: {
    customerId: string;
    displayName: string | null;
    /** V23.2 — canonical receivable per customer (replaces legacy totalDueKd). */
    canonicalDebtKd: string;
    totalInvoicesKd: string;
    totalPaymentsKd: string;
    customerHealth: 'GOOD' | 'WATCH' | 'RISK' | 'BLOCKED';
    paymentConsistency: number;
    avgPaymentDelayHours: number;
    lifetimeValueKd: string;
  }[];
  riskyDrivers: {
    driverId: string;
    driverName: string | null;
    collectedCash: string;
    handedCash: string;
    delayHours: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'WARNING';
  }[];
};

export function getOwnerFinancialDashboard(token: string) {
  return apiJson<OwnerFinancialDashboard>('/api/finance/owner-dashboard', { token });
}

export type AuditLogTimelineRow = {
  action: string;
  amount: string | null;
  source: string | null;
  userId: string | null;
  timestamp: string;
};

export type AuditLogsResponse = {
  rows: AuditLogTimelineRow[];
};

export type AuditLogsQuery = {
  customerId?: string;
  driverId?: string;
  orderId?: string;
};

export function listAuditLogs(token: string, query: AuditLogsQuery = {}) {
  const q = new URLSearchParams();
  if (query.customerId) q.set('customerId', query.customerId);
  if (query.driverId) q.set('driverId', query.driverId);
  if (query.orderId) q.set('orderId', query.orderId);
  const qs = q.toString();
  return apiJson<AuditLogsResponse>(`/api/audit/logs${qs ? `?${qs}` : ''}`, { token });
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
  customerRunningRemainingKd: string;
  entryCount: number;
  currentCustomerDebtKd: string;
  isOpen: boolean;
  lastEntryAt: string;
  /** Field shortfall vs subscription wallet overuse */
  debtSource: 'INVOICE_SHORTFALL' | 'SUBSCRIPTION_OVERUSE' | 'OPEN_UNPAID_ORDER';
  /** Mirrors `Order.posPaymentMethod` — e.g. PAYMENT_LINK for WhatsApp payment links */
  posPaymentMethod?: string | null;
  /**
   * V20.3.1 — canonical payment status. Drives the chip color
   * (UNPAID = red, PARTIALLY_PAID = orange, PAID = green) and
   * is computed server-side from `remainingKd` against the
   * tolerance — never derive locally.
   */
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  isPartiallyPaid?: boolean;
  isFullyPaid?: boolean;
  /**
   * V20.3.2 — independent subscription dimension. True iff the
   * customer currently holds an ACTIVE CustomerSubscription
   * with `expiresAt > now`. Set this for the SUBSCRIBER badge —
   * NEVER derive subscriber state from debt fields.
   */
  hasActiveSubscription?: boolean;
  subscriptionExpiresAt?: string | null;
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
  openShortfallDebtKd: string;
  openSubscriptionOveruseDebtKd: string;
  openUnpaidOrderBalanceKd: string;
  /** Same as call-center «market debt» red KPI: Σ order total for UNPAID in branch scope */
  totalMarketUnpaidKd: string;
  /** UNPAID Σ by `posPaymentMethod` (orders with field INVOICE_SHORTFALL from driver / branch manager) */
  marketUnpaidByMethod: {
    cashKd: string;
    knetKd: string;
    onlineKd: string;
    paymentLinkKd: string;
    otherKd: string;
  };
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
    /** When set with no `branchId`, scopes only the market-debt KPI to match `/collections` / operations-summary. */
    marketKpiBranchId?: string;
    actorUserId?: string;
    customerPhone?: string;
  },
) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.branchId) search.set('branchId', params.branchId);
  if (params.marketKpiBranchId)
    search.set('marketKpiBranchId', params.marketKpiBranchId);
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
  /** V19.24 — e.g. `A-2`, `B-5` (per-operator sequence gaps). */
  firstGaps: string[];
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
  /** V19.26 — true when a Call-Center/Owner `InvoiceAuditLog` EDIT exists. */
  hasSupervisorEdit?: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    phone: string;
    phone2?: string | null;
    address: string | null;
    displayName?: string | null;
    // V19.22 — outstanding wallet state so invoice prints can show the
    // customer's debt directly on the receipt (matches the POS screen).
    // Decimal strings to preserve server precision; `null` when the
    // customer has no wallet row yet.
    wallet?: {
      balance: string;
      debt: string;
    } | null;
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
   * Column display: signed net `balance − operationalDebtKd` (negative when debt
   * exceeds prepaid). Falls back to `balance` if absent (older API).
   */
  balanceDisplayKd?: string;
  /** Wallet-posted aggregate debt (`CustomerWallet.debt`). */
  debt: string;
  /** UNPAID totals with `walletSettledAt=null` (before posted to wallet). */
  unsettledUnpaidKd?: string;
  /** Canonical current receivable debt after partial payments and subscription conversion. */
  remainingDebtKd?: string;
  /** Operational debt basis. This is NOT the canonical Customer 360 financial number. */
  operationalDebtKd?: string;
  rowStatus: 'active_ok' | 'active_warn' | 'expired' | 'open_credit';
  /** Days since the subscription was last activated. Null if unknown. */
  invoiceAgeDays: number | null;
  /** Cumulative 24h-guarded reminders for this subscriber. */
  reminderCount: number;
  lastReminderAtIso: string | null;
  /** Backend says "true" when another `/reminder` call would succeed. */
  canRemindNow: boolean;
  /** Σ Collections payment-link reminder sends (`Order.reminderCount`). */
  collectionPaymentLinkReminderTotal?: number;
  /** Days since oldest unpaid row with minted hosted payment URL; null none. */
  collectionPendingHostedLinkAgeDays?: number | null;
  /**
   * When API runs with `EXPOSE_DEBT_BREAKDOWN=1`: three debt baselines + winners
   * (local diagnostics — compare list vs convert modal).
   */
  debtKdBreakdownTrace?: {
    ledgerNetKd: string;
    walletSnapshotKd: string;
    orderMarketScopeKd: string;
    operationalDebtKd?: string;
    winningSources: Array<'ledger' | 'walletSnapshot' | 'orderMarket'>;
  };
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
 * POST /api/call-center/orders/:orderId/send-payment-link-whatsapp
 */
export type SendPaymentLinkWhatsappResult = {
  reminder: ReminderResult;
  serverPush: boolean;
  paymentUrl: string;
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
  /** V19.23 — prefix island now covers DRIVER + MANAGER (branch managers issue invoices too). */
  safariRole: 'DRIVER' | 'MANAGER';
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
  | 'SUBSCRIPTION'
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
 * V19.11.4 — NET open debt grouped by the invoice's original issuer (all
 * INVOICE_SHORTFALL issuers). Receivables page table uses driver/manager
 * only; its headline total matches the call-center red KPI via
 * `totalMarketUnpaidKd` (UNPAID order sum), not this chart's total.
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
  /**
   * Owner-configured per-operator serial (`A-5`); the human invoice id on
   * the thermal roll. Null when the operator has no prefix (legacy/blank).
   */
  serialNumber: string | null;
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
  customerId: string;
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
  /** Field (driver/manager) already sent payment link — CC must not duplicate WhatsApp. */
  ccCollectionPaymentWaLocked?: boolean;
  /** Combined cooldown + CC lock — use for «إرسال رابط الدفع». */
  canSendCollectionPaymentWa?: boolean;
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

export type CollectionUnpaidOnlineBranchSummary = {
  branchName: string;
  invoices: number;
  totalRemainingKd: string;
  driversCount: number;
};

export type CollectionUnpaidOnlineReportResponse = {
  rows: CollectionUnpaidOnlineRow[];
  paymentLinkRows: CollectionUnpaidOnlineRow[];
  branchSummaries: CollectionUnpaidOnlineBranchSummary[];
  paymentLinkSummary: {
    totalRows: number;
    actionableRows: number;
  };
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
   * V19.22.2 — hosted payment-link lifecycle.
   * - `PENDING`  → link issued, still within 24h validity window.
   * - `EXPIRED`  → link issued but window elapsed without payment.
   * - `null`     → this row is not a payment-link invoice (falls
   *   back to the classic Unpaid badge).
   *
   * V19.22.3 — simplified badges: `linkStatus === 'PENDING'` is the
   * ONLY signal that flips the badge from red (Unpaid) to blue
   * (Pending payment). All other combinations render as Unpaid.
   */
  linkStatus: 'PENDING' | 'EXPIRED' | null;
  createdAtIso: string;
};

export type DriverPendingInvoicesResponse = {
  rows: DriverPendingInvoiceRow[];
  totalAmountKd: string;
  filteredCount: number;
  totalCount: number;
};

/**
 * Dastur §10 (V19.22.4) — Stale Quick-Capture accountability risks.
 * One row per Order that was created via `POST /orders/quick` and has
 * been sitting in PENDING + UNPAID state for longer than 24 hours —
 * the highest-risk accountability bucket (permanent serialNumber but
 * no settlement trail). Visible to OWNER / GENERAL_MANAGER /
 * ACCOUNTANT via `GET /api/orders/stale-quick-risks`.
 */
export type StaleQuickOrderRiskRow = {
  orderId: string;
  readableId: string;
  driverName: string;
  driverPhone: string | null;
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
  /** Whole hours since creation (rounded). */
  ageHours: number;
  createdAtIso: string;
};

export async function getStaleQuickOrderRisks(
  token: string,
): Promise<StaleQuickOrderRiskRow[]> {
  return apiJson<StaleQuickOrderRiskRow[]>('/api/orders/stale-quick-risks', {
    token,
  });
}

/**
 * V19.22.5 — Branch Manager "My Documents" island.
 * Matches `GET /api/manager/my-documents` (service:
 * `ManagerDocumentsService.listForManager`).
 */
export type ManagerDocumentKind = 'CUSTODY_RECEIPT' | 'EXPENSE_VOUCHER';

export type ManagerDocumentRow = {
  kind: ManagerDocumentKind;
  id: string;
  date: string;
  amountKd: string;
  title: string;
  subtitle: string | null;
  status: string;
  printPath: string;
};

export async function getManagerDocuments(
  token: string,
): Promise<ManagerDocumentRow[]> {
  return apiJson<ManagerDocumentRow[]>('/api/manager/my-documents', { token });
}

export type ManagerExpenseVoucher = {
  id: string;
  title: string;
  amountKd: string;
  category: string;
  expenseMethod: string;
  note: string | null;
  expenseDate: string;
  approvedAt: string;
  status: string;
  recordedBy: {
    id: string;
    fullName: string;
    username: string;
  };
  branch: { id: string; name: string } | null;
};

export async function getManagerExpenseVoucher(
  token: string,
  id: string,
): Promise<ManagerExpenseVoucher> {
  return apiJson<ManagerExpenseVoucher>(
    `/api/manager/my-documents/expense/${id}`,
    { token },
  );
}

/**
 * V19.22.5 — Branch Manager "Driver Oversight" island.
 * Matches `GET /api/manager/driver-oversight` (service:
 * `DriverOversightService.listForBranchManager`).
 */
export type DriverOversightShiftStatus = 'ON_SHIFT' | 'OFF';

export type DriverOversightCard = {
  driverId: string;
  fullName: string;
  username: string;
  phone: string | null;
  branch: { id: string; name: string } | null;
  shiftStatus: DriverOversightShiftStatus;
  shiftStartedAt: string | null;
  ordersTodayCount: number;
  pendingInvoicesCount: number;
  // V23.2 — `cashTodayKd` and `heldCashKd` were deleted from this
  // card. Driver cash is exposed EXCLUSIVELY by
  // `getCashIntelligenceDashboard()` (SSoT). The keys no longer
  // exist on the wire, so dynamic property access yields
  // `undefined`; dedicated runtime guards on the backend continue
  // to refuse any attempt to re-introduce them.
  staleQuickCount: number;
  staleQuickKd: string;
  atRisk: boolean;
};

export async function getDriverOversight(
  token: string,
): Promise<DriverOversightCard[]> {
  return apiJson<DriverOversightCard[]>('/api/manager/driver-oversight', {
    token,
  });
}

/**
 * V19.22.5 — Invoices page branch-drivers dropdown.
 * Matches `GET /api/orders/branch-drivers` (service:
 * `listInvoiceFilterDrivers`). MANAGER → drivers of their branch only;
 * OWNER / GM / CC / ACCOUNTANT → every active DRIVER.
 */
export type InvoiceFilterDriverRow = {
  id: string;
  fullName: string;
  username: string;
  branchId: string | null;
  branchName: string | null;
};

export async function getInvoiceFilterDrivers(
  token: string,
): Promise<InvoiceFilterDriverRow[]> {
  return apiJson<InvoiceFilterDriverRow[]>('/api/orders/branch-drivers', {
    token,
  });
}

/**
 * V19.22.5 — Query parameters understood by `GET /api/orders` when
 * called from the Invoices page. Empty / undefined values are
 * stripped before the request; the server applies role-based
 * scoping on top of these filters (MANAGER → branch only).
 */
export type InvoiceListFilters = {
  driverId?: string;
  status?: string;
  posPaymentMethod?: string;
  cashStatus?: string;
  from?: string;
  to?: string;
  q?: string;
};

export async function getInvoices(
  token: string,
  filters: InvoiceListFilters = {},
): Promise<OrderRow[]> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      params.set(k, v.trim());
    }
  }
  const qs = params.toString();
  return apiJson<OrderRow[]>(qs ? `/api/orders?${qs}` : '/api/orders', {
    token,
  });
}

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
  /** NET open INVOICE_SHORTFALL (ledger) after customer waterfall. */
  outstandingInvoiceDebtKd: string;
  /** NET open SUBSCRIPTION_OVERUSE (ledger). */
  outstandingSubscriptionDebtKd: string;
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
  trendRatio: number;
};

export type DebtRecoveryReport = {
  from: string;
  to: string;
  totalRecoveredKd: string;
  totalSettlements: number;
  totalSubscriptions: number;
  maxRecoveredKd: string;
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
  /** Server: FIFO-paid from prepaid balance after activation (V19.13). */
  prepaidAutoReconciledOrderIds?: string[];
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
  | 'SUBSCRIPTION_CANCELLATION'
  | 'SUBSCRIPTION_ROLLOVER_CARRY'
  | 'ORDER_PAID_IN_FULL'
  | 'ORDER_SETTLEMENT_SUBSCRIPTION'
  | 'ORDER_INVOICE_PARTIAL_PAYMENT'
  | 'ORDER_INVOICE_ON_ACCOUNT'
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

export type CustomerLedgerEventProjection = {
  isCredit: boolean;
  effectiveDebtAfterKd: string;
  hasDebtDiscount: boolean;
  hasDebtSettled: boolean;
  closedInvoicesTotalKd: string;
};

export type CustomerLedgerEvent = {
  id: string;
  atIso: string;
  rawType: 'SUBSCRIPTION_ACTIVATION' | 'SUBSCRIPTION_CANCELLATION' | 'ORDER_WALLET_SETTLEMENT';
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
    | 'DEBT_ON_ACCOUNT'
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
  projection: CustomerLedgerEventProjection;
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
    | 'DEBT_ON_ACCOUNT'
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
  projectionGroup: 'UNPAID' | 'PAID' | 'CANCELED';
  feedbackRating: number | null;
  feedbackSubmittedAtIso: string | null;
};

export type CustomerLedgerFeedbackSummary = {
  averageRating: number | null;
  ratedCount: number;
  lastFeedback: {
    rating: number;
    note: string | null;
    submittedAtIso: string;
    orderId: string;
    orderSerial: string | null;
  } | null;
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
    /** Σ uncollection aligned with `/collections` (invoice scope). */
    collectionsReceivableKd?: string;
    /** Canonical current receivable debt shown to operators/customers. */
    remainingDebtKd?: string;
    /** Operational debt basis. This is NOT the canonical Customer 360 financial number. */
    operationalDebtKd?: string;
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
    totalInvoicedKd: string;
    totalPaidInvoicesKd: string;
    totalOpenInvoicesKd: string;
    unpaidInvoiceCount: number;
    paidInvoiceCount: number;
    canceledInvoiceCount: number;
    totalCollectedKd: string;
    totalDiscountedKd: string;
  };
  feedbackSummary: CustomerLedgerFeedbackSummary;
  /**
   * V21 Phase 3 — Canonical Banking snapshot envelope.
   * Hash-verifiable, lineage-tagged metadata over the statement payload.
   * Optional for backwards compatibility with older clients that have
   * not yet been deployed against the new server build.
   */
  snapshot?: CustomerLedgerSnapshot;
};

export type CustomerLedgerSnapshot = {
  snapshotVersion: string;
  generatedAtIso: string;
  canonicalHash: string;
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
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

/** PBX / dialer — `GET /api/customers/resolve-incoming-phone?phone=…` */
export type ResolveIncomingPhoneResponse = {
  customer: CustomerDirectoryRow['customer'] | null;
  ambiguous: boolean;
  searchHint: string;
};

export function getResolveIncomingPhone(
  token: string | null,
  phone: string,
): Promise<ResolveIncomingPhoneResponse> {
  return apiJson<ResolveIncomingPhoneResponse>(
    `/api/customers/resolve-incoming-phone?phone=${encodeURIComponent(phone)}`,
    { token },
  );
}

/** Call Center — minimal customer create (`POST /api/customers`). */
export function postCreateCustomerQuick(
  token: string | null,
  body: { displayName: string; phone: string },
): Promise<CustomerDirectoryRow['customer']> {
  return apiJson<CustomerDirectoryRow['customer']>('/api/customers', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

/** `GET /api/customers/:id/360` — view mode is server-derived from JWT. */
export type Customer360Financials = {
  consumedKd: string;
  totalInvoicesKd: string;
  subscriptionValueKd: string;
  subscriptionConsumedKd: string;
  subscriptionRemainingKd: string;
  totalPaymentsKd: string;
  /**
   * V20.4 Phase 2 + V23.1 Final — canonical receivable debt for the
   * customer. Single source of truth for "how much does this customer
   * owe us right now"; computed by `computeCanonicalCustomerDebt` on
   * the backend (Σ remaining_balance per open invoice, partial-payment
   * + customer-level RESIDUAL aware, clamped at zero).
   *
   * EVERY customer 360 surface MUST render THIS field for any "unpaid"
   * / "debt" / "إجمالي المديونية" tile. Do NOT fall back to the legacy
   * `totalDueKd` because the legacy number is `totalInvoices − totalPayments`
   * which ignores subscription absorption + RESIDUAL FIFO and therefore
   * disagrees with `/api/orders/collections/unpaid-online` and the V23.1
   * cockpit by exactly the amount the wallet/subscription has absorbed.
   */
  canonicalDebtKd: string;
  /** Provenance of `canonicalDebtKd`. */
  canonicalDebtSource:
    | 'JOURNAL_AR'
    | 'PARTIAL_PAYMENT_REMAINING'
    | 'JOURNAL_AR_FALLBACK';
  // V23.2 — `totalDueKd` was removed from the wire DTO; the engine
  // still computes "totalInvoices − totalPayments" internally for
  // its own invariants but the value never leaves the backend. Every
  // UI surface reads `canonicalDebtKd` instead (V23.1 migration).
  breakdown?: {
    /** Equal to `canonicalDebtKd`. */
    receivableDebtKd: string;
    subscriptionRemainingKd: string;
    walletPrepaidCreditKd: string;
    paidTotalKd: string;
    operatorHint: string;
  };
  isBlocked: boolean;
  blockReason: string | null;
  blockedAtIso: string | null;
};

export type Customer360SubscriptionRow = {
  id: string;
  status: string;
  planNameSnapshot: string;
  planSalePriceKd: string;
  planActualBalanceKd: string;
  planValidityDays: number;
  carriedBalanceKd: string;
  activatedAtIso: string;
  expiresAtIso: string;
  closedAtIso: string | null;
  closedReason: string | null;
};

export type Customer360Statement = {
  financials: Customer360Financials;
  narrativeLines?: string[];
};

export type Customer360SubscriptionFinancials = {
  subscriptionValueKd: string;
  subscriptionConsumedKd: string;
  subscriptionRemainingKd: string;
};

export type Customer360ResponseInternal = {
  customer: {
    id: string;
    displayName: string | null;
    phone: string;
    phone2: string | null;
  };
  subscriptions: Customer360SubscriptionRow[];
  subscription: Customer360SubscriptionFinancials;
  statement: Customer360Statement;
  rating: 'GOOD' | 'WATCH' | 'BLOCKED';
  insight: string;
  score: { value: number; feedbackAverage: number | null; factors: string[] };
  insights: { summary: string; detail: string };
  alerts: { code: string; message: string }[];
  internalNotes: string | null;
};

export type Customer360ResponseSanitized = {
  customer: Customer360ResponseInternal['customer'];
  subscriptions: Customer360SubscriptionRow[];
  subscription: Customer360SubscriptionFinancials;
  statement: Customer360Statement;
  rating: 'GOOD' | 'WATCH' | 'BLOCKED';
  insight: string;
  score: null;
  insights: null;
  friendlySummary: string;
};

export function getCustomer360(
  token: string | null,
  customerId: string,
): Promise<Customer360ResponseInternal | Customer360ResponseSanitized> {
  return apiJson<Customer360ResponseInternal | Customer360ResponseSanitized>(
    `/api/customers/${customerId}/360`,
    { token },
  );
}

export function getPublicCustomerStatement(
  shareToken: string,
): Promise<CustomerLedgerResponse> {
  return apiJson<CustomerLedgerResponse>(
    `/api/public/statement/${encodeURIComponent(shareToken)}`,
  );
}

export type OrderInvoiceShareLink = {
  token: string;
  shareUrl: string;
  expiresAtIso: string;
};

/**
 * V19.24 — 7-day link to the same receipt as `/invoices/:id/print` for
 * WhatsApp; customer opens and saves as PDF in the browser.
 */
export function createOrderInvoiceShareLink(
  token: string | null,
  orderId: string,
): Promise<OrderInvoiceShareLink> {
  return apiJson<OrderInvoiceShareLink>(`/api/orders/${orderId}/invoice-share-link`, {
    method: 'POST',
    token,
  });
}

export function getPublicOrderInvoice(shareToken: string): Promise<OrderRow> {
  return apiJson<OrderRow>(
    `/api/public/invoice/${encodeURIComponent(shareToken)}`,
  );
}

/* ===================================================================
 * V19.22 — Customer QR feedback (public + admin).
 * =================================================================== */

export type PublicFeedbackOrder = {
  orderId: string;
  serialNumber: string | null;
  invoiceNumber: string | null;
  totalKd: string;
  createdAt: string;
  driverFirstName: string | null;
  customerFirstName: string | null;
  alreadyRated: {
    rating: number;
    note: string | null;
    submittedAt: string;
  } | null;
};

export function getPublicOrderForFeedback(
  orderId: string,
): Promise<PublicFeedbackOrder> {
  return apiJson<PublicFeedbackOrder>(
    `/api/public/orders/${encodeURIComponent(orderId)}`,
  );
}

export function submitOrderFeedback(
  orderId: string,
  body: { rating: number; note?: string },
): Promise<{ ok: boolean; rating: number; note: string | null; at: string }> {
  return apiJson(`/api/public/orders/${encodeURIComponent(orderId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type FeedbackListRow = {
  id: string;
  rating: number;
  note: string | null;
  submittedAt: string;
  ipMasked: string | null;
  acknowledgedAt: string | null;
  order: {
    id: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
    totalKd: string;
    createdAt: string;
    status: string;
    driver: {
      id: string;
      fullName: string;
      username: string;
    } | null;
    customer: {
      id: string;
      displayName: string | null;
      phone: string;
    };
  };
};

export type FeedbackListResponse = {
  total: number;
  unread: number;
  avgRating: number;
  ratedCount: number;
  rows: FeedbackListRow[];
};

export function listFeedback(
  token: string,
  opts: { onlyUnread?: boolean; minRating?: number; maxRating?: number; take?: number; skip?: number } = {},
): Promise<FeedbackListResponse> {
  const qs = new URLSearchParams();
  if (opts.onlyUnread) qs.set('onlyUnread', 'true');
  if (opts.minRating != null) qs.set('minRating', String(opts.minRating));
  if (opts.maxRating != null) qs.set('maxRating', String(opts.maxRating));
  if (opts.take != null) qs.set('take', String(opts.take));
  if (opts.skip != null) qs.set('skip', String(opts.skip));
  const q = qs.toString();
  return apiJson<FeedbackListResponse>(
    `/api/feedback${q ? `?${q}` : ''}`,
    { token },
  );
}

export function acknowledgeFeedback(
  id: string,
  token: string,
): Promise<{ ok: boolean; alreadyAcknowledged: boolean }> {
  return apiJson(`/api/feedback/${encodeURIComponent(id)}/acknowledge`, {
    method: 'PATCH',
    token,
  });
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
  /** V1.7.1 — Short POS serial (e.g. "A-47") shown on the luxury success page. */
  serialNumber?: string | null;
  /** V1.7.1 — Longer back-office invoice number; fallback display when `serialNumber` is null. */
  invoiceNumber?: string | null;
  /** V1.7.1 — Direct PDF download (JWT-signed, 7d TTL). Populated only when `isPaid === true`. */
  pdfUrl?: string | null;
  /** V1.7.1 — Customer-facing SPA share URL for WhatsApp. Populated only when `isPaid === true`. */
  shareUrl?: string | null;
};

/** UPayments v2 id from the browser return URL (query often lost before the API). */
function parseGatewayTrackIdFromBrowserSearch(search: string): string {
  const raw = (search ?? '').replace(/^\?/, '');
  const normalized = raw.replace(/&amp;/gi, '&').replace(/%26amp%3B/gi, '&');
  const withQ = normalized.startsWith('?') ? normalized : `?${normalized}`;
  const m = /[?&]track_id=([^&#]+)/i.exec(withQ);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  const sp = new URLSearchParams(normalized);
  return (
    sp.get('track_id')?.trim() ||
    sp.get('TrackID')?.trim() ||
    sp.get('trackId')?.trim() ||
    ''
  );
}

function coalesceGatewayTrackIdForPublicPoll(
  explicit?: string,
): string {
  const a = explicit?.trim();
  if (a) {
    return a;
  }
  if (typeof window === 'undefined') {
    return '';
  }
  return parseGatewayTrackIdFromBrowserSearch(window.location.search);
}

function parseGatewayResultFromBrowserSearch(search: string): string {
  const raw = (search ?? '').replace(/^\?/, '');
  const normalized = raw.replace(/&amp;/gi, '&').replace(/%26amp%3B/gi, '&');
  const withQ = normalized.startsWith('?') ? normalized : `?${normalized}`;
  const m = /[?&]result=([^&#]+)/i.exec(withQ);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  const sp = new URLSearchParams(normalized);
  return sp.get('result')?.trim() || sp.get('Result')?.trim() || '';
}

function coalesceGatewayResultForPublicPoll(explicit?: string): string {
  const a = explicit?.trim();
  if (a) {
    return a;
  }
  if (typeof window === 'undefined') {
    return '';
  }
  return parseGatewayResultFromBrowserSearch(window.location.search);
}

/**
 * Always POST — CDNs/proxies have stripped query params before Node; JSON body
 * + optional `X-Gateway-Track-Id` carry the v2 track reliably. Falls back to
 * reading `track_id` from `window.location` when React state omits it.
 */
export function getPublicPaymentStatus(
  orderId: string,
  opts?: { returnTrackId?: string; gatewayResult?: string },
): Promise<PublicPaymentStatus> {
  const tid = coalesceGatewayTrackIdForPublicPoll(opts?.returnTrackId);
  const gatewayResult = coalesceGatewayResultForPublicPoll(
    opts?.gatewayResult,
  );
  const qs = new URLSearchParams();
  if (tid) {
    qs.set('track_id', tid);
  }
  if (gatewayResult) {
    qs.set('result', gatewayResult);
  }
  const qstr = qs.toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tid) {
    headers['X-Gateway-Track-Id'] = tid;
  }
  const bodyPayload: Record<string, string> = {};
  if (tid) {
    bodyPayload.trackId = tid;
    bodyPayload.track_id = tid;
  }
  if (gatewayResult) {
    bodyPayload.result = gatewayResult;
  }
  return apiJson<PublicPaymentStatus>(
    `/api/payments/status/${encodeURIComponent(orderId)}${qstr ? `?${qstr}` : ''}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
    },
  );
}

/**
 * Customer-triggered "Verify Payment" on the /payment/success|failed return
 * pages. Forces a Server-to-Server UPayments inquiry server-side and, if the
 * gateway reports CAPTURED, finalizes the order before responding. Returns a
 * ready-to-render Arabic message so the page can surface the gateway status
 * (or a polite "not captured yet" fallback).
 */
export type PublicPaymentRecheck = {
  orderId: string;
  status: PublicPaymentStatus['status'];
  isPaid: boolean;
  amountKd: string;
  trackIdPresent: boolean;
  gatewayResult: string | null;
  settledNow: boolean;
  messageAr: string;
  /** V1.7.1 — Same luxury-page fields as {@link PublicPaymentStatus}. */
  serialNumber?: string | null;
  invoiceNumber?: string | null;
  pdfUrl?: string | null;
  shareUrl?: string | null;
};

export function recheckPublicPayment(
  orderId: string,
  opts?: { returnTrackId?: string; gatewayResult?: string },
): Promise<PublicPaymentRecheck> {
  const tid = coalesceGatewayTrackIdForPublicPoll(opts?.returnTrackId);
  const gatewayResult = coalesceGatewayResultForPublicPoll(
    opts?.gatewayResult,
  );
  const qs = new URLSearchParams();
  if (tid) {
    qs.set('track_id', tid);
  }
  if (gatewayResult) {
    qs.set('result', gatewayResult);
  }
  const qstr = qs.toString();
  const headers: Record<string, string> = {};
  if (tid) {
    headers['X-Gateway-Track-Id'] = tid;
  }
  /** GET avoids `Cannot POST /api/...` when the SPA is served without an API proxy. */
  return apiJson<PublicPaymentRecheck>(
    `/api/payments/recheck/${encodeURIComponent(orderId)}${qstr ? `?${qstr}` : ''}`,
    {
      method: 'GET',
      headers,
    },
  );
}

/** Same UPayments inquiry as the public return page; includes `Authorization` for staff tools. */
export function recheckOrderPayment(
  token: string,
  orderId: string,
): Promise<PublicPaymentRecheck> {
  return apiJson<PublicPaymentRecheck>(
    `/api/payments/recheck/${encodeURIComponent(orderId)}`,
    /** GET: static hosts / mis-configured preview often reject POST to /api. */
    { method: 'GET', token },
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
  /** When API has EXPOSE_DEBT_BREAKDOWN=1 — same trace as subscriber row. */
  debtKdBreakdownTrace?: SubscriberListRow['debtKdBreakdownTrace'];
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
  /** V19.17 — salary defaults surfaced by the payroll registry page. */
  basicMonthlySalary?: string | null;
  monthlyAllowances?: string | null;
  /** V19.26 — Row order on مسير الرواتب within branch. */
  payrollRosterLineOrder?: number | null;
  /** V19.27 — Salary transfer / printed roster. */
  bankName?: string | null;
  bankIban?: string | null;
  mustChangePassword?: boolean;
  passwordUpdatedAt?: string | null;
};

export function resetUserPassword(
  token: string,
  userId: string,
  newPassword: string,
) {
  return apiJson<TeamUserRow>(`/api/users/${userId}/reset-password`, {
    method: 'POST',
    token,
    body: JSON.stringify({ newPassword }),
  });
}

export function resetUserPasswordsBulk(
  token: string,
  userIds: string[],
  newPassword: string,
) {
  return apiJson<{ updated: number }>('/api/users/reset-passwords-bulk', {
    method: 'POST',
    token,
    body: JSON.stringify({ userIds, newPassword }),
  });
}

/**
 * V19.17 — Patch salary defaults on a user. OWNER + GM only. Pass
 * `null` to clear a default, `undefined` to keep it unchanged.
 */
export function updateSalaryDefaults(
  token: string,
  userId: string,
  dto: {
    basicMonthlySalary?: number | null;
    monthlyAllowances?: number | null;
    payrollRosterLineOrder?: number | null;
    bankName?: string | null;
    bankIban?: string | null;
  },
) {
  return apiJson<TeamUserRow>(`/api/users/${userId}/salary-defaults`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(dto),
  });
}

/**
 * V19.17 — manual debt hold creation (Owner/GM). Passing `payrollId`
 * ties the hold directly to an existing payslip and increments that
 * row's `debtHoldAmount` on the server in one transaction; omitting
 * it leaves the hold unlinked so the NEXT payroll run absorbs it.
 */
export function createManualDebtHold(
  token: string,
  dto: {
    employeeUserId: string;
    holdAmount: number;
    note?: string;
    payrollId?: string;
  },
) {
  return apiJson<DebtHoldRow>('/api/debt-holds/manual', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

/** V19.17 — force-release a debt hold (Owner/GM). */
export function releaseDebtHold(token: string, id: string) {
  return apiJson<DebtHoldRow>(`/api/debt-holds/${id}/release`, {
    method: 'POST',
    token,
  });
}

/**
 * V19.17 — stamp a RELEASED hold as actually paid out to the
 * employee (voucher disbursement). Admin-only. Release runs on its
 * own schedule, independent of the payroll cycle.
 */
export function disburseDebtHold(token: string, id: string) {
  return apiJson<DebtHoldRow>(`/api/debt-holds/${id}/disburse`, {
    method: 'POST',
    token,
  });
}

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
  /**
   * V21 Phase 5 — server-computed totals so the frontend renders only.
   * `totalKd` is summed in Decimal precision on the backend; `cashCount`
   * and `knetCount` are tallied per `posPaymentMethod`.
   */
  totals: {
    totalKd: string;
    cashCount: number;
    knetCount: number;
  };
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
  /**
   * V21 Phase 5 — backend-computed sign so the frontend never has to
   * coerce the net-cash KWD string into a Number for the negative-tone
   * tinting. Use this boolean directly (or `isNegativeKd` on the
   * canonical helper) instead of reading the sign off the value itself.
   */
  netCashIsNegative: boolean;
  cashOrderCount: number;
};

export type ExpenseOwnerType = 'BRANCH' | 'DRIVER' | 'COMPANY';

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
  /**
   * STRICT ROLE-BASED EXPENSE DESIGN — Part 1.
   *
   * Derived ownership discriminator emitted by the backend
   * (`ExpensesService.deriveOwnerType`). NOT a stored column —
   * computed from `recordedBy.role + branchId` so the database stays
   * the single source of truth.
   */
  ownerType?: ExpenseOwnerType;
};

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 6 (SSoT).
 *
 * Single source of truth for every "total expense" displayed in the
 * UI. Returned by `GET /api/finance/expenses-summary` (OWNER /
 * GENERAL_MANAGER / ACCOUNTANT only). Frontends MUST consume this
 * shape instead of reducing/summing over `ExpenseRow[]`.
 */
export type ExpensesSummaryByOwner = {
  ownerType: ExpenseOwnerType;
  totalKd: string;
  count: number;
};

export type ExpensesSummaryByCategory = {
  category: string;
  totalKd: string;
  count: number;
};

export type ExpensesSummaryByBranch = {
  branchId: string | null;
  branchName: string | null;
  totalKd: string;
  count: number;
};

export type ExpensesSummaryMonthly = {
  month: string;
  totalKd: string;
  driverKd: string;
  branchKd: string;
  companyKd: string;
};

export type ExpensesSummaryAlert = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
};

/**
 * V24 — Wave B (Frontend Purge) addition.
 *
 * Per-recorder breakdown returned by the SSoT endpoint. Replaces
 * the per-driver bucket the deleted FE `expense-analytics.ts`
 * helper used to compute by reducing over `ExpenseRow[]`.
 */
export type ExpensesSummaryByDriver = {
  recordedById: string;
  recordedByName: string;
  totalKd: string;
  count: number;
};

/**
 * V24 — Wave B (Frontend Purge) addition.
 *
 * Server-computed car-vs-other split. Frontends MUST render this
 * directly instead of re-classifying rows via `isCarExpense(row)`.
 * `carShareBps` is basis-points integer (0..10000); divide by 100
 * for percent.
 */
export type ExpensesSummaryCarBreakdown = {
  carTotalKd: string;
  carCount: number;
  otherTotalKd: string;
  otherCount: number;
  carShareBps: number;
};

export type ExpensesSummaryResponse = {
  source: 'api/finance/expenses-summary';
  rangeFromIso: string;
  rangeToIso: string;
  branchScope: string | null;
  totalApprovedKd: string;
  totalPendingKd: string;
  approvedCount: number;
  byOwnerType: ExpensesSummaryByOwner[];
  byCategory: ExpensesSummaryByCategory[];
  byBranch: ExpensesSummaryByBranch[];
  byDriver: ExpensesSummaryByDriver[];
  carBreakdown: ExpensesSummaryCarBreakdown;
  monthly: ExpensesSummaryMonthly[];
  alerts: ExpensesSummaryAlert[];
};

export const API_EXPENSES_SUMMARY = '/api/finance/expenses-summary';

export function getExpensesSummary(
  token: string,
  params: { from: string; to: string; branchId?: string },
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.branchId) qs.set('branchId', params.branchId);
  return apiJson<ExpensesSummaryResponse>(
    `${API_EXPENSES_SUMMARY}?${qs.toString()}`,
    { token },
  );
}

// ─── V24 Wave B — Sales / Debt analytics SSoT ───────────────────────
// Replaces the deleted FE `sales-debt-analytics.ts` and
// `sales-debt-insights.ts` helpers. Frontends MUST consume this
// pre-computed view (Commandment #5: Don't Calculate, Just Ask).
export type SalesDebtAnalyticsPeriod = {
  fromIso: string;
  toIso: string;
};

export type SalesDebtAnalyticsTotals = {
  totalSalesKd: string;
  totalCollectedKd: string;
  totalDebtKd: string;
  /** Collection rate as basis points (integer 0..10000); divide by 100 for percent. */
  collectionRateBps: number;
  invoiceCount: number;
};

export type SalesDebtAnalyticsGroup = {
  id: string;
  name: string;
  totalSalesKd: string;
  totalCollectedKd: string;
  totalDebtKd: string;
  /** Per-group collection rate as basis points (integer 0..10000). */
  collectionRateBps: number;
  invoiceCount: number;
};

export type SalesDebtInsightSeverity = 'info' | 'warning' | 'critical';
export type SalesDebtInsightTarget = 'branch' | 'driver';

export type SalesDebtInsight = {
  id: string;
  severity: SalesDebtInsightSeverity;
  message: string;
  target?: SalesDebtInsightTarget;
};

export type SalesDebtAnalyticsResponse = {
  source: 'api/finance/sales-debt-analytics';
  period: SalesDebtAnalyticsPeriod;
  totals: SalesDebtAnalyticsTotals;
  byBranch: SalesDebtAnalyticsGroup[];
  byDriver: SalesDebtAnalyticsGroup[];
  insights: SalesDebtInsight[];
};

export const API_SALES_DEBT_ANALYTICS = '/api/finance/sales-debt-analytics';

export function getFinanceSalesDebtAnalytics(
  token: string,
  params: { from: string; to: string },
) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return apiJson<SalesDebtAnalyticsResponse>(
    `${API_SALES_DEBT_ANALYTICS}?${qs.toString()}`,
    { token },
  );
}

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
  /** HQ / cost-center branch: no POS, hidden from operational roles in `/api/branches`. */
  isAdministrative: boolean;
  /** V19.26 — Lower value first on printed payroll roster (null = after set values). */
  payrollRosterSortOrder?: number | null;
  updatedAt: string;
};

export function listBranches(token: string) {
  return apiJson<BranchRow[]>('/api/branches', { token });
}

/**
 * V19.21 — partial update payload. All fields optional so the Owner
 * can flip `isActive` alone without re-submitting the name/location.
 * Mirrors `UpdateBranchDto` on the backend.
 */
export type UpdateBranchInput = {
  name?: string;
  location?: string;
  phone?: string;
  isActive?: boolean;
  isAdministrative?: boolean;
  payrollRosterSortOrder?: number | null;
};

/** V19.21 — OWNER / GM edit a branch. See BranchesController PATCH. */
export function updateBranch(
  token: string,
  id: string,
  dto: UpdateBranchInput,
) {
  return apiJson<BranchRow>(`/api/branches/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(dto),
  });
}

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
  isAdministrative: boolean;
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
  /** V19.15 — open debt from INVOICE_SHORTFALL after per-customer PAYMENT waterfall. */
  outstandingInvoiceDebtKd: string;
  /** V19.15 — open debt from SUBSCRIPTION_OVERUSE after waterfall. */
  outstandingSubscriptionDebtKd: string;
  /** Sum of the two; matches collections red-card style total. */
  outstandingDebtKd: string;
};

/** V19.16 — STOCK_OUT aggregates for monthly summary print (consumption). */
export type MonthlySummaryInventoryLine = {
  stockItemId: string;
  code: string;
  nameAr: string;
  unit: string;
  quantityConsumed: string;
  movementCount: number;
};

export type MonthlySummaryInventoryBranch = {
  branchId: string;
  branchName: string;
  lines: MonthlySummaryInventoryLine[];
};

/** V19.17 — Rollups by posting type inside the report window (audit / completeness). */
export type MonthlySummaryLedgerGlRow = {
  entryType: string;
  totalKd: string;
  movementCount: number;
};

export type MonthlySummaryLedgerJournalRow = {
  type: string;
  totalKd: string;
  movementCount: number;
};

export type MonthlySummaryLedgerDebtRow = {
  source: string;
  totalKd: string;
  movementCount: number;
};

export type MonthlySummaryLedgerRollup = {
  generalLedger: MonthlySummaryLedgerGlRow[];
  walletJournal: MonthlySummaryLedgerJournalRow[];
  debtLedger: MonthlySummaryLedgerDebtRow[];
};

export type MonthlySummaryReport = {
  from: string;
  to: string;
  /** V19.17 — Every GL / wallet / debt-ledger bucket that moved in-range. */
  ledgerRollup?: MonthlySummaryLedgerRollup;
  consolidated: Omit<
    MonthlySummaryBranchRow,
    'branchId' | 'branchName' | 'isAdministrative'
  >;
  branches: MonthlySummaryBranchRow[];
  inventoryConsumption: { branches: MonthlySummaryInventoryBranch[] };
};

/** V19.24 — `/api/reports/money-flow-statement` */
export type MoneyFlowBranchExpenseRow = {
  category: string;
  totalKd: string;
  movementCount: number;
};

export type MoneyFlowVehicleExpenseRow = {
  expenseType: string;
  totalKd: string;
  movementCount: number;
};

export type MoneyFlowFixedExpenseRow = {
  category: string;
  totalKd: string;
};

export type MoneyFlowStatementReport = {
  from: string;
  to: string;
  executive: ExecutiveSummaryReport;
  collections: {
    collectedRevenueKd: string;
    uncollectedRevenueKd: string;
  };
  /** PAYMENT rows linked to invoices completed before `from` (monthly-summary KPI). */
  debtPaymentsPriorInvoiceKd: string;
  branchExpensesByCategory: MoneyFlowBranchExpenseRow[];
  vehicleExpensesByType: MoneyFlowVehicleExpenseRow[];
  fixedExpensesByCategory: MoneyFlowFixedExpenseRow[];
  ledgerRollup: MonthlySummaryLedgerRollup;
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
  branches: { branchId: string; branchName: string; isLive: boolean }[];
};

export type PayrollStatus = 'PENDING' | 'PAID';

export type PayrollRow = {
  id: string;
  userId: string;
  branchId: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  /** V19.16 — released commission paid in this run (informational). */
  commissionAmount: string;
  /** V19.16 — slice withheld this run for open customer debt. */
  debtHoldAmount: string;
  /** V19.16 — previously-held debt released back to the employee. */
  debtReleaseAmount: string;
  /**
   * V19.20 — scheduled monthly loan instalment consumed by this
   * payroll run. Shown as a dedicated deducted line on the payslip
   * and subtracted from net. Idempotent per YYYY-MM on the server,
   * so re-saving the same month leaves the already-booked figure.
   */
  loanDeduction: string;
  /**
   * V21 Phase 5 — backend-computed net salary (4dp Decimal):
   *   basic + allowances + commission + debtRelease
   *   − deductions − debtHold − loanDeduction
   * Print pages render this verbatim through `formatKwdLabel`; never
   * recompute on the client.
   */
  netSalaryKd: string;
  paymentDate: string;
  status: PayrollStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    payrollRosterLineOrder?: number | null;
    bankIban?: string | null;
  };
  branch: {
    id: string;
    name: string;
    payrollRosterSortOrder?: number | null;
  };
};

/** V19.28 — manual مسير row (no User); same month key as payroll `paymentDate`. */
export type PayrollAdHocLineRow = {
  id: string;
  branchId: string;
  periodYm: string;
  lineSort: number;
  beneficiaryName: string;
  bankName: string | null;
  bankIban: string | null;
  basicSalary: string;
  allowances: string;
  deductions: string;
  /**
   * V21 Phase 5 — backend-computed net salary at 4dp Decimal:
   *   basic + allowances − deductions
   * Renders verbatim on the roster print sheet; never recompute.
   */
  netSalaryKd: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
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

export type StaffDebtsEmployeeOption = {
  value: string;
  label: string;
  branchId: string | null;
  kind: 'driver' | 'manager';
};

export type StaffDebtsDriverRow = DriverBalanceRow & {
  isOverdue: boolean;
  shiftAgeHours: number | null;
};

export type StaffDebtsResponse = {
  drivers: StaffDebtsDriverRow[];
  managers: ManagerCashCustodyRow[];
  branches: Pick<BranchRow, 'id' | 'name'>[];
  employeeOptions: StaffDebtsEmployeeOption[];
  selectedEmployee: StaffDebtsEmployeeOption | null;
  showBranchFilter: boolean;
  appliedFilters: {
    branch: string;
    name: string;
    employee: string;
    status: 'ALL' | 'OVERDUE' | 'CURRENT';
  };
  totals: {
    pipelineTotalKd: string;
    driverTotalKd: string;
    managerTotalKd: string;
    driverBreakdown: {
      cashKd: string;
      knetKd: string;
      linkKd: string;
      onlineKd: string;
    };
    overdueDriverCount: number;
    overdueManagerCount: number;
    totalOverdueCount: number;
    driverRowCount: number;
    managerRowCount: number;
  };
  generatedAt: string;
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

/**
 * V19.17 — DRIVER — list every formal cash-handover receipt issued to
 * me by a branch manager (past and present). Powers the driver's
 * "سندات الاستلام" page and the per-receipt printable voucher.
 */
export function listMyDriverCashReceipts(token: string) {
  return apiJson<ManagerCashCustodyRow[]>('/api/manager-custody/driver/mine', {
    token,
  });
}

/**
 * V19.17 — fetch a single cash-handover receipt for the printable
 * voucher. Access is enforced server-side (driver-self, manager-self,
 * or back-office audit roles).
 */
export function getCashReceipt(token: string, custodyId: string) {
  return apiJson<ManagerCashCustodyRow>(
    `/api/manager-custody/${custodyId}`,
    { token },
  );
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

export function listPayrollAdhocLines(
  token: string,
  ym: string,
  branchId?: string,
) {
  const qs = new URLSearchParams({ ym });
  if (branchId) qs.set('branchId', branchId);
  return apiJson<PayrollAdHocLineRow[]>(`/api/payroll/adhoc-lines?${qs}`, {
    token,
  });
}

export function createPayrollAdhocLine(
  token: string,
  body: {
    branchId: string;
    periodYm: string;
    beneficiaryName: string;
    bankName?: string | null;
    bankIban?: string | null;
    basicSalary: number;
    allowances?: number;
    deductions?: number;
    lineSort?: number;
    note?: string | null;
  },
) {
  return apiJson<PayrollAdHocLineRow>('/api/payroll/adhoc-lines', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function updatePayrollAdhocLine(
  token: string,
  id: string,
  body: {
    beneficiaryName?: string;
    bankName?: string | null;
    bankIban?: string | null;
    basicSalary?: number;
    allowances?: number;
    deductions?: number;
    lineSort?: number;
    note?: string | null;
  },
) {
  return apiJson<PayrollAdHocLineRow>(`/api/payroll/adhoc-lines/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function deletePayrollAdhocLine(token: string, id: string) {
  return apiJson<{ id: string; deleted: boolean }>(
    `/api/payroll/adhoc-lines/${id}`,
    { method: 'DELETE', token },
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
  /**
   * V21 Phase 5 — backend-computed `paidKd = max(0, amount − remaining)` at
   * 4dp. The print page renders this directly through the canonical
   * `formatKwdLabel`; never recompute on the client.
   */
  paidKd: string;
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

/**
 * V19.19 — manual loan deduction by OWNER / GM. Payroll no longer
 * auto-deducts loan instalments; every repayment is posted explicitly
 * here so it can't be taken twice if the same month's payroll is re-run.
 */
export function deductLoan(
  token: string,
  id: string,
  amount: number,
  note?: string,
) {
  return apiJson<LoanRow>(`/api/loans/${id}/deduct`, {
    method: 'POST',
    token,
    body: JSON.stringify({ amount, ...(note ? { note } : {}) }),
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
  /** V19.16 — new bands surfaced on the payslip; see PayrollRow. */
  commissionAmount: string;
  debtHoldAmount: string;
  debtReleaseAmount: string;
  /** V19.20 — scheduled loan instalment consumed by this payroll. */
  loanDeduction: string;
  /**
   * V21 Phase 5 — backend-computed net salary at 4dp Decimal:
   *   basic + allowances + commission + debtRelease
   *   − deductions − debtHold − loanDeduction
   */
  netSalaryKd: string;
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

/**
 * V19.20 — backfill the scheduled loan instalment on a PENDING
 * payroll that was created before the loan→payroll hook existed.
 * The server only touches loans whose high-water mark is NULL, so
 * repeated clicks are a safe no-op.
 */
export function recalcPayrollLoan(token: string, id: string) {
  return apiJson<PayrollRow>(`/api/payroll/${id}/recalc-loan`, {
    method: 'POST',
    token,
  });
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
    | 'SUBSCRIPTION'
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

// ---------------------------------------------------------------------------
// V19.16 — Commission, Debt-Hold & System Settings (Owner / Admin).
// ---------------------------------------------------------------------------

export type SystemToggleKey =
  | 'COMMISSION'
  | 'DEBT_HOLD'
  | 'PAYROLL'
  | 'LOANS'
  | 'ATTENDANCE';

export type SystemToggleRow = {
  key: SystemToggleKey;
  isEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function listSystemToggles(token: string) {
  return apiJson<SystemToggleRow[]>('/api/system-settings/toggles', { token });
}

export function setSystemToggle(
  token: string,
  dto: { key: SystemToggleKey; isEnabled: boolean },
) {
  return apiJson<SystemToggleRow>('/api/system-settings/toggles', {
    method: 'PATCH',
    token,
    body: JSON.stringify(dto),
  });
}

export type DebtHoldMode = 'FULL' | 'FIXED';

export type DebtHoldPolicy = {
  id: string;
  isActive: boolean;
  holdMode: DebtHoldMode;
  fixedAmount: string | null;
  updatedAt: string;
};

export function getDebtHoldPolicy(token: string) {
  return apiJson<DebtHoldPolicy>('/api/system-settings/debt-hold-policy', {
    token,
  });
}

export function updateDebtHoldPolicy(
  token: string,
  dto: {
    isActive: boolean;
    holdMode: DebtHoldMode;
    fixedAmount?: number;
  },
) {
  return apiJson<DebtHoldPolicy>('/api/system-settings/debt-hold-policy', {
    method: 'PUT',
    token,
    body: JSON.stringify(dto),
  });
}

export type PayrollSettings = {
  id: string;
  payDayOfMonth: number;
  autoDeductLoans: boolean;
  linkWithAttendance: boolean;
  updatedAt: string;
};

export function getPayrollSettings(token: string) {
  return apiJson<PayrollSettings>('/api/system-settings/payroll-settings', {
    token,
  });
}

export function updatePayrollSettings(
  token: string,
  dto: {
    payDayOfMonth: number;
    autoDeductLoans: boolean;
    linkWithAttendance: boolean;
  },
) {
  return apiJson<PayrollSettings>('/api/system-settings/payroll-settings', {
    method: 'PUT',
    token,
    body: JSON.stringify(dto),
  });
}

/**
 * SystemConfig — operational-only platform settings (single row).
 * Currently exposes the WhatsApp alert recipient for the System
 * Guardian. NEVER touches financial state.
 */
export type GuardianPhoneSource = 'database' | 'env' | 'none';

export type SystemConfigResponse = {
  guardianPhone: string | null;
  resolved: { phone: string | null; source: GuardianPhoneSource };
  updatedAt: string | null;
};

export function getSystemConfig(token: string) {
  return apiJson<SystemConfigResponse>('/api/system-config', { token });
}

export function updateSystemConfig(
  token: string,
  dto: { guardianPhone: string | null },
) {
  return apiJson<SystemConfigResponse>('/api/system-config', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

/** V8.5 — global reporting-layer KNET / card fee knobs (`PaymentMethodFeeConfig`). */
export type KnetCommissionRule =
  | 'HIGHER_OF_FLAT_AND_PERCENT'
  | 'FLAT_ONLY'
  | 'PERCENT_ONLY';

export type PaymentMethodFeeConfig = {
  id: string;
  knetFlatKd: string;
  knetPercentOfGross: string;
  knetRule: KnetCommissionRule;
  cardPercentOfGross: string;
  updatedAt: string;
};

export function getPaymentMethodFeeConfig(token: string) {
  return apiJson<PaymentMethodFeeConfig>('/api/payment-method-fees', { token });
}

export function updatePaymentMethodFeeConfig(
  token: string,
  dto: {
    /** V24 — canonical 4dp KWD string (e.g. '0.1000'). NEVER a number. */
    knetFlatKd?: string;
    knetPercentOfGross?: number;
    knetRule?: KnetCommissionRule;
    cardPercentOfGross?: number;
  },
) {
  return apiJson<PaymentMethodFeeConfig>('/api/payment-method-fees', {
    method: 'PATCH',
    token,
    body: JSON.stringify(dto),
  });
}

export type CommissionMode = 'SALE' | 'COLLECTION';
export type CommissionCalculationBase =
  | 'ORDER_TOTAL'
  | 'INVOICE_TOTAL'
  | 'NET_AFTER_KNET'
  | 'EXCLUDE_SUBSCRIPTIONS';
export type CommissionPayoutTiming =
  | 'IMMEDIATE'
  | 'AFTER_COLLECTION'
  | 'END_OF_MONTH';
export type CommissionPayoutStatus =
  | 'PENDING'
  | 'RELEASED'
  | 'PAID'
  | 'CANCELLED';

export type CommissionRuleRow = {
  id: string;
  name: string;
  isActive: boolean;
  role: SafariRole | null;
  mode: CommissionMode;
  calculationBase: CommissionCalculationBase;
  percentage: string;
  minInvoiceAmount: string;
  payoutTiming: CommissionPayoutTiming;
  linkedToDebt: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listCommissionRules(
  token: string,
  query?: { mode?: CommissionMode },
) {
  const q = new URLSearchParams();
  if (query?.mode) q.set('mode', query.mode);
  const qs = q.toString();
  return apiJson<CommissionRuleRow[]>(
    `/api/commission-rules${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export type CommissionRuleInput = {
  name: string;
  isActive?: boolean;
  role?: SafariRole | null;
  mode: CommissionMode;
  calculationBase?: CommissionCalculationBase;
  percentage: number;
  minInvoiceAmount?: number;
  payoutTiming?: CommissionPayoutTiming;
  linkedToDebt?: boolean;
};

export function createCommissionRule(token: string, dto: CommissionRuleInput) {
  return apiJson<CommissionRuleRow>('/api/commission-rules', {
    method: 'POST',
    token,
    body: JSON.stringify(dto),
  });
}

export function updateCommissionRule(
  token: string,
  id: string,
  dto: Partial<CommissionRuleInput>,
) {
  return apiJson<CommissionRuleRow>(`/api/commission-rules/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(dto),
  });
}

export function deleteCommissionRule(token: string, id: string) {
  return apiJson<CommissionRuleRow>(`/api/commission-rules/${id}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * V19.17 — Dashboard-level "default rule" (role = null). Returns null
 * when none has been saved yet.
 */
export function getDefaultCommissionRule(token: string) {
  return apiJson<CommissionRuleRow | null>(
    '/api/commission-rules/default',
    { token },
  );
}

export function upsertDefaultCommissionRule(
  token: string,
  dto: CommissionRuleInput,
) {
  return apiJson<CommissionRuleRow>('/api/commission-rules/default', {
    method: 'PUT',
    token,
    body: JSON.stringify(dto),
  });
}

export type CommissionPayoutRow = {
  id: string;
  ruleId: string;
  earnerUserId: string;
  mode: CommissionMode;
  basisAmount: string;
  percentage: string;
  amount: string;
  status: CommissionPayoutStatus;
  sourceOrderId: string | null;
  sourceDebtEntryId: string | null;
  payrollId: string | null;
  earnedAt: string;
  releasedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rule: {
    id: string;
    name: string;
    mode: CommissionMode;
    percentage: string;
    payoutTiming: CommissionPayoutTiming;
    calculationBase: CommissionCalculationBase;
  };
  earner: { id: string; fullName: string; username: string };
  sourceOrder: {
    id: string;
    serialNumber: string | null;
    invoiceNumber: string | null;
  } | null;
};

export type CommissionPayoutsTotals = {
  earnerUserId: string;
  pendingKd: string;
  releasedKd: string;
  paidKd: string;
  cancelledKd: string;
};

export type CommissionPayoutsResponse = {
  rows: CommissionPayoutRow[];
  totals: CommissionPayoutsTotals[];
  summaryTotals: Omit<CommissionPayoutsTotals, 'earnerUserId'>;
};

export function listCommissionPayouts(
  token: string,
  query: {
    from: string;
    to: string;
    earnerUserId?: string;
    status?: CommissionPayoutStatus;
  },
) {
  const q = new URLSearchParams({ from: query.from, to: query.to });
  if (query.earnerUserId) q.set('earnerUserId', query.earnerUserId);
  if (query.status) q.set('status', query.status);
  return apiJson<CommissionPayoutsResponse>(
    `/api/commission-payouts?${q.toString()}`,
    { token },
  );
}

export type DebtHoldStatus = 'HELD' | 'RELEASED';

export type DebtHoldRow = {
  id: string;
  employeeUserId: string;
  payrollId: string | null;
  debtAmount: string;
  holdAmount: string;
  releasedAmount: string;
  status: DebtHoldStatus;
  releaseDate: string | null;
  disbursedAt: string | null;
  disbursedById: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; fullName: string; username: string };
  payroll: {
    id: string;
    paymentDate: string;
    status: PayrollStatus;
  } | null;
  disbursedBy:
    | { id: string; fullName: string; username: string }
    | null;
};

export type DebtHoldTotals = {
  heldKd: string;
  pendingKd: string;
  disbursedKd: string;
};

export type DebtHoldEmployeeBucket = {
  employeeUserId: string;
  fullName: string;
  heldKd: string;
  pendingKd: string;
  disbursedKd: string;
  heldIds: string[];
  pendingIds: string[];
};

export type DebtHoldsListResponse = {
  rows: DebtHoldRow[];
  totals: DebtHoldTotals;
  perEmployee: DebtHoldEmployeeBucket[];
};

export function listDebtHolds(
  token: string,
  query: {
    from?: string;
    to?: string;
    employeeUserId?: string;
    status?: DebtHoldStatus;
  },
) {
  const q = new URLSearchParams();
  if (query.from) q.set('from', query.from);
  if (query.to) q.set('to', query.to);
  if (query.employeeUserId) q.set('employeeUserId', query.employeeUserId);
  if (query.status) q.set('status', query.status);
  const qs = q.toString();
  return apiJson<DebtHoldsListResponse>(
    `/api/debt-holds${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export type DebtHoldPreview = {
  isPolicyActive: boolean;
  debtKd: string;
  holdKd: string;
  holdMode: DebtHoldMode | null;
};

export function previewDebtHold(token: string, employeeUserId: string) {
  return apiJson<DebtHoldPreview>(
    `/api/debt-holds/preview/${employeeUserId}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// V19.36 — Cash Intelligence (read-only, advisory-only).
//
// The backend pipeline owns ALL financial logic. The frontend is a passive
// consumer: every endpoint here is a `GET` that returns a deterministic,
// branch-clamped projection. For MANAGER, the response is automatically
// filtered to the JWT's branchId server-side — these helpers MUST NOT pass
// a branchId in the query.
// ---------------------------------------------------------------------------

export type CashIntelTrafficLight = 'GREEN' | 'YELLOW' | 'RED';
export type CashIntelAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type CashIntelUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

export type CashIntelOperationalAlertType =
  | 'SHIFT_COMPLIANCE_DELAY'
  | 'SHIFT_OVERDUE_FINANCIAL'
  | 'PRE_SHIFT_OVERDUE'
  | 'HIGH_DRIVER_EXPOSURE'
  | 'STUCK_AT_DRIVER'
  | 'HANDOVER_DELAY'
  | 'CUSTODY_DELAY'
  | 'DEPOSIT_NOT_REGISTERED'
  | 'DEPOSIT_AMOUNT_MISMATCH'
  | 'OVERPAYMENT_ANOMALY'
  | 'DOUBLE_COUNT_RISK';

export type CashIntelOperationalDriverStatus =
  | 'ACTIVE'
  | 'AT_RISK'
  | 'EXPOSURE_ONLY'
  | 'STALE';

export type CashIntelActiveDriver = {
  driverId: string;
  driverName: string | null;
  branchId: string | null;
  ordersTodayCount: number;
  collectedCashToday: string;
  totalCash: string;
  lastCashActivityDate: string | null;
  shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
  shiftDurationHours: number | null;
  countdownMinutes: number | null;
  status: CashIntelOperationalDriverStatus;
};

export type CashIntelOperationalAlert = {
  type: CashIntelOperationalAlertType;
  /** Authoritative classification from /classified (source of truth). */
  domain: 'FINANCIAL' | 'COMPLIANCE';
  severity: CashIntelAlertSeverity;
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  amount: string;
  message: string;
  timestamp: string;
  countdownMinutes: number | null;
  isPrediction: boolean;
  originalType: string | null;
};

export type CashIntelOperationalResponse = {
  timestamp: string;
  realtimeStatus: CashIntelTrafficLight;
  activeDrivers: CashIntelActiveDriver[];
  driversAtRisk: CashIntelActiveDriver[];
  alerts: CashIntelOperationalAlert[];
  hidden: {
    staleDriversCount: number;
    excludedAlertCount: number;
    note: string;
  };
  summary: {
    totalDriversShown: number;
    totalCash: string;
    driversAtRisk: number;
    activeAlerts: number;
  };
  readOnly: true;
  advisoryOnly: true;
};

export type CashIntelDecisionAction = {
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  alertType: string;
  amount: string;
  action: string;
  reason: string;
  urgency: CashIntelUrgency;
  recommendedSteps: string[];
  timestamp: string;
};

export type CashIntelDecisionTopRisk = {
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  amount: string;
  issue: string;
  action: string;
  urgency: CashIntelUrgency;
  recommendedSteps: string[];
  alertType: string;
};

export type CashIntelDecisionsResponse = {
  timestamp: string;
  realtimeStatus: CashIntelTrafficLight;
  topRisk: CashIntelDecisionTopRisk | null;
  actions: CashIntelDecisionAction[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    totalActions: number;
  };
  readOnly: true;
  advisoryOnly: true;
};

export type CashIntelExecutiveResponsible =
  | 'DRIVER'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'SYSTEM'
  | null;

export type CashIntelExecutionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED';

export type CashIntelExecutionAction =
  | 'CONTACTED'
  | 'FOLLOWED_UP'
  | 'ESCALATED';

export type CashIntelExecutionBlock = {
  status: CashIntelExecutionStatus;
  lastAction: CashIntelExecutionAction | null;
  lastActionAt: string | null;
  lastActor: string | null;
  flagsToday: number;
  flagsThisWeek: number;
  repeatIssue: boolean;
};

export type CashIntelExecutiveTopRisk = {
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  amount: string;
  issue: string;
  action: string;
  urgency: CashIntelUrgency;
  responsible: CashIntelExecutiveResponsible;
  recommendedSteps: string[];
  alertType: string;
  execution: CashIntelExecutionBlock | null;
};

export type CashIntelExecutiveAction = {
  driverName: string | null;
  action: string;
  urgency: CashIntelUrgency;
  responsible: CashIntelExecutiveResponsible;
  amount: string;
  alertType: string;
};

export type CashIntelExecutiveResponse = {
  systemStatus: CashIntelTrafficLight;
  generatedAt: string;
  topRisk: CashIntelExecutiveTopRisk | null;
  actions: CashIntelExecutiveAction[];
  summary: {
    activeDrivers: number;
    driversAtRisk: number;
    criticalAlerts: number;
    warningAlerts: number;
  };
  auditReference: {
    totalAlerts: number;
    hiddenStaleDrivers: number;
    totalCashInFlight: string;
    lastPollAt: string | null;
  };
  decisionNote: string;
  readOnly: true;
  advisoryOnly: true;
};

export type CashIntelLiveAlert = {
  type: string;
  severity: CashIntelAlertSeverity;
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  amount: string;
  message: string;
  timestamp: string;
  countdownMinutes: number | null;
  isPrediction: boolean;
  dedupKey: string | null;
};

export type CashIntelLiveResponse = {
  timestamp: string;
  lastPollAt: string | null;
  lastPollAgeSeconds: number | null;
  realtimeStatus: CashIntelTrafficLight;
  activeDrivers: number;
  preRisk: CashIntelLiveAlert[];
  alerts: CashIntelLiveAlert[];
  driversAtRisk: Array<{
    driverId: string;
    driverName: string | null;
    branchId: string | null;
    totalCash: string;
    flowsCount: number;
    shiftStatus: 'OPEN' | 'CLOSED' | 'NO_SHIFT';
    shiftDurationHours: number | null;
    countdownMinutes: number | null;
  }>;
  locationSummary: {
    DRIVER: string;
    CUSTODY: string;
    BANK: string;
  };
  summary: {
    totalCash: string;
    driversAtRisk: number;
    activeAnomalies: number;
    openShifts: number;
  };
  readOnly: true;
  advisoryOnly: true;
};

export function getCashIntelLive(token: string, signal?: AbortSignal) {
  return apiJson<CashIntelLiveResponse>('/api/cash-intelligence/live', {
    token,
    signal,
  });
}

// ─── /classified — single source of truth ──────────────────────────
//
// Owned by `CashClassifierService`. Every other layer (operational,
// decisions, executive, risk) inherits its severity / domain / system-
// status from this payload. The Manager Dashboard reads it directly
// so the UI never depends on derivative endpoints.

export type CashIntelClassifiedDomain = 'FINANCIAL' | 'COMPLIANCE';

export type CashIntelClassifiedDriverStatus =
  | 'NORMAL'
  | 'COMPLIANCE_ONLY'
  | 'AT_RISK';

export type CashIntelClassifiedAlert = {
  domain: CashIntelClassifiedDomain;
  type: string;
  severity: CashIntelAlertSeverity;
  driverId: string | null;
  driverName: string | null;
  branchId: string | null;
  amount: string;
  cashAgeHours: number;
  reason: string;
  originalType: string | null;
};

export type CashIntelHolderRole =
  | 'OWNER'
  | 'GENERAL_MANAGER'
  | 'MANAGER'
  | 'DRIVER'
  | 'WORKER'
  | 'CALL_CENTER'
  | 'CALL_CENTER_SUPERVISOR'
  | 'FLEET_SUPERVISOR'
  | 'ACCOUNTANT'
  | 'SUPERVISOR'
  | 'VIEWER'
  | 'CUSTOMER';

export type CashIntelClassifiedDriver = {
  driverId: string;
  driverName: string | null;
  branchId: string | null;
  // Server-provided role of the cash holder. Lets dashboards split
  // DRIVER cash from MANAGER cash without re-querying the user table.
  // `null` only when the user record was deleted (orphan rows).
  holderRole: CashIntelHolderRole | null;
  status: CashIntelClassifiedDriverStatus;
  cashAgeHours: number;
  amount: string;
  shiftDurationHours: number | null;
  note: string;
};

export type CashIntelClassifiedResponse = {
  systemStatus: CashIntelTrafficLight;
  financialAlerts: CashIntelClassifiedAlert[];
  complianceAlerts: CashIntelClassifiedAlert[];
  drivers: CashIntelClassifiedDriver[];
  /**
   * V21 Phase 5 — backend-precomputed Σ `drivers[].amount` in 4dp.
   * Dashboards read this verbatim; the previous frontend reduce was
   * retired so the UI never re-derives the canonical cash total.
   */
  totalCashKd: string;
  finalDecision: string;
  rules: {
    gracePeriodHours: number;
    smallAmountFloorKd: string;
    financialChainTypes: string[];
    complianceTypes: string[];
    shiftFinancialSeverityCap: CashIntelAlertSeverity;
    generatedAt: string;
  };
  readOnly: true;
  advisoryOnly: true;
};

export function getCashIntelClassified(token: string, signal?: AbortSignal) {
  return apiJson<CashIntelClassifiedResponse>(
    '/api/cash-intelligence/classified',
    { token, signal },
  );
}

// ─── /dashboard — UNIFIED UI-READY surface (frontend SSoT) ─────────
//
// Single backend surface for the cash dashboard. The shape is
// pre-projected from `/classified` + `/executive` so the frontend
// computes nothing — `totalCash` is `Σ classified.drivers[].amount`,
// per-driver `totalCash` mirrors the classifier amount verbatim, and
// `summaryText` is a deterministic Arabic label keyed on
// `systemStatus`. Use this for ANY UI surface that needs to show a
// per-driver or aggregate cash number.

export type CashIntelDashboardDriver = {
  driverId: string;
  name: string;
  totalCash: string;
  status: CashIntelClassifiedDriverStatus;
  oldestAgeHours: number;
};

export type CashIntelDashboardResponse = {
  systemStatus: CashIntelTrafficLight;
  totalCash: string;
  summaryText: string;
  alerts: {
    financial: CashIntelClassifiedAlert[];
    compliance: CashIntelClassifiedAlert[];
  };
  drivers: CashIntelDashboardDriver[];
  topRisk: CashIntelExecutiveResponse['topRisk'];
  generatedAt: string;
  readOnly: true;
  advisoryOnly: true;
};

export function getCashIntelligenceDashboard(
  token: string,
  signal?: AbortSignal,
) {
  return apiJson<CashIntelDashboardResponse>(
    '/api/cash-intelligence/dashboard',
    { token, signal },
  );
}

export function getCashIntelOperational(token: string, signal?: AbortSignal) {
  return apiJson<CashIntelOperationalResponse>(
    '/api/cash-intelligence/operational',
    { token, signal },
  );
}

export function getCashIntelDecisions(token: string, signal?: AbortSignal) {
  return apiJson<CashIntelDecisionsResponse>(
    '/api/cash-intelligence/decisions',
    { token, signal },
  );
}

export function getCashIntelExecutive(token: string, signal?: AbortSignal) {
  return apiJson<CashIntelExecutiveResponse>(
    '/api/cash-intelligence/executive',
    { token, signal },
  );
}

// ─── System Verify ────────────────────────────────────────────────
//
// `/verify` runs synthetic safety scenarios through the classifier,
// risk engine, and executive composer and returns PASS/FAIL plus a
// per-scenario breakdown. Read-only on the wire and on the backend
// (the service synthesises in-memory analyses; no Prisma reads).
//
// RBAC: OWNER + GENERAL_MANAGER only — the rest of the dashboard
// hides the trigger button. The hook + button gate visibility on the
// frontend, but the backend re-asserts the policy.

export type CashIntelVerifyVerdict = 'PASS' | 'FAIL';

export type CashIntelVerifyCheck = {
  scenario: string;
  expected: CashIntelTrafficLight;
  classified: CashIntelTrafficLight;
  risk: CashIntelTrafficLight;
  executive: CashIntelTrafficLight;
  financialAlerts: number;
  complianceAlerts: number;
  ok: boolean;
};

export type CashIntelVerifyResponse = {
  status: CashIntelVerifyVerdict;
  blocked: boolean;
  checks: CashIntelVerifyCheck[];
  mismatches: string[];
  generatedAt: string;
  readOnly: true;
};

export function verifyCashIntelSystem(
  token: string,
  signal?: AbortSignal,
): Promise<CashIntelVerifyResponse> {
  return apiJson<CashIntelVerifyResponse>(
    '/api/cash-intelligence/verify',
    { token, signal },
  );
}

// ─── Integrity Audit ──────────────────────────────────────────────
//
// `/integrity-audit` cross-checks every cash-intelligence layer the
// dashboard sees and lists every numeric / status drift between
// them. Read-only end-to-end.

export type CashIntelIntegrityIssueSeverity = 'CRITICAL' | 'WARNING';

export type CashIntelIntegrityIssueType =
  | 'STATUS_DRIFT'
  | 'CRITICAL_COUNT_MISMATCH'
  | 'WARNING_COUNT_MISMATCH'
  | 'TOPRISK_INCONSISTENCY'
  | 'AMOUNT_FLOOR_VIOLATION'
  | 'AGE_GATE_VIOLATION'
  | 'DRIVER_AMOUNT_MISMATCH'
  | 'TOTAL_CASH_DRIFT'
  | 'DRIVER_LAYER_MISMATCH'
  | 'ALERT_WITHOUT_DRIVER'
  | 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED';

export type CashIntelIntegrityIssue = {
  type: CashIntelIntegrityIssueType;
  severity: CashIntelIntegrityIssueSeverity;
  driverId: string | null;
  driverName: string | null;
  expected: string | null;
  found: string | null;
  sourceA: string;
  sourceB: string | null;
  delta: string | null;
  message: string;
};

export type CashIntelIntegrityResponse = {
  status: 'PASS' | 'FAIL';
  blocked: boolean;
  criticalIssues: CashIntelIntegrityIssue[];
  warnings: CashIntelIntegrityIssue[];
  summary: {
    driversChecked: number;
    alertsChecked: number;
    layersChecked: number;
    mismatches: number;
    warnings: number;
    generatedAt: string;
  };
  readOnly: true;
};

export function runCashIntelIntegrityAudit(
  token: string,
  signal?: AbortSignal,
): Promise<CashIntelIntegrityResponse> {
  return apiJson<CashIntelIntegrityResponse>(
    '/api/cash-intelligence/integrity-audit',
    { token, signal },
  );
}

export type CashIntelActionRequest = {
  driverId: string;
  action: CashIntelExecutionAction;
  note?: string;
  alertType?: string;
};

export type CashIntelActionResponse = {
  driverId: string;
  recordedAt: string;
  execution: CashIntelExecutionBlock;
  readOnlyFinancial: true;
};

export function postCashIntelAction(
  token: string,
  payload: CashIntelActionRequest,
  signal?: AbortSignal,
) {
  return apiJson<CashIntelActionResponse>('/api/cash-intelligence/action', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

// ─── Manager operational snapshot (Dastur §3 / brief PART 2) ─────
// Returns EVERY money figure the branch manager needs on the
// "Cash Pending Deposit" screen — and nothing more. Every KD value
// here is pre-aggregated server-side from the SSoT
// (LedgerProjectionService.MANAGER_<id> balance ± ManagerCashCustody
// breakouts). The frontend MUST NOT re-compute, sum or subtract any
// of these figures — the ESLint rule on `parseFloat(...Kd)` /
// `Identifier[totalCashInFlight]` enforces that.

export type ManagerCashStatusDriverRow = {
  driverId: string;
  driverName: string;
  driverUsername: string;
  driverPhone: string | null;
  /** KD currently on this driver, not yet handed to the manager. */
  heldCashKd: string;
  pendingOrderCount: number;
  shiftStartedAt: string | null;
  /** Hours since the open shift started (null when no open shift). */
  ageHours: number | null;
  /** Server-graded risk: <24h NORMAL, ≥24h WARNING, ≥48h CRITICAL. */
  riskLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
};

export type ManagerCashStatusActivityRow = {
  txId: string;
  at: string;
  amountKd: string;
  kind: 'POS_SALE' | 'DRIVER_HANDOVER' | 'BANK_DEPOSIT' | 'OTHER';
  actorAccountId: string;
  meta: Record<string, unknown> | null;
};

export type ManagerCashStatusResponse = {
  source: 'api/manager/cash-status';
  managerId: string;
  managerName: string;
  /** Grand total under the manager's control (own POS + held bags). */
  pendingDepositKd: string;
  /** Manager's own POS cash (CASH POS sales rung up by them directly). */
  managerOwnPosKd: string;
  /** KD aggregate of bags currently in this manager's drawer. */
  custodyBagsTotalKd: string;
  /** KD aggregate of cash currently with branch drivers (high risk). */
  driversAwaitingHandoverKd: string;
  bagsCount: number;
  driversAtRiskCount: number;
  lastHandoverAt: string | null;
  lastActivityAt: string | null;
  drivers: ManagerCashStatusDriverRow[];
  recentActivity: ManagerCashStatusActivityRow[];
  generatedAt: string;
};

export function getManagerCashStatus(token: string, signal?: AbortSignal) {
  return apiJson<ManagerCashStatusResponse>('/api/manager/cash-status', {
    token,
    signal,
  });
}

// ─── Strict double-entry ledger (Stage A) ────────────────────────
// All five `/api/finance/ledger/*` endpoints are server-pre-calculated.
// Frontends MUST NOT compute totals from these payloads — every KD
// figure ships fully formatted (4dp) and every account row carries its
// own `balance = SUM(debit) - SUM(credit)` already aggregated.

export type LedgerEntry = {
  id: string;
  txId: string;
  accountId: string;
  debit: string;
  credit: string;
  createdAt: string;
  meta: Record<string, unknown>;
};

export type LedgerAccountBalance = {
  accountId: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
  entryCount: number;
};

export type LedgerSummaryResponse = {
  source: 'api/finance/ledger/summary';
  fromIso: string;
  toIso: string;
  totalEntries: number;
  totalTransactions: number;
  globalDebit: string;
  globalCredit: string;
  accounts: LedgerAccountBalance[];
  generatedAt: string;
};

export type LedgerAccountResponse = {
  source: 'api/finance/ledger/account';
  accountId: string;
  fromIso: string;
  toIso: string;
  balance: LedgerAccountBalance;
  entries: LedgerEntry[];
  generatedAt: string;
};

export type LedgerTransactionsResponse = {
  source: 'api/finance/ledger/transactions';
  fromIso: string;
  toIso: string;
  totalEntries: number;
  entries: LedgerEntry[];
  generatedAt: string;
};

export type LedgerReconciliationUnbalanced = {
  txId: string;
  debit: string;
  credit: string;
  delta: string;
};

export type LedgerReconciliationResponse = {
  source: 'api/finance/ledger/reconciliation';
  status: 'PASS' | 'FAIL';
  fromIso: string;
  toIso: string;
  totalEntries: number;
  totalTransactions: number;
  globalDebit: string;
  globalCredit: string;
  unbalancedTransactions: LedgerReconciliationUnbalanced[];
  unattributedEntries: number;
  generatedAt: string;
};

function buildLedgerQs(p: { from?: string; to?: string; accountPrefix?: string; take?: number }) {
  const q = new URLSearchParams();
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (p.accountPrefix) q.set('accountPrefix', p.accountPrefix);
  if (p.take !== undefined) q.set('take', String(p.take));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function getLedgerSummary(
  token: string,
  params: { from?: string; to?: string } = {},
) {
  return apiJson<LedgerSummaryResponse>(
    `/api/finance/ledger/summary${buildLedgerQs(params)}`,
    { token },
  );
}

export function getLedgerDriverAccount(
  token: string,
  driverId: string,
  params: { from?: string; to?: string } = {},
) {
  return apiJson<LedgerAccountResponse>(
    `/api/finance/ledger/driver/${driverId}${buildLedgerQs(params)}`,
    { token },
  );
}

export function getLedgerManagerAccount(
  token: string,
  managerId: string,
  params: { from?: string; to?: string } = {},
) {
  return apiJson<LedgerAccountResponse>(
    `/api/finance/ledger/manager/${managerId}${buildLedgerQs(params)}`,
    { token },
  );
}

export function getLedgerTransactions(
  token: string,
  params: { from?: string; to?: string; accountPrefix?: string; take?: number } = {},
) {
  return apiJson<LedgerTransactionsResponse>(
    `/api/finance/ledger/transactions${buildLedgerQs(params)}`,
    { token },
  );
}

export function getLedgerReconciliation(
  token: string,
  params: { from?: string; to?: string } = {},
) {
  return apiJson<LedgerReconciliationResponse>(
    `/api/finance/ledger/reconciliation${buildLedgerQs(params)}`,
    { token },
  );
}
