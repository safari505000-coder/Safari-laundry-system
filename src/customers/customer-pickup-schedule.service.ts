import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../customer-ledger/wallet.service';

@Injectable()
export class CustomerPickupScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  async getSchedules(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.prisma.customerPickupSchedule.findMany({
      where: { customerId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async upsertSchedule(
    customerId: string,
    dayOfWeek: number,
    timeWindow: string,
    isActive = true,
  ) {
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new BadRequestException('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
    }
    if (!timeWindow.trim()) {
      throw new BadRequestException('timeWindow must not be empty');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customerPickupSchedule.upsert({
      where: {
        customerId_dayOfWeek: { customerId, dayOfWeek },
      },
      update: {
        timeWindow: timeWindow.trim(),
        isActive,
      },
      create: {
        customerId,
        dayOfWeek,
        timeWindow: timeWindow.trim(),
        isActive,
      },
    });
  }

  async deleteSchedule(customerId: string, dayOfWeek: number) {
    const existing = await this.prisma.customerPickupSchedule.findUnique({
      where: {
        customerId_dayOfWeek: { customerId, dayOfWeek },
      },
    });
    if (!existing) {
      throw new NotFoundException('Pickup schedule not found for this day');
    }

    return this.prisma.customerPickupSchedule.delete({
      where: {
        customerId_dayOfWeek: { customerId, dayOfWeek },
      },
    });
  }

  async toggleAutoRenew(customerId: string, autoRenew: boolean) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { wallet: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (!customer.wallet) {
      throw new NotFoundException('Customer wallet not found');
    }
    return this.wallets.toggleAutoRenewSubscription(this.prisma, customerId, autoRenew);
  }
}
