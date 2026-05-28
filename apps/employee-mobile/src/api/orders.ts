import type {
  CreateExpenseRequest,
  DebtTransferRow,
  DriverCashCustodySummary,
  DriverCashReceiptRow,
  DriverExpenseRow,
  DriverPendingInvoicesResponse,
  IssuedInvoicesReport,
  OrderDetailRow,
  QuickCreateOrderRequest,
  QuickCreateOrderResponse,
  ReturnToBranchRequest,
} from './orders-types';
import { apiJson } from './client';

export function fetchDriverPendingInvoices(
  token: string,
  search?: string,
): Promise<DriverPendingInvoicesResponse> {
  const qs = search?.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : '';
  return apiJson<DriverPendingInvoicesResponse>(
    `/orders/driver/pending-invoices${qs}`,
    { token },
  );
}

export function createQuickOrder(
  token: string,
  payload: QuickCreateOrderRequest,
): Promise<QuickCreateOrderResponse> {
  return apiJson<QuickCreateOrderResponse>('/orders/quick', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchDriverCashCustody(
  token: string,
): Promise<DriverCashCustodySummary> {
  return apiJson<DriverCashCustodySummary>('/finance/driver/my-cash-custody', {
    token,
  });
}

export function ensureDriverShift(token: string): Promise<void> {
  return apiJson<void>('/finance/driver/ensure-shift', {
    method: 'POST',
    token,
  }).then(() => undefined);
}

export function fetchOrderById(
  token: string,
  orderId: string,
): Promise<OrderDetailRow> {
  return apiJson<OrderDetailRow>(`/orders/${encodeURIComponent(orderId)}`, {
    token,
  });
}

export function startOrderDelivery(
  token: string,
  orderId: string,
): Promise<OrderDetailRow> {
  return apiJson<OrderDetailRow>(
    `/driver/orders/${encodeURIComponent(orderId)}/start-delivery`,
    { method: 'POST', token, body: '{}' },
  );
}

export function completeOrderDelivery(
  token: string,
  orderId: string,
): Promise<OrderDetailRow> {
  return apiJson<OrderDetailRow>(
    `/driver/orders/${encodeURIComponent(orderId)}/complete-delivery`,
    { method: 'POST', token, body: '{}' },
  );
}

export function returnOrderToBranch(
  token: string,
  orderId: string,
  payload: ReturnToBranchRequest,
): Promise<OrderDetailRow> {
  return apiJson<OrderDetailRow>(
    `/driver/orders/${encodeURIComponent(orderId)}/return-to-branch`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function searchDriverOrders(
  token: string,
  query: string,
): Promise<OrderDetailRow[]> {
  const q = query.trim();
  const qs = new URLSearchParams({ q });
  return apiJson<OrderDetailRow[]>(`/orders?${qs}`, { token });
}

function todayKuwaitRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

export function fetchMyDailySales(
  token: string,
  driverId: string,
): Promise<IssuedInvoicesReport> {
  const { from, to } = todayKuwaitRange();
  const qs = new URLSearchParams({ from, to, driverId });
  return apiJson<IssuedInvoicesReport>(`/reports/driver/my-issued-invoices?${qs}`, {
    token,
  });
}

export function fetchMyCashReceipts(token: string): Promise<DriverCashReceiptRow[]> {
  return apiJson<DriverCashReceiptRow[]>('/manager-custody/driver/mine', { token });
}

export function fetchMyExpenses(token: string): Promise<DriverExpenseRow[]> {
  const { from, to } = todayKuwaitRange();
  const qs = new URLSearchParams({ from, to });
  return apiJson<DriverExpenseRow[]>(`/expenses/driver/mine?${qs}`, { token });
}

export function fetchExpenses(
  token: string,
  branchId?: string,
): Promise<DriverExpenseRow[]> {
  const { from, to } = todayKuwaitRange();
  const params = new URLSearchParams({ from, to });
  if (branchId) {
    params.append('branchId', branchId);
  }
  return apiJson<DriverExpenseRow[]>(`/expenses?${params}`, { token });
}

export function createMyExpense(
  token: string,
  payload: CreateExpenseRequest,
): Promise<DriverExpenseRow> {
  return apiJson<DriverExpenseRow>('/expenses', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchMyDebtTransfers(token: string): Promise<{ rows: DebtTransferRow[] }> {
  return apiJson<{ rows: DebtTransferRow[] }>('/debt-transfers/mine', { token });
}

export function signDebtTransfer(
  token: string,
  transferId: string,
  side: 'source' | 'target',
): Promise<DebtTransferRow> {
  return apiJson<DebtTransferRow>(`/debt-transfers/${transferId}/sign/${side}`, {
    method: 'POST',
    token,
    body: '{}',
  });
}

export type {
  CreateExpenseRequest,
  DebtTransferRow,
  DriverCashCustodySummary,
  DriverCashReceiptRow,
  DriverExpenseRow,
  DriverPendingInvoiceRow,
  DriverPendingInvoicesResponse,
  ExpenseCategory,
  ExpenseMethod,
  ExpenseStatus,
  IssuedInvoiceReportRow,
  IssuedInvoicesReport,
  OrderDetailRow,
  QuickCreateOrderRequest,
  QuickCreateOrderResponse,
  QuickPaymentMethod,
  ReturnToBranchRequest,
  DeliveryReturnReason,
  DeliveryStatus,
} from './orders-types';
