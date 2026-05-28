import type {

  CreateCustomerPaymentLinkRequest,

  CreatePublicOrderRequest,

  CreatePublicOrderResponse,

  CustomerPortalMeResponse,

  CustomerWebsiteOrderRequestsResponse,

  PaymentIntentResponse,

  PublicCatalogResponse,

  RequestCustomerOtpResponse,

  UpdateCustomerProfileRequest,

  VerifyCustomerOtpResponse,

} from '@safari-erp/shared-api';

import { readCustomerAccessToken } from '@/auth/customer-session';

import { apiJson } from './client';



async function withCustomerAuth(init: RequestInit = {}): Promise<RequestInit> {

  const token = await readCustomerAccessToken();

  if (!token) {

    return init;

  }

  return {

    ...init,

    headers: {

      ...(init.headers ?? {}),

      Authorization: `Bearer ${token}`,

    },

  };

}



export function fetchCatalog(): Promise<PublicCatalogResponse> {

  return apiJson<PublicCatalogResponse>('/public/catalog');

}



export function submitOrderRequest(

  payload: CreatePublicOrderRequest,

): Promise<CreatePublicOrderResponse> {

  return apiJson<CreatePublicOrderResponse>('/public/orders/request', {

    method: 'POST',

    body: JSON.stringify(payload),

  });

}



export function requestCustomerOtp(

  phone: string,

): Promise<RequestCustomerOtpResponse> {

  return apiJson<RequestCustomerOtpResponse>('/public/customer-auth/request-otp', {

    method: 'POST',

    body: JSON.stringify({ phone: phone.replace(/[\s-]/g, '').trim() }),

  });

}



export function verifyCustomerOtp(

  phone: string,

  code: string,

): Promise<VerifyCustomerOtpResponse> {

  return apiJson<VerifyCustomerOtpResponse>(

    '/public/customer-auth/verify-otp',

    {

      method: 'POST',

      body: JSON.stringify({

        phone: phone.replace(/[\s-]/g, '').trim(),

        code: code.replace(/\s/g, '').trim(),

      }),

    },

  );

}



/** Dev/non-prod only — issues a full customer JWT without OTP. */

export function devLoginCustomer(

  phone: string,

): Promise<VerifyCustomerOtpResponse> {

  return apiJson<VerifyCustomerOtpResponse>('/public/customer-auth/dev-login', {

    method: 'POST',

    body: JSON.stringify({ phone: phone.replace(/[\s-]/g, '').trim() }),

  });

}



export async function fetchCustomerPortalMe(): Promise<CustomerPortalMeResponse> {

  return apiJson<CustomerPortalMeResponse>(

    '/public/customer-portal/me',

    await withCustomerAuth(),

  );

}

export async function updateCustomerProfile(
  payload: UpdateCustomerProfileRequest,
): Promise<CustomerPortalMeResponse> {
  return apiJson<CustomerPortalMeResponse>(
    '/public/customer/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      ...(await withCustomerAuth()),
    },
  );
}



/** Dev/non-prod preview only — disabled on production servers by default. */

export function fetchCustomerPortalPreview(

  phone: string,

): Promise<CustomerPortalMeResponse> {

  const normalized = phone.replace(/[\s-]/g, '').trim();

  return apiJson<CustomerPortalMeResponse>(

    `/public/customer-portal?phone=${encodeURIComponent(normalized)}`,

  );

}



export function fetchCustomerOrderRequests(

  phone: string,

): Promise<CustomerWebsiteOrderRequestsResponse> {

  const normalized = phone.replace(/[\s-]/g, '').trim();

  return apiJson(

    `/public/customer-order-requests?phone=${encodeURIComponent(normalized)}`,

  );

}



export function registerCustomerPushToken(payload: {

  customerPhone: string;

  token: string;

  platform?: 'ios' | 'android';

}): Promise<{ ok: boolean; registeredAt: string }> {

  return apiJson('/public/customer/push-token', {

    method: 'POST',

    body: JSON.stringify({

      customerPhone: payload.customerPhone.replace(/[\s-]/g, '').trim(),

      token: payload.token,

      platform: payload.platform,

    }),

  });

}



export async function createInvoicePaymentLink(

  payload: CreateCustomerPaymentLinkRequest,

): Promise<PaymentIntentResponse> {

  return apiJson<PaymentIntentResponse>(

    '/public/customer-portal/payment-link',

    {

      method: 'POST',

      body: JSON.stringify(payload),

      ...(await withCustomerAuth()),

    },

  );

}



export type OrderDeliveryTracking = {
  orderId: string;
  invoiceLabel: string;
  deliveryStatus: string;
  deliveryStartedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  deliveryReturnReason: string | null;
  timeline: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    returnReason: string | null;
    notes: string | null;
    createdAt: string;
    actorName: string | null;
  }>;
};

export async function fetchOrderDelivery(
  orderId: string,
): Promise<OrderDeliveryTracking> {
  return apiJson<OrderDeliveryTracking>(
    `/public/customer-portal/orders/${encodeURIComponent(orderId)}/delivery`,
    await withCustomerAuth(),
  );
}



export async function createBalancePaymentLink(

  customerPhone: string,

): Promise<PaymentIntentResponse> {

  return apiJson<PaymentIntentResponse>(

    '/public/customer-portal/pay-balance',

    {

      method: 'POST',

      body: JSON.stringify({ customerPhone }),

      ...(await withCustomerAuth()),

    },

  );

}



export type {

  CreatePublicOrderRequest,

  CreatePublicOrderResponse,

  CustomerPortalMeResponse,

  CustomerPortalOrder,

  CustomerWebsiteOrderRequest,

  CustomerWebsiteOrderRequestsResponse,

  PaymentIntentResponse,

  PublicCatalogResponse,

  PublicServiceItem,

  RequestCustomerOtpResponse,

  UpdateCustomerProfileRequest,

  VerifyCustomerOtpResponse,

  WebsiteOrderRequestStatus,

} from '@safari-erp/shared-api';


