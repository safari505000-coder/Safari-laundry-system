import type {
  CreatePublicOrderRequest,
  CreatePublicOrderResponse,
  CreateCustomerPaymentLinkRequest,
  CustomerPortalMeResponse,
  PaymentIntentResponse,
  PublicCatalogResponse,
} from '../../../packages/shared-api/src';

/** Dev: relative `/api` (Vite proxy). Production static site: set `VITE_API_URL` at build time. */
function resolveApiBase(): string {
  const origin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
  return origin ? `${origin}/api` : '/api';
}

const API_BASE = resolveApiBase();

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const raw = await res.text();
  if (!res.ok) {
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      const msg = parsed.message;
      if (typeof msg === 'string') {
        throw new Error(msg);
      }
      if (Array.isArray(msg) && msg.length > 0) {
        throw new Error(msg.join(' · '));
      }
    } catch (error) {
      if (error instanceof Error && error.message !== raw) {
        throw error;
      }
    }
    throw new Error(raw || `Request failed (${res.status})`);
  }
  if (!raw) {
    return {} as T;
  }
  const body = JSON.parse(raw) as T | { data: T };
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body as T;
}

export function getCatalog(): Promise<PublicCatalogResponse> {
  return apiJson<PublicCatalogResponse>('/public/catalog');
}

export function createOrderRequest(
  payload: CreatePublicOrderRequest,
): Promise<CreatePublicOrderResponse> {
  return apiJson<CreatePublicOrderResponse>('/public/orders/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCustomerPortal(
  phone: string,
): Promise<CustomerPortalMeResponse> {
  const qs = new URLSearchParams({ phone });
  return apiJson<CustomerPortalMeResponse>(`/public/customer-portal?${qs}`);
}

export function createCustomerPaymentLink(
  payload: CreateCustomerPaymentLinkRequest,
): Promise<PaymentIntentResponse> {
  return apiJson<PaymentIntentResponse>('/public/customer-portal/payment-link', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createCustomerBalancePaymentLink(
  customerPhone: string,
): Promise<PaymentIntentResponse> {
  return apiJson<PaymentIntentResponse>('/public/customer-portal/pay-balance', {
    method: 'POST',
    body: JSON.stringify({ customerPhone }),
  });
}

