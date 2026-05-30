export type PublicServiceItem = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  category: string | null;
  priceNormalKd: string;
  priceExpressKd: string;
  pricePressOnlyKd: string | null;
  manualEntry: boolean;
};

export type PublicCatalogResponse = {
  brand: {
    nameAr: string;
    nameEn: string;
    phone: string;
    branches: string[];
    colors: {
      primaryBlue: string;
      darkBlue: string;
      cyan: string;
      lightCyan: string;
      grayBackground: string;
      gradient: string[];
    };
  };
  services: PublicServiceItem[];
};

export type CustomerPortalOrder = {
  id: string;
  status: string;
  cashStatus: string;
  posPaymentMethod: string;
  deliveryStatus?:
    | 'READY'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'RETURNED_TO_BRANCH';
  totalAmountKd: string;
  paidAmountKd: string;
  remainingAmountKd: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  invoiceNumber: string | null;
  serialNumber: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
};

export type CustomerPortalMeResponse = {
  customer: {
    id: string;
    phone: string;
    displayName: string | null;
    address: string | null;
    addresses: Array<{
      id: string;
      label: string | null;
      address: string;
      isDefault: boolean;
      updatedAtIso: string;
    }>;
  };
  financials: {
    walletBalanceKd: string;
    walletDebtKd: string;
    subscriptionPlanName: string | null;
    subscriptionExpiresAtIso: string | null;
    autoRenewSubscription: boolean;
  };
  recentOrders: CustomerPortalOrder[];
};

export type UpdateCustomerProfileRequest = {
  displayName?: string;
  addresses?: Array<{
    id?: string;
    label?: string;
    address: string;
    isDefault?: boolean;
  }>;
};

export type CreatePublicOrderRequest = {
  customerPhone: string;
  customerDisplayName?: string;
  customerAddress?: string;
  serviceType?: 'NORMAL' | 'EXPRESS';
  notes?: string;
  requestedItems?: Array<{
    label: string;
    quantity: number;
  }>;
};

export type CreatePublicOrderResponse = {
  /** Customer-facing reference, e.g. W-00042 */
  requestReference: string;
  /** @deprecated Use requestReference — kept for older clients */
  requestId: string;
  status: 'RECEIVED';
  message: string;
};

export type WebsiteOrderRequestStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'CONVERTED'
  | 'CANCELLED';

export type CustomerWebsiteOrderRequest = {
  id: string;
  publicReference: string;
  status: WebsiteOrderRequestStatus;
  serviceType: 'NORMAL' | 'EXPRESS' | null;
  notes: string | null;
  createdAtIso: string;
  reviewedAtIso: string | null;
};

export type CustomerWebsiteOrderRequestsResponse = {
  requests: CustomerWebsiteOrderRequest[];
};

export type EmployeeTask = {
  id: string;
  status: string;
  customerName: string;
  customerPhone: string;
  address: string | null;
  totalPriceKd: string;
  paymentMethod: string;
  createdAtIso: string;
};

export type EmployeeTasksResponse = {
  role: 'DRIVER' | 'CALL_CENTER' | 'MANAGER';
  tasks: EmployeeTask[];
};

export type PaymentIntentResponse = {
  orderId: string;
  paymentUrl: string | null;
  status: 'READY' | 'UNAVAILABLE';
  remainingAmountKd?: string;
  message: string;
};

export type CreateCustomerPaymentLinkRequest = {
  customerPhone: string;
  orderId: string;
};

export type RequestCustomerOtpResponse = {
  status: 'OTP_SENT' | 'OTP_PENDING';
  customerExists: boolean;
  message: string;
  delivery?: 'whatsapp' | 'dev';
  devOtpCode?: string;
};

export type VerifyCustomerOtpResponse = {
  status: 'VERIFIED';
  accessToken: string;
  expiresIn: string;
  customer: {
    id: string;
    phone: string;
    displayName: string | null;
  };
};

export type WebsiteCustomerPaymentRow = {
  orderId: string;
  invoiceNumber: string | null;
  serialNumber: string | null;
  customerId: string;
  customerPhone: string;
  customerDisplayName: string | null;
  totalAmountKd: string;
  remainingAmountKd: string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  cashStatus: string;
  orderStatus: string;
  paymentUrl: string | null;
  requestedAtIso: string | null;
  requestedPhone: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
};

export type WebsiteCustomerPaymentsListResponse = {
  payments: WebsiteCustomerPaymentRow[];
};
