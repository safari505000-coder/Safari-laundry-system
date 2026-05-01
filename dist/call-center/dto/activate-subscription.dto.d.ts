export declare const SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS: readonly ["CASH", "KNET", "PAYMENT_LINK", "ONLINE", "DEBT_ON_ACCOUNT"];
export type SubscriptionActivationPaymentMethod = (typeof SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS)[number];
export declare class ActivateSubscriptionDto {
    customerId: string;
    planId: string;
    autoCloseInvoices?: boolean;
    paymentMethod: SubscriptionActivationPaymentMethod;
}
