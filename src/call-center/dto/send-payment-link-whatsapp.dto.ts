import type { ReminderResultDto } from './reminder-result.dto';

/**
 * POST /api/call-center/orders/:orderId/send-payment-link-whatsapp
 */
export type SendPaymentLinkWhatsappResultDto = {
  reminder: ReminderResultDto;
  /** true when Moatmt or CUSTOMER_NOTIFY_WEBHOOK_URL delivered the text. */
  serverPush: boolean;
  /** Hosted UPayments URL (for `wa.me` fallback when `serverPush` is false). */
  paymentUrl: string;
};
