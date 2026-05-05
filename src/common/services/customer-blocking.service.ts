import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { computeCustomer360FinancialCore } from '../../customers/customer-360-financials';

type RequestUser = {
  userId?: string | null;
  sub?: string | null;
  role?: string | null;
};

export type CustomerBlockSnapshot = {
  id: string;
  isBlocked: boolean;
  blockReason: string | null;
  blockedAt: Date | null;
};

const HIGH_DEBT_BLOCK_THRESHOLD = 500;

@Injectable()
export class CustomerBlockingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findCustomerForRequest(
    req: Request,
  ): Promise<CustomerBlockSnapshot | null> {
    const params = req.params as Record<string, unknown>;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customerId = firstString(
      params.customerId,
      params.id,
      body.customerId,
    );
    if (customerId) {
      return this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          isBlocked: true,
          blockReason: true,
          blockedAt: true,
        },
      });
    }

    const phone = normalizePhone(firstString(body.customerPhone, body.phone));
    if (!phone) {
      return null;
    }

    return this.prisma.customer.findFirst({
      where: { OR: [{ phone }, { phone2: phone }] },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
  }

  canOverrideBlockedCustomer(role: string | null | undefined): boolean {
    const r = (role ?? '').trim().toUpperCase();
    return r === 'MANAGER' || r === 'BRANCH_MANAGER';
  }

  hasOverrideHeader(req: Request): boolean {
    const raw = req.headers['x-override-block'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.trim().toLowerCase() === 'true';
  }

  async logBlockedOverride(
    req: Request,
    customer: Pick<CustomerBlockSnapshot, 'id' | 'blockReason'>,
  ): Promise<void> {
    const user = (req as Request & { user?: RequestUser }).user;
    this.auditLogs.logFinancialEvent({
      action: 'OVERRIDE_BLOCKED_CUSTOMER',
      customerId: customer.id,
      userId: user?.userId ?? user?.sub ?? null,
      role: user?.role ?? null,
      source: 'CUSTOMER_BLOCK_GUARD',
      changes: {
        blockReason: customer.blockReason,
        overrideHeader: true,
        endpoint: req.originalUrl ?? req.url,
        method: req.method,
      },
    });
  }

  async autoBlockIfNeeded(
    customerId: string,
  ): Promise<CustomerBlockSnapshot | null> {
    const [customer, totalDueKd] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          isBlocked: true,
          blockReason: true,
          blockedAt: true,
        },
      }),
      this.computeTotalDueKd(customerId),
    ]);
    if (!customer) return null;
    if (totalDueKd <= HIGH_DEBT_BLOCK_THRESHOLD || customer.isBlocked) {
      return customer;
    }
    const blocked = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        isBlocked: true,
        blockReason: 'دين مرتفع',
        blockedAt: new Date(),
      },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
    this.auditLogs.logFinancialEvent({
      action: 'CUSTOMER_BLOCKED',
      customerId,
      source: 'AUTO_HIGH_DEBT',
      changes: {
        totalDueKd,
        blockReason: blocked.blockReason,
        blockedAt: blocked.blockedAt?.toISOString() ?? null,
      },
    });
    return blocked;
  }

  async applyAutoBlockFromFinancials(
    customerId: string,
    totalDueKd: string,
  ): Promise<CustomerBlockSnapshot | null> {
    const due = Number.parseFloat(totalDueKd);
    if (!Number.isFinite(due) || due <= HIGH_DEBT_BLOCK_THRESHOLD) {
      return this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          isBlocked: true,
          blockReason: true,
          blockedAt: true,
        },
      });
    }
    return this.autoBlockIfNeeded(customerId);
  }

  /**
   * V19.x — Manual block performed by a CALL_CENTER agent. Idempotent:
   * if the customer is already blocked the existing reason is kept and
   * no audit row is appended (so re-clicking the UI button does not
   * spam the audit trail). Distinct from `autoBlockIfNeeded`, which
   * fires off a financial debt threshold and writes
   * `source: 'AUTO_HIGH_DEBT'`.
   */
  async manualBlock(input: {
    customerId: string;
    reason: string;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<CustomerBlockSnapshot> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
    if (!customer) {
      throw new Error(`Customer ${input.customerId} not found`);
    }
    if (customer.isBlocked) {
      return customer;
    }
    const blocked = await this.prisma.customer.update({
      where: { id: input.customerId },
      data: {
        isBlocked: true,
        blockReason: input.reason.trim() || 'حظر يدوي',
        blockedAt: new Date(),
      },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
    this.auditLogs.logFinancialEvent({
      action: 'CUSTOMER_BLOCKED',
      customerId: input.customerId,
      userId: input.actorUserId,
      role: input.actorRole,
      source: 'CALL_CENTER_MANUAL',
      changes: {
        reason: blocked.blockReason,
        blockedAt: blocked.blockedAt?.toISOString() ?? null,
      },
    });
    return blocked;
  }

  /**
   * V19.x — Manual unblock. Symmetric counterpart of `manualBlock`.
   * Always writes a CUSTOMER_UNBLOCKED audit row, even if the customer
   * was already unblocked, so the agent's intent is recorded.
   */
  async manualUnblock(input: {
    customerId: string;
    reason: string | null;
    actorUserId: string | null;
    actorRole: string | null;
  }): Promise<CustomerBlockSnapshot> {
    const before = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
    if (!before) {
      throw new Error(`Customer ${input.customerId} not found`);
    }
    const after = await this.prisma.customer.update({
      where: { id: input.customerId },
      data: {
        isBlocked: false,
        blockReason: null,
        blockedAt: null,
      },
      select: {
        id: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });
    this.auditLogs.logFinancialEvent({
      action: 'CUSTOMER_UNBLOCKED',
      customerId: input.customerId,
      userId: input.actorUserId,
      role: input.actorRole,
      source: 'CALL_CENTER_MANUAL',
      changes: {
        previousReason: before.blockReason,
        previousBlockedAt: before.blockedAt?.toISOString() ?? null,
        unblockReason: input.reason,
        wasBlocked: before.isBlocked,
      },
    });
    return after;
  }

  private async computeTotalDueKd(customerId: string): Promise<number> {
    const fin = await computeCustomer360FinancialCore(this.prisma, customerId);
    const due = Number.parseFloat(fin.totalDueKd);
    return Number.isFinite(due) ? due : 0;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizePhone(value: string | null): string | null {
  const phone = value?.replace(/[\s-]/g, '').trim() ?? '';
  return phone || null;
}
