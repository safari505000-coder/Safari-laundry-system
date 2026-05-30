import { Injectable } from '@nestjs/common';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import {
  formatLineItemsBlockForBundleNotify,
  formatLineItemsBlockForNotify,
  invoiceLabelForCustomerNotify,
} from './order-notification-format.util';
import type {
  OrderDetail,
  PosCheckoutOrderDetail,
} from './order-types';

@Injectable()
export class OrderCustomerNotificationService {
  constructor(
    private readonly customerNotifications: CustomerNotificationsService,
  ) {}

  /**
   * Sends invoice + payment/receipt text to the customer (webhook if configured).
   * Call with `void ...catch` for non-ONLINE checkouts; await for ONLINE so the
   * UPayments link + receipt text is delivered before the POS response returns.
   */
  async sendPosInvoiceIssued(
    detail: PosCheckoutOrderDetail,
    phoneCompact: string,
  ): Promise<void> {
    const phone = resolveCustomerPhoneForNotify(
      detail.customer.phone,
      detail.customer.phone2,
      phoneCompact,
    );
    const lineItemsSummary = formatLineItemsBlockForNotify(detail);
    await this.customerNotifications.deliverInvoiceIssuedNow({
      customerPhone: phone,
      orderId: detail.id,
      invoiceLabel: invoiceLabelForCustomerNotify(detail),
      amountKd: detail.totalPrice.toFixed(3),
      paymentUrl: detail.paymentLink?.url,
      lineItemsSummary: lineItemsSummary || undefined,
    });
  }

  async sendPosBundleInvoiceIssued(input: {
    orders: OrderDetail[];
    customerPhone: string;
    amountKd: string;
    paymentUrl: string;
  }): Promise<void> {
    const first = input.orders[0];
    if (!first) {
      return;
    }

    const lineItemsSummary = formatLineItemsBlockForBundleNotify(input.orders);
    await this.customerNotifications.deliverInvoiceIssuedNow({
      customerPhone: input.customerPhone,
      orderId: first.id,
      invoiceLabel:
        input.orders.length > 1 ?
          `مجموعة ${input.orders.length} فواتير`
        : invoiceLabelForCustomerNotify(first),
      amountKd: input.amountKd,
      paymentUrl: input.paymentUrl,
      lineItemsSummary: lineItemsSummary || undefined,
    });
  }
}
