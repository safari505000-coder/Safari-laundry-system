import { Injectable } from '@nestjs/common';
import { OrderStatus, PosPaymentMethod } from '@prisma/client';
import { PaymentsService } from '../../common/services/payments.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OnlinePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

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

  async finalizePaidOrderFromGateway(referenceId: string): Promise<void> {
    await this.payments.finalizePaidOrderFromGateway(referenceId);
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

