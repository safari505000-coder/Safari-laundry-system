import { PosPaymentMethod } from '@prisma/client';

/**
 * Public, operator-facing payment methods.
 *
 * `SUBSCRIPTION` is the canonical business name. The current DB enum still
 * stores the legacy value `SUBSCRIPTION_WALLET`; do not expose that name in
 * new API/UI code.
 */
export type CanonicalPaymentMethod =
  | 'CASH'
  | 'KNET'
  | 'ONLINE'
  | 'PAYMENT_LINK'
  | 'DEBT_ON_ACCOUNT'
  | 'SUBSCRIPTION';

export const CANONICAL_PAYMENT_METHODS: readonly CanonicalPaymentMethod[] = [
  'CASH',
  'KNET',
  'ONLINE',
  'PAYMENT_LINK',
  'DEBT_ON_ACCOUNT',
  'SUBSCRIPTION',
] as const;

export function normalizePaymentMethodInput(
  raw: PosPaymentMethod | CanonicalPaymentMethod | string | null | undefined,
): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function toDbPosPaymentMethod(
  raw: PosPaymentMethod | CanonicalPaymentMethod | string | null | undefined,
): PosPaymentMethod | null {
  const s = normalizePaymentMethodInput(raw);
  if (!s) return null;
  if (s === 'CASH') return PosPaymentMethod.CASH;
  if (s === 'KNET') return PosPaymentMethod.KNET;
  if (s === 'ONLINE') return PosPaymentMethod.ONLINE;
  if (s === 'PAYMENT_LINK' || s === 'LINK' || s === 'PAYMENTLINK') {
    return PosPaymentMethod.PAYMENT_LINK;
  }
  if (
    s === 'DEBT_ON_ACCOUNT' ||
    s === 'ON_ACCOUNT' ||
    s === 'DEBT' ||
    s === 'CREDIT'
  ) {
    return PosPaymentMethod.DEBT_ON_ACCOUNT;
  }
  if (
    s === 'SUBSCRIPTION' ||
    s === 'SUBSCRIPTION_WALLET' ||
    s === 'WALLET' ||
    s === 'PACKAGE'
  ) {
    return PosPaymentMethod.SUBSCRIPTION_WALLET;
  }
  return null;
}

export function fromDbPosPaymentMethod(
  method: PosPaymentMethod | string | null | undefined,
): CanonicalPaymentMethod | null {
  if (!method) return null;
  if (method === PosPaymentMethod.SUBSCRIPTION_WALLET || method === 'SUBSCRIPTION_WALLET') {
    return 'SUBSCRIPTION';
  }
  const normalized = toDbPosPaymentMethod(method);
  if (!normalized) return null;
  if (normalized === PosPaymentMethod.SUBSCRIPTION_WALLET) return 'SUBSCRIPTION';
  return normalized as CanonicalPaymentMethod;
}
