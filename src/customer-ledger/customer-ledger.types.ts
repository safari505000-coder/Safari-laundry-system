import { PosPaymentMethod, Prisma } from '@prisma/client';

export type PrismaTx = Prisma.TransactionClient;

export const PAYMENT_LINK_RECEIVABLE_SOURCE = 'PAYMENT_LINK_RECEIVABLE';

export function paymentLinkReceivableSourceRef(orderId: string): string {
  return `${PAYMENT_LINK_RECEIVABLE_SOURCE}:${orderId}`;
}

export function isPaymentLinkImmediateDebtEnabled(): boolean {
  const v = (process.env.PAYMENT_LINK_IMMEDIATE_DEBT ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/** When the caller already loaded order fields (e.g. POS checkout), skip extra reads inside the tx. */
export type OrderWalletSettlementPrefetch = {
  customerId: string;
  totalPrice: Prisma.Decimal;
  posPaymentMethod: PosPaymentMethod | null;
  walletSettledAt: Date | null;
  /** POS path: performer was validated before the transaction */
  skipPerformerLookup?: boolean;
};

/**
 * Interactive `$transaction` budget for Call Center partial debt payment.
 * Same rationale as `POS_ORDER_INTERACTIVE_TX` in `orders.service.ts`:
 * operational-debt breakdown, optional FIFO invoice closes, GL + journal
 * mirrors can exceed Prisma's default / a 15s cap on slow Postgres or under
 * pool contention (user-facing P2028 «انتهت مهلة معاملة قاعدة البيانات»).
 */
export const CC_PARTIAL_DEBT_PAYMENT_INTERACTIVE_TX = {
  maxWait: 20_000,
  timeout: 45_000,
} as const;
