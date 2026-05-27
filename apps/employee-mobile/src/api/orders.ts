import type {
  DriverCashCustodySummary,
  DriverPendingInvoicesResponse,
  OrderDetailRow,
  QuickCreateOrderRequest,
  QuickCreateOrderResponse,
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

export type {
  DriverCashCustodySummary,
  DriverPendingInvoiceRow,
  DriverPendingInvoicesResponse,
  OrderDetailRow,
  QuickCreateOrderRequest,
  QuickCreateOrderResponse,
  QuickPaymentMethod,
} from './orders-types';
