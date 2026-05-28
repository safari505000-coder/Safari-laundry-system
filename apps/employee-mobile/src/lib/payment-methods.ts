import type { DisplayPaymentMethod } from '@/api/orders-types';
import type { PosPaymentMethod } from '@/api/pos-types';

export type MobilePaymentMethod = PosPaymentMethod | 'SUBSCRIPTION_WALLET';

export const PAYMENT_METHOD_LABELS_AR: Record<MobilePaymentMethod, string> = {
  CASH: 'نقد',
  KNET: 'كي نت',
  PAYMENT_LINK: 'رابط دفع',
  ONLINE: 'أونلاين',
  DEBT_ON_ACCOUNT: 'على الحساب',
  SUBSCRIPTION: 'اشتراك / من الرصيد',
  SUBSCRIPTION_WALLET: 'اشتراك / من الرصيد',
};

export function paymentMethodLabelAr(
  method: DisplayPaymentMethod | PosPaymentMethod | null | undefined,
): string {
  if (!method) {
    return '—';
  }
  return PAYMENT_METHOD_LABELS_AR[method] ?? method;
}

export function canUseSubscriptionPayment(profile: {
  subscriptionActive: boolean;
  remainingBalance: string;
} | null): boolean {
  if (!profile?.subscriptionActive) {
    return false;
  }
  const balance = Number.parseFloat(profile.remainingBalance);
  return Number.isFinite(balance) && balance > 0;
}
