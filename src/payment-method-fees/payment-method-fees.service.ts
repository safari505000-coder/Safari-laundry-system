import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CANONICAL_PAYMENT_METHOD_FEE_CONFIG } from './canonical-payment-fee-config';
import type { UpdatePaymentMethodFeesDto } from './dto/update-payment-method-fees.dto';

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

  /**
   * V25 Controller Math Purge — all Prisma.Decimal construction and
   * the raw prisma write live here, never in the controller.
   */
  async patchConfig(dto: UpdatePaymentMethodFeesDto) {
    await this.ensureDefaultRow();
    const data: Record<string, unknown> = {};
    if (dto.knetFlatKd !== undefined) {
      data.knetFlatKd = new Prisma.Decimal(dto.knetFlatKd);
    }
    if (dto.knetPercentOfGross !== undefined) {
      data.knetPercentOfGross = dto.knetPercentOfGross;
    }
    if (dto.knetRule !== undefined) {
      data.knetRule = dto.knetRule;
    }
    if (dto.cardPercentOfGross !== undefined) {
      data.cardPercentOfGross = dto.cardPercentOfGross;
    }
    return this.prisma.paymentMethodFeeConfig.update({
      where: { id: CONFIG_ID },
      data,
    });
  }
}
