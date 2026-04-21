import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  GeneralLedgerEntryType,
  InvoiceAuditAction,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import {
  isSameKuwaitDay,
  kuwaitDayIso,
} from '../common/time/kuwait-time';
import { EditInvoiceDto } from './dto/edit-invoice.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log.dto';
import { CcPerformanceQueryDto } from './dto/cc-performance.dto';

/**
 * V19.9 — CALL_CENTER_SUPERVISOR invoice edit/void + reporting.
 *
 * Design notes (single source of truth):
 *  1. EDIT is allowed ONLY on the same Kuwait-local day as
 *     `order.createdAt` and ONLY for orders that are not already
 *     canceled. Edits change `totalPrice`, `posPaymentMethod`, and
 *     `notes`; line items are NOT editable in this pass (void +
 *     re-issue is the cleaner audit path).
 *  2. VOID flips `status` → `CANCELED`, reverses the full GL impact
 *     with a negative POS_SALE_COMPLETED entry tagged as a supervisor
 *     reversal, and rolls back the wallet so subscribers get their
 *     balance/debt restored to the pre-settlement state.
 *  3. Every EDIT and VOID writes exactly one InvoiceAuditLog row
 *     inside the same Prisma transaction as the order mutation — if
 *     the ledger write or the wallet rollback fails, the audit row
 *     is NEVER created because the whole transaction rolls back.
 */
@Injectable()
export class InvoiceAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  /* ================================================================
   *   Helpers
   * ================================================================ */

  private decimalToFilsBigInt(d: Prisma.Decimal | null | undefined): bigint {
    if (!d) return 0n;
    // KWD uses 3 decimal places; GL stores 4 for precision. Convert to
    // fils (3 dp) by rounding the 4-dp Decimal to the nearest fils.
    const filsStr = d.mul(1000).toFixed(0);
    return BigInt(filsStr);
  }

  private buildSnapshot(order: {
    id: string;
    status: OrderStatus;
    cashStatus: CashStatus;
    posPaymentMethod: PosPaymentMethod | null;
    totalPrice: Prisma.Decimal;
    notes: string | null;
    customerId: string;
    driverId: string | null;
    invoiceNumber: string | null;
    serialNumber: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): Prisma.JsonObject {
    return {
      id: order.id,
      status: order.status,
      cashStatus: order.cashStatus,
      posPaymentMethod: order.posPaymentMethod,
      totalPrice: order.totalPrice.toFixed(3),
      notes: order.notes,
      customerId: order.customerId,
      driverId: order.driverId,
      invoiceNumber: order.invoiceNumber,
      serialNumber: order.serialNumber,
      createdAt: order.createdAt.toISOString(),
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
    };
  }

  private diffSnapshots(
    before: Prisma.JsonObject,
    after: Prisma.JsonObject,
  ): string[] {
    const keys = new Set<string>([
      ...Object.keys(before),
      ...Object.keys(after),
    ]);
    const changed: string[] = [];
    for (const key of keys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed.push(key);
      }
    }
    return changed;
  }

  /**
   * Reverses the wallet side-effect of a settled order. For external
   * payment methods (CASH/KNET/PAYMENT_LINK/ONLINE) the wallet was
   * never touched, so nothing to do. For DEBT_ON_ACCOUNT we subtract
   * the invoice amount from wallet.debt (clamped at 0). For
   * SUBSCRIPTION_WALLET we add the invoice amount back to
   * wallet.balance.
   */
  private async reverseWalletForOrder(
    tx: Prisma.TransactionClient,
    order: {
      customerId: string;
      totalPrice: Prisma.Decimal;
      posPaymentMethod: PosPaymentMethod | null;
      walletSettledAt: Date | null;
    },
  ): Promise<void> {
    if (!order.walletSettledAt) return;
    const wallet = await tx.customerWallet.findUnique({
      where: { customerId: order.customerId },
      select: { id: true, balance: true, debt: true },
    });
    if (!wallet) return;
    const method = order.posPaymentMethod;
    if (method === PosPaymentMethod.DEBT_ON_ACCOUNT) {
      // Subtract debt; clamp at zero so we never flip to negative.
      const newDebt = wallet.debt.sub(order.totalPrice);
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: {
          debt: newDebt.lt(0) ? new Prisma.Decimal(0) : newDebt,
        },
      });
    } else if (method === PosPaymentMethod.SUBSCRIPTION_WALLET) {
      // Refund the balance the subscription spent on this invoice.
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance.add(order.totalPrice) },
      });
    }
    // External tenders (CASH / KNET / PAYMENT_LINK / ONLINE) have no
    // wallet effect; the cash/card was collected outside the ledger.
  }

  /**
   * Applies the wallet side-effect of a settled order ASSUMING the
   * wallet has already been reset for the new `posPaymentMethod`.
   * Mirrors the simplified paths of `reverseWalletForOrder` in the
   * opposite direction. Balance never goes below zero, debt never
   * below zero.
   */
  private async applyWalletForOrder(
    tx: Prisma.TransactionClient,
    order: {
      customerId: string;
      totalPrice: Prisma.Decimal;
      posPaymentMethod: PosPaymentMethod | null;
      walletSettledAt: Date | null;
    },
  ): Promise<void> {
    if (!order.walletSettledAt) return;
    const method = order.posPaymentMethod;
    if (method !== PosPaymentMethod.DEBT_ON_ACCOUNT && method !== PosPaymentMethod.SUBSCRIPTION_WALLET) {
      return;
    }
    const wallet = await tx.customerWallet.upsert({
      where: { customerId: order.customerId },
      create: { customerId: order.customerId },
      update: {},
      select: { id: true, balance: true, debt: true },
    });
    if (method === PosPaymentMethod.DEBT_ON_ACCOUNT) {
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { debt: wallet.debt.add(order.totalPrice) },
      });
    } else {
      // SUBSCRIPTION_WALLET: spend balance on the invoice.
      const newBalance = wallet.balance.sub(order.totalPrice);
      await tx.customerWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance.lt(0) ? new Prisma.Decimal(0) : newBalance,
        },
      });
    }
  }

  /* ================================================================
   *   EDIT — same-day only
   * ================================================================ */

  async editInvoice(
    orderId: string,
    actorId: string,
    actorRole: SafariRole,
    dto: EditInvoiceDto,
  ) {
    if (
      actorRole !== SafariRole.CALL_CENTER_SUPERVISOR &&
      actorRole !== SafariRole.OWNER
    ) {
      throw new ForbiddenException(
        'Only a Call Center Supervisor (or Owner) can edit an invoice.',
      );
    }
    const keys: (keyof EditInvoiceDto)[] = [
      'totalPrice',
      'posPaymentMethod',
      'notes',
    ];
    const hasChange = keys.some((k) => dto[k] !== undefined);
    if (!hasChange) {
      throw new BadRequestException(
        'At least one of totalPrice, posPaymentMethod, notes must be supplied.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            posPaymentMethod: true,
            totalPrice: true,
            notes: true,
            customerId: true,
            driverId: true,
            invoiceNumber: true,
            serialNumber: true,
            createdAt: true,
            completedAt: true,
            walletSettledAt: true,
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException(
            'Canceled invoices cannot be edited — re-issue a new invoice instead.',
          );
        }
        const now = new Date();
        if (!isSameKuwaitDay(order.createdAt, now)) {
          throw new BadRequestException(
            'Same-day edit window expired — this invoice was issued on a prior Kuwait-local day.',
          );
        }

        const before = this.buildSnapshot(order);
        const newTotal =
          dto.totalPrice !== undefined
            ? new Prisma.Decimal(dto.totalPrice)
            : order.totalPrice;
        if (newTotal.lt(0)) {
          throw new BadRequestException('totalPrice cannot be negative.');
        }
        const newMethod = dto.posPaymentMethod ?? order.posPaymentMethod;
        const newNotes = dto.notes !== undefined ? dto.notes : order.notes;

        // 1) Reverse the old wallet effect BEFORE mutating the order.
        await this.reverseWalletForOrder(tx, order);

        // 2) Mutate the order itself.
        await tx.order.update({
          where: { id: order.id },
          data: {
            totalPrice: newTotal,
            posPaymentMethod: newMethod,
            notes: newNotes,
          },
        });

        // 3) Re-apply wallet effect with the new amount/method.
        await this.applyWalletForOrder(tx, {
          customerId: order.customerId,
          totalPrice: newTotal,
          posPaymentMethod: newMethod,
          walletSettledAt: order.walletSettledAt,
        });

        // 4) GL impact: reverse the old sale, post the new sale. This
        // keeps the books balanced whether or not the totalPrice or
        // the method changed — when only notes change, both entries
        // cancel out to zero but still leave a trail.
        const delta = newTotal.sub(order.totalPrice);
        if (!delta.isZero() || newMethod !== order.posPaymentMethod) {
          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
            amount: order.totalPrice.neg(),
            memo: 'Invoice edit — reversal of original amount',
            orderId: order.id,
            customerId: order.customerId,
            actorUserId: actorId,
            metadata: {
              source: 'SUPERVISOR_EDIT_REVERSAL',
              reversalForOrderId: order.id,
              originalPaymentMethod: order.posPaymentMethod,
              originalAmount: order.totalPrice.toFixed(3),
            },
          });
          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
            amount: newTotal,
            memo: 'Invoice edit — new amount posted',
            orderId: order.id,
            customerId: order.customerId,
            actorUserId: actorId,
            metadata: {
              source: 'SUPERVISOR_EDIT_NEW',
              editedOrderId: order.id,
              newPaymentMethod: newMethod,
              newAmount: newTotal.toFixed(3),
            },
          });
        }

        // 5) Audit log row.
        const refreshed = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            posPaymentMethod: true,
            totalPrice: true,
            notes: true,
            customerId: true,
            driverId: true,
            invoiceNumber: true,
            serialNumber: true,
            createdAt: true,
            completedAt: true,
          },
        });
        const after = this.buildSnapshot(refreshed);
        const changedFields = this.diffSnapshots(before, after);
        const actor = await tx.user.findUniqueOrThrow({
          where: { id: actorId },
          select: { fullName: true, safariRole: true },
        });
        const audit = await tx.invoiceAuditLog.create({
          data: {
            orderId: order.id,
            action: InvoiceAuditAction.EDIT,
            actorId,
            actorRole: actor.safariRole,
            actorName: actor.fullName,
            beforeSnapshot: before,
            afterSnapshot: after,
            changedFields,
            reason: dto.reason ?? null,
            financialImpactFils:
              this.decimalToFilsBigInt(newTotal) -
              this.decimalToFilsBigInt(order.totalPrice),
            kuwaitDay: kuwaitDayIso(now),
          },
        });

        return {
          orderId: order.id,
          auditId: audit.id,
          changedFields,
          newTotal: newTotal.toFixed(3),
          newPaymentMethod: newMethod,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  /* ================================================================
   *   VOID — any day (supervisor-only)
   * ================================================================ */

  async voidInvoice(
    orderId: string,
    actorId: string,
    actorRole: SafariRole,
    reason: string,
  ) {
    if (
      actorRole !== SafariRole.CALL_CENTER_SUPERVISOR &&
      actorRole !== SafariRole.OWNER
    ) {
      throw new ForbiddenException(
        'Only a Call Center Supervisor (or Owner) can void an invoice.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            posPaymentMethod: true,
            totalPrice: true,
            notes: true,
            customerId: true,
            driverId: true,
            invoiceNumber: true,
            serialNumber: true,
            createdAt: true,
            completedAt: true,
            walletSettledAt: true,
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status === OrderStatus.CANCELED) {
          throw new BadRequestException('Invoice is already voided.');
        }

        const before = this.buildSnapshot(order);

        // 1) Reverse wallet side-effect (debt / subscription balance).
        await this.reverseWalletForOrder(tx, order);

        // 2) Flip status to CANCELED (soft-void) and drop the settled
        // timestamp so any re-run of settlement math is a no-op.
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELED,
            walletSettledAt: null,
          },
        });

        // 3) Post a single reversal GL entry tagged as a void.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          amount: order.totalPrice.neg(),
          memo: `Invoice void — ${reason.slice(0, 100)}`,
          orderId: order.id,
          customerId: order.customerId,
          actorUserId: actorId,
          metadata: {
            source: 'SUPERVISOR_VOID',
            voidedOrderId: order.id,
            originalPaymentMethod: order.posPaymentMethod,
            originalAmount: order.totalPrice.toFixed(3),
            reason,
          },
        });

        // 4) Audit log row. `afterSnapshot` mirrors before with
        // status=CANCELED and walletSettledAt=null so the diff is
        // self-describing without a second DB round-trip.
        const refreshed = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: {
            id: true,
            status: true,
            cashStatus: true,
            posPaymentMethod: true,
            totalPrice: true,
            notes: true,
            customerId: true,
            driverId: true,
            invoiceNumber: true,
            serialNumber: true,
            createdAt: true,
            completedAt: true,
          },
        });
        const after = this.buildSnapshot(refreshed);
        const changedFields = this.diffSnapshots(before, after);
        const actor = await tx.user.findUniqueOrThrow({
          where: { id: actorId },
          select: { fullName: true, safariRole: true },
        });
        const audit = await tx.invoiceAuditLog.create({
          data: {
            orderId: order.id,
            action: InvoiceAuditAction.VOID,
            actorId,
            actorRole: actor.safariRole,
            actorName: actor.fullName,
            beforeSnapshot: before,
            afterSnapshot: after,
            changedFields,
            reason,
            financialImpactFils:
              -this.decimalToFilsBigInt(order.totalPrice),
            kuwaitDay: kuwaitDayIso(new Date()),
          },
        });

        return {
          orderId: order.id,
          auditId: audit.id,
          reversedAmount: order.totalPrice.toFixed(3),
          reason,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  /* ================================================================
   *   Reports
   * ================================================================ */

  async listAuditLog(query: ListAuditLogQueryDto) {
    const where: Prisma.InvoiceAuditLogWhereInput = {};
    if (query.from && query.to) {
      where.kuwaitDay = { gte: query.from, lte: query.to };
    } else if (query.from) {
      where.kuwaitDay = { gte: query.from };
    } else if (query.to) {
      where.kuwaitDay = { lte: query.to };
    }
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    const [rows, total] = await Promise.all([
      this.prisma.invoiceAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          order: {
            select: {
              id: true,
              serialNumber: true,
              invoiceNumber: true,
              totalPrice: true,
              status: true,
              customer: {
                select: {
                  id: true,
                  displayName: true,
                  phone: true,
                },
              },
            },
          },
          actor: {
            select: { id: true, fullName: true, safariRole: true },
          },
        },
      }),
      this.prisma.invoiceAuditLog.count({ where }),
    ]);
    return {
      rows: rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        action: r.action,
        actor: {
          id: r.actor.id,
          fullName: r.actor.fullName,
          safariRole: r.actor.safariRole,
        },
        actorRoleAtTime: r.actorRole,
        actorNameAtTime: r.actorName,
        reason: r.reason,
        changedFields: r.changedFields,
        financialImpactKd: (Number(r.financialImpactFils) / 1000).toFixed(3),
        beforeSnapshot: r.beforeSnapshot,
        afterSnapshot: r.afterSnapshot,
        kuwaitDay: r.kuwaitDay,
        createdAt: r.createdAt.toISOString(),
        order: r.order && {
          id: r.order.id,
          serialNumber: r.order.serialNumber,
          invoiceNumber: r.order.invoiceNumber,
          totalPriceKd: r.order.totalPrice.toFixed(3),
          status: r.order.status,
          customer: r.order.customer,
        },
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * V19.9 — Per-agent Call-Center performance over a Kuwait-local
   * date range. Pulls four signals from the ledger:
   *   • `collectedKd`    — manual CC collections (TH source='CALL_CENTER_MANUAL')
   *   • `activationsCount` — subscription activations attributed to the agent
   *   • `debtSettledKd`  — portion of collections that reduced debt
   *   • `customersServed` — distinct customers touched by the agent
   */
  async getCcPerformance(q: CcPerformanceQueryDto) {
    const now = new Date();
    const todayIso = kuwaitDayIso(now);
    const fromIso = q.from ?? todayIso;
    const toIso = q.to ?? todayIso;
    // Kuwait-day window → UTC boundaries.
    const fromUtc = new Date(`${fromIso}T00:00:00+03:00`);
    const toUtc = new Date(`${toIso}T23:59:59.999+03:00`);

    // 1) TransactionHistory: every row the CC performed in range,
    // grouped by performedByUserId. Each row has metadata flags the
    // payments service sets — we read `debtSettled`, `subscriptionId`,
    // and filter manual CC-originated rows vs agent activations.
    const rows = await this.prisma.transactionHistory.findMany({
      where: {
        createdAt: { gte: fromUtc, lte: toUtc },
        OR: [
          {
            type: 'ORDER_WALLET_SETTLEMENT',
          },
          {
            type: 'SUBSCRIPTION_ACTIVATION',
          },
        ],
      },
      select: {
        id: true,
        type: true,
        amount: true,
        customerId: true,
        performedById: true,
        metadata: true,
        createdAt: true,
        performedBy: {
          select: {
            id: true,
            fullName: true,
            safariRole: true,
          },
        },
      },
    });

    type AgentAggregate = {
      agentId: string;
      agentName: string;
      role: SafariRole;
      collectedKd: Prisma.Decimal;
      debtSettledKd: Prisma.Decimal;
      activationsCount: number;
      customerIds: Set<string>;
    };
    const agg = new Map<string, AgentAggregate>();

    const bumpAgent = (
      row: (typeof rows)[number],
    ): AgentAggregate | null => {
      const performer = row.performedBy;
      if (!performer) return null;
      if (
        performer.safariRole !== SafariRole.CALL_CENTER &&
        performer.safariRole !== SafariRole.CALL_CENTER_SUPERVISOR
      )
        return null;
      let a = agg.get(performer.id);
      if (!a) {
        a = {
          agentId: performer.id,
          agentName: performer.fullName,
          role: performer.safariRole,
          collectedKd: new Prisma.Decimal(0),
          debtSettledKd: new Prisma.Decimal(0),
          activationsCount: 0,
          customerIds: new Set(),
        };
        agg.set(performer.id, a);
      }
      return a;
    };

    for (const row of rows) {
      const a = bumpAgent(row);
      if (!a) continue;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      a.customerIds.add(row.customerId);
      if (row.type === 'SUBSCRIPTION_ACTIVATION') {
        a.activationsCount += 1;
        const dsStr = typeof meta.debtSettled === 'string' ? meta.debtSettled : null;
        if (dsStr) a.debtSettledKd = a.debtSettledKd.add(new Prisma.Decimal(dsStr));
      } else if (row.type === 'ORDER_WALLET_SETTLEMENT') {
        const viaCallCenter =
          meta.debtSettlementViaCallCenter === true ||
          meta.source === 'CALL_CENTER_MANUAL';
        if (viaCallCenter) {
          a.collectedKd = a.collectedKd.add(row.amount);
          const dsStr = typeof meta.debtSettled === 'string' ? meta.debtSettled : null;
          if (dsStr)
            a.debtSettledKd = a.debtSettledKd.add(new Prisma.Decimal(dsStr));
        }
      }
    }

    const agents = Array.from(agg.values())
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        role: a.role,
        collectedKd: a.collectedKd.toFixed(3),
        debtSettledKd: a.debtSettledKd.toFixed(3),
        activationsCount: a.activationsCount,
        customersServed: a.customerIds.size,
      }))
      .sort((a, b) => Number(b.collectedKd) - Number(a.collectedKd));

    const totals = agents.reduce(
      (acc, a) => ({
        collectedKd: acc.collectedKd.add(new Prisma.Decimal(a.collectedKd)),
        debtSettledKd: acc.debtSettledKd.add(new Prisma.Decimal(a.debtSettledKd)),
        activationsCount: acc.activationsCount + a.activationsCount,
        customersServed: acc.customersServed + a.customersServed,
      }),
      {
        collectedKd: new Prisma.Decimal(0),
        debtSettledKd: new Prisma.Decimal(0),
        activationsCount: 0,
        customersServed: 0,
      },
    );

    return {
      from: fromIso,
      to: toIso,
      agents,
      totals: {
        collectedKd: totals.collectedKd.toFixed(3),
        debtSettledKd: totals.debtSettledKd.toFixed(3),
        activationsCount: totals.activationsCount,
        customersServed: totals.customersServed,
      },
    };
  }
}
