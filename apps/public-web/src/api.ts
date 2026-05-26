import type {
  CreatePublicOrderRequest,
  CreatePublicOrderResponse,
  CustomerPortalMeResponse,
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
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as T | { data: T };
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
