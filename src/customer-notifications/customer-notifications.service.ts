import { Injectable, Logger } from '@nestjs/common';

export type InvoiceIssuedNotifyParams = {
  customerPhone: string;
  orderId: string;
  invoiceLabel: string;
  amountKd: string;
  /** Payment link when checkout used PAYMENT_LINK. */
  paymentUrl?: string;
};

@Injectable()
export class CustomerNotificationsService {
  private readonly logger = new Logger(CustomerNotificationsService.name);

  /**
   * Fire-and-forget SMS/WhatsApp hook — never blocks POS.
   */
  notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void {
    setImmediate(() => {
      void this.deliver(params).catch((e) =>
        this.logger.warn(`Invoice notify failed: ${e}`),
      );
    });
  }

  private async deliver(params: InvoiceIssuedNotifyParams): Promise<void> {
    const base =
      (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '') || '';
    const detailsLink =
      base ?
        `${base}/orders?highlight=${encodeURIComponent(params.orderId)}`
      : `Order ${params.orderId}`;
    const linkPart =
      params.paymentUrl ?
        ` Pay here: ${params.paymentUrl}`
      : ` View: ${detailsLink}`;

    const message =
      `Welcome to Safari Express Laundry. Invoice ${params.invoiceLabel} for KD ${params.amountKd} has been issued.${linkPart}`;

    const webhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
    if (webhook) {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.customerPhone,
          message,
          orderId: params.orderId,
          template: 'invoice_issued',
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status}`,
        );
      }
      return;
    }

    this.logger.log(
      `[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set CUSTOMER_NOTIFY_WEBHOOK_URL to send)`,
    );
  }
}
