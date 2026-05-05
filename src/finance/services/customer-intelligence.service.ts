import { Injectable } from '@nestjs/common';
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  evaluateCustomerIntelligence,
  type CustomerEvaluationFinancials,
} from '../../customers/customer-evaluator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomerIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async buildCustomerIntelligence(
    customerId: string,
    financials: CustomerEvaluationFinancials,
  ) {
    const [lifetime, paidOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          customerId,
          status: { not: OrderStatus.CANCELED },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.findMany({
        where: {
          customerId,
          status: { not: OrderStatus.CANCELED },
          cashStatus: {
            in: [
              CashStatus.PAID_TO_DRIVER,
              CashStatus.PAID_ONLINE,
              CashStatus.HANDED_OVER_TO_OFFICE,
            ],
          },
          completedAt: { not: null },
        },
        select: { createdAt: true, completedAt: true },
        take: 200,
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const invoices = money(financials.consumedKd);
    const due = money(financials.totalDueKd);
    const paymentConsistency = invoices <= 0 ? 1 : (invoices - due) / invoices;
    const avgPaymentDelayHours =
      paidOrders.length === 0 ?
        0
      : paidOrders.reduce((sum, order) => {
          const completedAt = order.completedAt ?? order.createdAt;
          return sum + Math.max(completedAt.getTime() - order.createdAt.getTime(), 0) / 3600000;
        }, 0) / paidOrders.length;

    return evaluateCustomerIntelligence({
      ...financials,
      paymentConsistency,
      avgPaymentDelayHours,
      lifetimeValueKd: toKd(lifetime._sum.totalPrice),
    });
  }
}

function money(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function toKd(value: Prisma.Decimal | null | undefined): string {
  return value?.toFixed(4) ?? '0.0000';
}
