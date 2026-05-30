import { OrderStatus, Prisma } from '@prisma/client';

/**
 * V19.22.2 — Payment-link validity window (milliseconds).
 *
 * MUST stay in sync with
 * `PaymentsService.paymentLinkExpiryInMinutes` (see
 * `src/common/services/payments.service.ts`). UPayments enforces the
 * same ceiling, so the Field Collection Tracker's PENDING / EXPIRED
 * badges reflect what the gateway will actually accept.
 */
const PAYMENT_LINK_VALIDITY_HOURS = 24;
export const PAYMENT_LINK_VALIDITY_MS =
  PAYMENT_LINK_VALIDITY_HOURS * 60 * 60 * 1000;

/**
 * Prisma interactive `$transaction` budget for POS / completion paths.
 * Wallet row locks + inventory decrement can exceed 15s on slow local
 * Postgres or under contention; otherwise the API surfaces P2028 as
 * «انتهت مهلة معاملة قاعدة البيانات».
 */
export const POS_ORDER_INTERACTIVE_TX = {
  maxWait: 20_000,
  timeout: 45_000,
} as const;

export const POS_DELIVERY_FEE_KD = new Prisma.Decimal('0.2500');

/**
 * V19.22.4 — Stale Quick-Capture threshold (milliseconds).
 *
 * Any Order that has been sitting in PENDING + UNPAID state longer
 * than this is surfaced to the Accountant as an accountability risk.
 */
const STALE_QUICK_ORDER_THRESHOLD_HOURS = 24;
export const STALE_QUICK_ORDER_THRESHOLD_MS =
  STALE_QUICK_ORDER_THRESHOLD_HOURS * 60 * 60 * 1000;

export const terminalStatuses: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELED,
];
