import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  create(dto: CreateSubscriptionPlanDto) {
    return this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name.trim(),
        price: dto.price,
        creditAmount: dto.creditAmount,
        isActive: dto.isActive ?? true,
        validityDays: dto.validityDays ?? 30,
      },
    });
  }

  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    await this.findOne(id);
    const data: Prisma.SubscriptionPlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.creditAmount !== undefined) data.creditAmount = dto.creditAmount;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.validityDays !== undefined) data.validityDays = dto.validityDays;
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.subscriptionPlan.delete({ where: { id } });
    return { deleted: true as const };
  }
}
