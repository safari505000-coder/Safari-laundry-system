import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  LedgerTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { SubscriptionRolloverPreviewDto } from './dto/subscription-rollover-preview.dto';
import type {
  CustomerSubscriptionRowDto,
  SubscriptionInvoiceRowDto,
} from './dto/customer-subscription.dto';

/**
 * Phase 1 extraction — read-only customer/subscription lookups split out of
 * `call-center.service.ts`. Every method here is a pure `prisma` read (no
 * writes, no transactions, no other injected services). `CallCenterService`
 * keeps the public method signatures and delegates here (facade), so the
 * controller layer and behaviour are unchanged.
 */
@Injectable()
export class CallCenterSubscriptionReadService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveSubscriptionPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        salePrice: true,
        actualBalance: true,
      },
    });
  }

  /**
   * يبحث عن العملاء لموظفي مركز الاتصال مع إرجاع رصيد المحفظة والدين الحالي للمتابعة.
   * Searches customers for call-center workflows and includes wallet balance and debt for follow-up.
   * @param query - نص البحث بالهاتف أو الاسم أو العنوان / Phone, name, or address search text
   * @returns قائمة مختصرة من العملاء المطابقين / Matching customer summary rows
   */
  async searchCustomers(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters',
      );
    }
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { phone: { contains: q, mode: 'insensitive' } },
          { phone2: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phone: true,
        phone2: true,
        displayName: true,
        address: true,
        createdAt: true,
        wallet: {
          select: {
            balance: true,
            debt: true,
          },
        },
      },
    });
  }

  async listCustomerSettlementHistory(
    customerId: string,
    take = 40,
  ): Promise<SettlementHistoryRowDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        customerId,
        type: {
          in: [
            LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        type: true,
        balanceAfter: true,
        debtAfter: true,
        orderId: true,
        metadata: true,
      },
    });

    return rows.map((r) => {
      const meta =
        r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const str = (k: string): string | undefined => {
        const v = meta[k];
        return typeof v === 'string' ? v : undefined;
      };
      return {
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        totalCollected: str('totalCollected'),
        debtSettled: str('debtSettled'),
        creditedToBalance: str('creditedToBalance'),
        balanceAfter: r.balanceAfter.toString(),
        debtAfter: r.debtAfter.toString(),
        planName: str('planName'),
        orderId: r.orderId ?? undefined,
      };
    });
  }

  async previewSubscriptionRollover(
    customerId: string,
  ): Promise<SubscriptionRolloverPreviewDto> {
    // Defensive FK check: throw a clean 404 instead of a Prisma
    // "record not found" raw error when the CC types a stale uuid.
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [wallet, previous] = await Promise.all([
      this.prisma.customerWallet.findUnique({
        where: { customerId },
        select: { balance: true, debt: true },
      }),
      this.prisma.customerSubscription.findFirst({
        where: {
          customerId,
          status: {
            in: [
              CustomerSubscriptionStatus.ACTIVE,
              CustomerSubscriptionStatus.EXPIRED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          planNameSnapshot: true,
          activatedAt: true,
          expiresAt: true,
        },
      }),
    ]);

    const balance = wallet?.balance ?? new Prisma.Decimal(0);
    const debt = wallet?.debt ?? new Prisma.Decimal(0);
    const carried = balance.minus(debt); // + credit, - debt, 0 even

    if (!previous) {
      return {
        hasPrevious: false,
        currentWalletBalanceKd: balance.toFixed(4),
        currentWalletDebtKd: debt.toFixed(4),
      };
    }

    return {
      hasPrevious: true,
      carriedBalanceKd: carried.toFixed(4),
      previousPlanName: previous.planNameSnapshot,
      previousActivatedAtIso: previous.activatedAt.toISOString(),
      previousExpiresAtIso: previous.expiresAt.toISOString(),
      currentWalletBalanceKd: balance.toFixed(4),
      currentWalletDebtKd: debt.toFixed(4),
    };
  }

  /**
   * V19.4 — CC pack #11 + #12. Full chain of subscriptions for a
   * customer, most-recent first, with every invoice that was issued
   * while each subscription window was ACTIVE. This is what powers the
   * call-center "Subscriptions timeline" view.
   *
   * Performance: two queries (subs + orders in those subs). No N+1 —
   * the orders are batched via `subscriptionId IN (...)` then grouped
   * in memory. A future optimisation is pagination once chains exceed
   * a few hundred entries; today the deepest chain in production is
   * well under that.
   */
  async listCustomerSubscriptionChain(
    customerId: string,
  ): Promise<CustomerSubscriptionRowDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const subs = await this.prisma.customerSubscription.findMany({
      where: { customerId },
      orderBy: { activatedAt: 'desc' },
    });
    if (subs.length === 0) return [];

    const ids = subs.map((s) => s.id);
    const orders = await this.prisma.order.findMany({
      where: { subscriptionId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subscriptionId: true,
        invoiceNumber: true,
        totalPrice: true,
        status: true,
        cashStatus: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const ordersBySub = new Map<string, SubscriptionInvoiceRowDto[]>();
    for (const o of orders) {
      if (!o.subscriptionId) continue;
      const list = ordersBySub.get(o.subscriptionId) ?? [];
      list.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber ?? undefined,
        totalPriceKd: o.totalPrice.toFixed(4),
        status: o.status,
        cashStatus: o.cashStatus,
        createdAtIso: o.createdAt.toISOString(),
        completedAtIso: o.completedAt?.toISOString(),
      });
      ordersBySub.set(o.subscriptionId, list);
    }

    return this.mapSubscriptionChainRows(subs, ordersBySub);
  }

  private mapSubscriptionChainRows(
    subs: Array<{
      id: string;
      status: CustomerSubscriptionStatus;
      planNameSnapshot: string;
      planSalePriceSnapshot: Prisma.Decimal;
      planActualBalanceSnapshot: Prisma.Decimal;
      planValidityDaysSnapshot: number;
      carriedBalanceKd: Prisma.Decimal;
      parentSubscriptionId: string | null;
      activatedAt: Date;
      expiresAt: Date;
      closedAt: Date | null;
      closedReason: string | null;
    }>,
    ordersBySub: Map<string, SubscriptionInvoiceRowDto[]>,
  ): CustomerSubscriptionRowDto[] {
    return subs.map<CustomerSubscriptionRowDto>((s) => ({
      id: s.id,
      status: s.status,
      planNameSnapshot: s.planNameSnapshot,
      planSalePriceSnapshot: s.planSalePriceSnapshot.toFixed(4),
      planActualBalanceSnapshot: s.planActualBalanceSnapshot.toFixed(4),
      planValidityDaysSnapshot: s.planValidityDaysSnapshot,
      carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
      parentSubscriptionId: s.parentSubscriptionId ?? undefined,
      activatedAtIso: s.activatedAt.toISOString(),
      expiresAtIso: s.expiresAt.toISOString(),
      closedAtIso: s.closedAt?.toISOString(),
      closedReason: s.closedReason ?? undefined,
      invoices: ordersBySub.get(s.id) ?? [],
    }));
  }
}
