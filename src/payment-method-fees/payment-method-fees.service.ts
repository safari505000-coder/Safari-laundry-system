import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CANONICAL_PAYMENT_METHOD_FEE_CONFIG } from './canonical-payment-fee-config';

const CONFIG_ID = 'default';

@Injectable()
export class PaymentMethodFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultRow(): Promise<void> {
    await this.prisma.paymentMethodFeeConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        ...CANONICAL_PAYMENT_METHOD_FEE_CONFIG,
      },
      update: {},
    });
  }

  async getConfig() {
    await this.ensureDefaultRow();
    return this.prisma.paymentMethodFeeConfig.findUniqueOrThrow({
      where: { id: CONFIG_ID },
    });
  }
}
