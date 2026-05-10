import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, SafariRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { JournalSourceService } from '../general-ledger/journal-source.service';
import { computeCustomer360FinancialCore } from './customer-360-financials';
import { buildInsight, evaluateCustomer } from './customer-evaluator';
import { sanitizeCustomerView } from './sanitize-customer-360-view';
import type {
  Customer360CustomerDto,
  Customer360InternalDto,
  Customer360InsightsDto,
  Customer360SanitizedDto,
  Customer360ScoreDto,
  Customer360StatementDto,
  Customer360SubscriptionFinancialsDto,
  Customer360SubscriptionDto,
} from './customer-360.types';

const INTERNAL_CUSTOMER_360_ROLES = new Set<string>([
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

export type Customer360ResponseDto = Customer360InternalDto | Customer360SanitizedDto;

@Injectable()
export class Customer360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerBlocking: CustomerBlockingService,
    /**
     * V20.4 — Phase 2 optional injection. The journal source is
     * optional so legacy unit tests that construct this service
     * with `(prisma, blocking)` keep compiling; production DI
     * always provides the reader so Customer 360 reports the
     * canonical bank-grade debt number.
     */
    @Optional()
    @Inject(JournalSourceService)
    private readonly journalSource?: JournalSourceService,
  ) {}

  async get360(customerId: string, user: JwtUser): Promise<Customer360ResponseDto> {
    const role = (user.role ?? '').trim().toUpperCase();
    this.assertAuthorizedForCustomer(customerId, role, user.linkedCustomerId ?? null);

    const customerRow = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        phone: true,
        phone2: true,
      },
    });
    if (!customerRow) {
      throw new NotFoundException('Customer not found');
    }

    const financials = await computeCustomer360FinancialCore(
      this.prisma,
      customerId,
      this.journalSource ?? null,
    );
    const blocked = await this.customerBlocking.applyAutoBlockFromFinancials(
      customerId,
      financials.canonicalDebtKd,
    );
    if (blocked) {
      financials.isBlocked = blocked.isBlocked;
      financials.blockReason = blocked.blockReason;
      financials.blockedAtIso = blocked.blockedAt?.toISOString() ?? null;
    }
    const rating = evaluateCustomer(financials);
    const insight = buildInsight(financials, rating);

    const subs = await this.prisma.customerSubscription.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 48,
      select: {
        id: true,
        status: true,
        planNameSnapshot: true,
        planSalePriceSnapshot: true,
        planActualBalanceSnapshot: true,
        planValidityDaysSnapshot: true,
        carriedBalanceKd: true,
        activatedAt: true,
        expiresAt: true,
        closedAt: true,
        closedReason: true,
      },
    });

    const subscriptions: Customer360SubscriptionDto[] = subs.map((s) => ({
      id: s.id,
      status: s.status,
      planNameSnapshot: s.planNameSnapshot,
      planSalePriceKd: s.planSalePriceSnapshot.toFixed(4),
      planActualBalanceKd: s.planActualBalanceSnapshot.toFixed(4),
      planValidityDays: s.planValidityDaysSnapshot,
      carriedBalanceKd: s.carriedBalanceKd.toFixed(4),
      activatedAtIso: s.activatedAt.toISOString(),
      expiresAtIso: s.expiresAt.toISOString(),
      closedAtIso: s.closedAt?.toISOString() ?? null,
      closedReason: s.closedReason,
    }));

    const fbAgg = await this.prisma.orderFeedback.aggregate({
      where: { order: { customerId } },
      _avg: { rating: true },
    });
    const feedbackAverage =
      fbAgg._avg.rating != null ? Math.round(Number(fbAgg._avg.rating) * 100) / 100 : null;

    const statement: Customer360StatementDto = {
      financials,
      narrativeLines: [
        `قراءة داخلية: المبلغ المطلوب دفعه ${financials.canonicalDebtKd} د.ك مقارنة بالمدفوعات.`,
        'راقب تجاوز الاشتراك مقارنة بقيمة الباقة الفعلية لهذا العميل.',
      ],
    };

    const subscription: Customer360SubscriptionFinancialsDto = {
      subscriptionValueKd: financials.subscriptionValueKd,
      subscriptionConsumedKd: financials.subscriptionConsumedKd,
      subscriptionRemainingKd: financials.subscriptionRemainingKd,
    };

    // V23.2 — score formula migrated to canonical receivable + Decimal
    // arithmetic. The score is a 0..100 reputation index, NOT money;
    // the cast to `number` happens once via Prisma.Decimal.toNumber()
    // which is the documented escape hatch for purely-numeric outputs.
    // Feedback average is already a number (rating column is integer).
    const debtPenalty = new Prisma.Decimal(financials.canonicalDebtKd)
      .times(2)
      .toNumber();
    const score: Customer360ScoreDto = {
      value: Math.max(
        0,
        Math.min(
          100,
          85 - debtPenalty + (feedbackAverage ?? 0) * 2,
        ),
      ),
      feedbackAverage,
      factors: ['مستوى الدين من السجل', 'سرعة إصدار الفواتير', 'تقييمات العميل'],
    };

    const insights: Customer360InsightsDto = {
      summary: 'قراءة تشغيلية للمبلغ المستحق وتجاوز الاشتراك.',
      detail:
        'هذا الملف يوضح المبالغ غير المسددة وتجاوز الاشتراك عندما تتخطى الطلبات قيمة الباقة.',
    };

    const internal: Customer360InternalDto = {
      customer: {
        id: customerRow.id,
        displayName: customerRow.displayName,
        phone: customerRow.phone,
        phone2: customerRow.phone2,
      } satisfies Customer360CustomerDto,
      subscriptions,
      subscription,
      statement,
      rating,
      insight,
      score,
      insights,
      alerts: [
        {
          code: 'DEBT_WATCH',
          message: 'مبلغ مستحق مرتفع — اتبع إجراءات التحصيل.',
        },
      ],
      internalNotes:
        'ملاحظة داخلية: تمت متابعة العميل بخصوص المبلغ المستحق؛ راقب الاستهلاك في الدورة القادمة.',
    };

    if (INTERNAL_CUSTOMER_360_ROLES.has(role)) {
      return internal;
    }
    if (role === SafariRole.CUSTOMER) {
      return sanitizeCustomerView(internal);
    }
    throw new ForbiddenException('Customer 360 is not available for this role.');
  }

  private assertAuthorizedForCustomer(
    customerId: string,
    role: string,
    linkedCustomerId: string | null,
  ): void {
    if (INTERNAL_CUSTOMER_360_ROLES.has(role)) {
      return;
    }
    if (role === SafariRole.CUSTOMER) {
      if (!linkedCustomerId || linkedCustomerId !== customerId) {
        throw new ForbiddenException('Cannot access another customer profile.');
      }
      return;
    }
    throw new ForbiddenException('Customer 360 is not available for this role.');
  }
}
