import { apiJson } from './client';
import type {
  CustomerBillingProfile,
  LaundryCategoryRow,
  LaundryPriceListItemRow,
  PosCheckoutRequest,
  PosCheckoutResponse,
  PosCustomerRow,
} from './pos-types';

export function fetchLaundryPriceList(
  token: string,
): Promise<LaundryPriceListItemRow[]> {
  return apiJson<LaundryPriceListItemRow[]>('/laundry-price-list', {
    token,
  }).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function fetchLaundryCategories(
  token: string,
): Promise<LaundryCategoryRow[]> {
  return apiJson<LaundryCategoryRow[]>('/laundry-price-list/categories', {
    token,
  }).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function searchPosCustomers(
  token: string,
  query: string,
): Promise<PosCustomerRow[]> {
  const q = query.trim();
  if (!q) {
    return Promise.resolve([]);
  }
  return apiJson<PosCustomerRow[]>(
    `/pos/customers/search?q=${encodeURIComponent(q)}`,
    { token },
  ).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function createPosCustomer(
  token: string,
  body: {
    phone: string;
    displayName: string;
    phone2?: string;
    addressArea?: string;
    addressBlock?: string;
    addressStreet?: string;
    addressAvenue?: string;
    addressHouse?: string;
  },
): Promise<PosCustomerRow> {
  return apiJson<PosCustomerRow>('/pos/customers', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function fetchCustomerBilling(
  token: string,
  customerId: string,
): Promise<CustomerBillingProfile> {
  return apiJson<CustomerBillingProfile>(
    `/pos/customers/${encodeURIComponent(customerId)}/billing`,
    { token },
  );
}

export function posCheckout(
  token: string,
  body: PosCheckoutRequest,
): Promise<PosCheckoutResponse> {
  const posPaymentMethod =
    body.posPaymentMethod === 'SUBSCRIPTION'
      ? 'SUBSCRIPTION_WALLET'
      : body.posPaymentMethod;
  return apiJson<PosCheckoutResponse>('/pos/checkout', {
    method: 'POST',
    token,
    body: JSON.stringify({ ...body, posPaymentMethod }),
  });
}

export type {
  CustomerBillingProfile,
  LaundryCategoryRow,
  LaundryPriceListItemRow,
  PosCartLine,
  PosCheckoutRequest,
  PosCheckoutResponse,
  PosCustomerRow,
  PosPaymentMethod,
  PosServiceKey,
} from './pos-types';
