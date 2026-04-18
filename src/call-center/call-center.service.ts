import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashStatus, LedgerTransactionType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import type { SettlementHistoryRowDto } from './dto/settlement-history-row.dto';
import type { CallCenterOperationsSummaryDto } from './dto/operations-summary.dto';
import type {
  DebtRecoveryDayRowDto,
  DebtRecoveryReportDto,
} from './dto/debt-recovery-report.dto';

const FOUR_DP = (d: Prisma.Decimal): string => d.toFixed(4);
const toIsoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Parse YYYY-MM-DD into UTC midnight. Invalid strings throw. */
function parseDayUtc(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${iso}`);
  }
  return d;
}

/** Extract `debtSettled` from a ledger row metadata blob safely. */
function extractDebtSettled(meta: Prisma.JsonValue | null): Prisma.Decimal {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return new Prisma.Decimal(0);
  }
  const v = (meta as Record<string, unknown>).debtSettled;
  if (typeof v !== 'string') return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(v);
  } catch {
    return new Prisma.Decimal(0);
  }
}

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerLedger: CustomerLedgerService,
  ) {}

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

  async activateSubscription(userId: string, dto: ActivateSubscriptionDto) {
    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.customerLedger.activateSubscriptionPlan(tx, {
        customerId: dto.customerId,
        planId: dto.planId,
        performedByUserId: userId,
      });
      const [customer, plan, wallet] = await Promise.all([
        tx.customer.findUniqueOrThrow({
          where: { id: dto.customerId },
          select: {
            id: true,
            phone: true,
            phone2: true,
            address: true,
            displayName: true,
          },
        }),
        tx.subscriptionPlan.findUniqueOrThrow({
          where: { id: dto.planId },
        }),
        tx.customerWallet.findUniqueOrThrow({
          where: { customerId: dto.customerId },
        }),
      ]);
      return {
        customer,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.salePrice.toString(),
          creditAmount: plan.actualBalance.toString(),
        },
        wallet: {
          balance: wallet.balance.toString(),
          debt: wallet.debt.toString(),
        },
        settlement,
      };
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

  /**
   * Dastur §5 — three-KPI summary for the Call Center Ops Dashboard.
   * All aggregates are "live right now" — no caching, since collection teams
   * need the latest numbers to drive outbound calls.
   */
  async getOperationsSummary(): Promise<CallCenterOperationsSummaryDto> {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Two queries run in parallel — everything else is O(N) in-memory math.
    const [walletDebt, todaysLedgerRows, pendingLinksCount] = await Promise.all([
      // 1. Sum of all customer wallet debt (the stock of market debt).
      this.prisma.customerWallet.aggregate({
        _sum: { debt: true },
      }),
      // 2. Debt-settled portion of today's ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION.
      this.prisma.transactionHistory.findMany({
        where: {
          createdAt: { gte: dayStart, lt: dayEnd },
          type: {
            in: [
              LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
              LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
            ],
          },
        },
        select: { metadata: true },
      }),
      // 3. Count of UNPAID, non-canceled orders that already have a hosted URL.
      this.prisma.order.count({
        where: {
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          posHostedPaymentUrl: { not: null },
        },
      }),
    ]);

    const collectedToday = todaysLedgerRows.reduce(
      (acc, r) => acc.plus(extractDebtSettled(r.metadata)),
      new Prisma.Decimal(0),
    );

    return {
      totalMarketDebtKd: FOUR_DP(walletDebt._sum.debt ?? new Prisma.Decimal(0)),
      debtCollectedTodayKd: FOUR_DP(collectedToday),
      pendingLinksCount,
      dayIso: toIsoDay(dayStart),
    };
  }

  /**
   * Dastur §5 — Owner Debt Recovery Report.
   * Returns debt-settled KWD per UTC day between `from` and `to` (inclusive).
   * Defaults: last 30 days ending today (UTC).
   */
  async getDebtRecoveryReport(
    fromIso?: string,
    toIso?: string,
  ): Promise<DebtRecoveryReportDto> {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const toDay = toIso ? parseDayUtc(toIso) : new Date(todayUtc);
    const fromDay = fromIso
      ? parseDayUtc(fromIso)
      : (() => {
          const d = new Date(toDay);
          d.setUTCDate(d.getUTCDate() - 29);
          return d;
        })();

    if (fromDay.getTime() > toDay.getTime()) {
      throw new BadRequestException('`from` must be on or before `to`');
    }

    const windowEnd = new Date(toDay);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: fromDay, lt: windowEnd },
        type: {
          in: [
            LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
            LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
          ],
        },
      },
      select: {
        createdAt: true,
        type: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Pre-seed every day in the window so empty days show as zeros
    // (cleaner for sparkline rendering).
    const buckets = new Map<string, DebtRecoveryDayRowDto>();
    for (
      let cursor = new Date(fromDay);
      cursor.getTime() <= toDay.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const key = toIsoDay(cursor);
      buckets.set(key, {
        dayIso: key,
        recoveredKd: '0.0000',
        settlementCount: 0,
        subscriptionCount: 0,
      });
    }

    let total = new Prisma.Decimal(0);
    for (const r of rows) {
      const key = toIsoDay(r.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const debtSettled = extractDebtSettled(r.metadata);
      total = total.plus(debtSettled);
      bucket.recoveredKd = FOUR_DP(
        new Prisma.Decimal(bucket.recoveredKd).plus(debtSettled),
      );
      if (r.type === LedgerTransactionType.ORDER_WALLET_SETTLEMENT) {
        bucket.settlementCount += 1;
      } else {
        bucket.subscriptionCount += 1;
      }
    }

    return {
      from: toIsoDay(fromDay),
      to: toIsoDay(toDay),
      totalRecoveredKd: FOUR_DP(total),
      days: Array.from(buckets.values()),
    };
  }
}
