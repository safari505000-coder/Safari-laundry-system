import { apiJson } from './client';
import type {
  CollectionUnpaidOnlineRow,
  CustomerCollectionDebtBreakdown,
  FullBalanceLinkResult,
  SendPaymentLinkWhatsappResult,
  WebsiteCustomerPaymentFilter,
  WebsiteCustomerPaymentRow,
  WebsiteOrderRequestRow,
  WebsiteOrderRequestStatus,
  CustomerLedgerResponse,
  SubscriptionPlanDto,
  ActivateSubscriptionDto,
  CancelSubscriptionDto,
  RecordPartialDebtPaymentDto,
} from './call-center-types';

export function fetchCollectionUnpaidOnline(
  token: string,
): Promise<CollectionUnpaidOnlineRow[]> {
  return apiJson<CollectionUnpaidOnlineRow[]>(
    '/orders/collections/unpaid-online',
    { token },
  ).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function fetchCustomerDebtBreakdown(
  token: string,
  customerId: string,
): Promise<CustomerCollectionDebtBreakdown> {
  return apiJson<CustomerCollectionDebtBreakdown>(
    `/call-center/customers/${encodeURIComponent(customerId)}/collection-debt-breakdown`,
    { token },
  );
}

export function sendOrderPaymentLinkWhatsapp(
  token: string,
  orderId: string,
): Promise<SendPaymentLinkWhatsappResult> {
  return apiJson<SendPaymentLinkWhatsappResult>(
    `/call-center/orders/${encodeURIComponent(orderId)}/send-payment-link-whatsapp`,
    { method: 'POST', token },
  );
}

export function sendFullBalancePaymentLinkWhatsapp(
  token: string,
  customerId: string,
): Promise<FullBalanceLinkResult> {
  return apiJson<FullBalanceLinkResult>(
    `/call-center/customers/${encodeURIComponent(customerId)}/send-full-balance-payment-link-whatsapp`,
    { method: 'POST', token },
  );
}

export function listWebsiteOrderRequests(
  token: string,
  status?: WebsiteOrderRequestStatus,
): Promise<WebsiteOrderRequestRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiJson<{ requests: WebsiteOrderRequestRow[] }>(
    `/public/call-center/website-order-requests${qs}`,
    { token },
  ).then((res) => res.requests ?? []);
}

export function updateWebsiteOrderRequestStatus(
  token: string,
  id: string,
  status: WebsiteOrderRequestStatus,
): Promise<void> {
  return apiJson(
    `/public/call-center/website-order-requests/${encodeURIComponent(id)}/status`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ status }),
    },
  ).then(() => undefined);
}

export function listWebsiteCustomerPayments(
  token: string,
  status: WebsiteCustomerPaymentFilter = 'PENDING',
): Promise<WebsiteCustomerPaymentRow[]> {
  const qs = `?status=${encodeURIComponent(status)}`;
  return apiJson<{ payments: WebsiteCustomerPaymentRow[] }>(
    `/public/call-center/website-payments${qs}`,
    { token },
  ).then((res) => res.payments ?? []);
}

export function getCustomerLedger(
  token: string,
  customerId: string,
): Promise<CustomerLedgerResponse> {
  return apiJson<CustomerLedgerResponse>(
    `/call-center/customers/${encodeURIComponent(customerId)}/ledger`,
    { token },
  );
}

export function listSubscriptionPlans(
  token: string,
): Promise<SubscriptionPlanDto[]> {
  return apiJson<SubscriptionPlanDto[]>(
    '/call-center/subscription-plans',
    { token },
  ).then((plans) => (Array.isArray(plans) ? plans : []));
}

export function activateSubscription(
  token: string,
  payload: ActivateSubscriptionDto,
): Promise<any> {
  return apiJson<any>(
    '/call-center/subscriptions/activate',
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function cancelSubscription(
  token: string,
  payload: CancelSubscriptionDto,
): Promise<any> {
  return apiJson<any>(
    '/call-center/subscriptions/cancel',
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function recordPartialDebtPayment(
  token: string,
  customerId: string,
  payload: RecordPartialDebtPaymentDto,
): Promise<any> {
  return apiJson<any>(
    `/call-center/customers/${encodeURIComponent(customerId)}/partial-debt-payment`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    },
  );
}

export type {
  CollectionUnpaidOnlineRow,
  CustomerCollectionDebtBreakdown,
  WebsiteCustomerPaymentFilter,
  WebsiteCustomerPaymentRow,
  WebsiteOrderRequestRow,
  WebsiteOrderRequestStatus,
  SubscriptionPlanDto,
  ActivateSubscriptionDto,
  CancelSubscriptionDto,
  RecordPartialDebtPaymentDto,
  CustomerLedgerHeader,
  CustomerLedgerSubscription,
  CustomerLedgerEvent,
  CustomerLedgerInvoice,
  CustomerLedgerResponse,
  CustomerLedgerEventKind,
} from './call-center-types';

