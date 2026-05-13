import { Injectable } from '@nestjs/common';
import { OrderStatus, PosPaymentMethod } from '@prisma/client';
import { PaymentsService } from '../../common/services/payments.service';
import { withPaymentFinalizeSpan } from '../../common/tracing/payment-finalize-span';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * خدمة الدفع الإلكتروني — تُغلّف بوابة الدفع وتُدير رسائل الاسترداد
 * Online payment service wrapping PaymentsService for gateway callbacks,
 * payment link generation, and order finalization.
 */
@Injectable()
export class OnlinePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * يتحقق من توافر نقطة دفع تجريبية عامة
   * Returns whether the public mock checkout endpoint is available (dev/staging only).
   *
   * @returns true إذا كان الدفع التجريبي متاحاً | Whether mock checkout is available
   */
  isPublicMockCheckoutAvailable(): boolean {
    return this.payments.isPublicMockCheckoutAvailable();
  }

  allowDevMockCallback(body: { devMock?: boolean }): boolean {
    return this.payments.allowDevMockCallback(body);
  }

  verifyIntegratedCallback(dto: {
    orderId: string;
    status: string;
    amount?: string;
    signature?: string;
  }): boolean {
    return this.payments.verifyIntegratedCallback(dto);
  }

  normalizeCallbackStatus(status: string): 'success' | 'failed' {
    return this.payments.normalizeCallbackStatus(status);
  }

  /**
   * يُنهي الطلب المدفوع من خلال بوابة الدفع الإلكتروني
   * Finalizes a paid order from the payment gateway callback using tracing span.
   *
   * @param referenceId - معرف المرجع من البوابة | Gateway reference ID
   */
  async finalizePaidOrderFromGateway(referenceId: string): Promise<void> {
    await withPaymentFinalizeSpan(
      { orderId: referenceId, source: 'ONLINE_PAYMENT_SERVICE' },
      () => this.payments.finalizePaidOrderFromGateway(referenceId),
    );
  }

  /**
   * V1.6.0 — call-center "Payment link" button on the Collections page.
   * Generates (or returns the existing) hosted-checkout URL for an unpaid
   * order regardless of its original payment method (Cash, KNET, …).
   */
  async ensurePaymentLinkForUnpaidOrder(
    orderId: string,
  ): Promise<{ url: string }> {
    const link = await this.payments.ensurePaymentLinkForUnpaidOrder(orderId);
    return { url: link.url };
  }

  async getTotalOnlineRevenue(): Promise<string> {
    const sum = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        posPaymentMethod: {
          in: [PosPaymentMethod.ONLINE, PosPaymentMethod.PAYMENT_LINK],
        },
      },
      _sum: { totalPrice: true },
    });
    return sum._sum.totalPrice?.toString() ?? '0.0000';
  }
}

