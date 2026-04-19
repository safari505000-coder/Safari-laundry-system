import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashStatus,
  DebtTransferStatus,
  GeneralLedgerEntryType,
  OrderStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDebtTransferDto } from './dto/create-debt-transfer.dto';
import type { ListDebtTransfersDto } from './dto/list-debt-transfers.dto';

const DEBT_TRANSFER_INCLUDE = {
  sourceDriver: {
    select: {
      id: true,
      username: true,
      fullName: true,
      safariRole: true,
      branchId: true,
    },
  },
  targetDriver: {
    select: {
      id: true,
      username: true,
      fullName: true,
      safariRole: true,
      branchId: true,
    },
  },
  executedBy: {
    select: { id: true, username: true, fullName: true, safariRole: true },
  },
  cancelledBy: {
    select: { id: true, username: true, fullName: true, safariRole: true },
  },
  orders: {
    include: {
      order: {
        select: {
          id: true,
          invoiceNumber: true,
          serialNumber: true,
          status: true,
          cashStatus: true,
          totalPrice: true,
          posPaymentMethod: true,
          completedAt: true,
          customer: { select: { id: true, displayName: true, phone: true } },
        },
      },
    },
  },
} as const satisfies Prisma.DebtTransferInclude;

type DebtTransferRow = Prisma.DebtTransferGetPayload<{
  include: typeof DEBT_TRANSFER_INCLUDE;
}>;

/**
 * Dastur §5 — Driver Debt Transfer workflow.
 *
 * Who can do what:
 *   • GM / ACCOUNTANT: create, sign (on behalf in finalize), finalize, cancel, view, list.
 *   • DRIVER (source / target): sign only their half of the document.
 *   • OWNER: view + list + filter (read-only — no mutating actions).
 *
 * Invariants enforced here:
 *   1. A transfer can only include orders whose current `driverId` equals
 *      `sourceDriverId` AND whose `cashStatus === 'PAID_TO_DRIVER'` AND
 *      `status === 'COMPLETED'`. Any other state is rejected at creation.
 *   2. Orders already attached to another ACTIVE (non-CANCELLED) transfer
 *      cannot be included again until that transfer is cancelled.
 *   3. Finalisation is transactional: every order's `driverId` is flipped
 *      to the target driver and `transferredFromDriverId` is stamped (if
 *      not previously set) inside the same tx that writes the two
 *      balancing GL entries.
 */
@Injectable()
export class DebtTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  /* ── Driver roster (UI helper) ──────────────────────────────────────── */

  async listDrivers() {
    const drivers = await this.prisma.user.findMany({
      where: {
        safariRole: SafariRole.DRIVER,
        isActive: true,
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        username: true,
        safariRole: true,
        branchId: true,
      },
    });
    return { drivers };
  }

  /* ── Outstanding orders (source candidates) ─────────────────────────── */

  async getDriverOutstandingOrders(driverId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        driverId,
        status: OrderStatus.COMPLETED,
        cashStatus: CashStatus.PAID_TO_DRIVER,
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        serialNumber: true,
        totalPrice: true,
        posPaymentMethod: true,
        completedAt: true,
        customer: {
          select: { id: true, displayName: true, phone: true },
        },
      },
    });

    const total = orders.reduce(
      (acc, o) => acc.plus(o.totalPrice),
      new Prisma.Decimal(0),
    );

    return {
      driverId,
      orderCount: orders.length,
      totalAmount: total.toFixed(3),
      orders: orders.map((o) => ({
        ...o,
        totalPrice: o.totalPrice.toFixed(3),
      })),
    };
  }

  /* ── Create / initiate ─────────────────────────────────────────────── */

  async create(
    executorId: string,
    executorRole: SafariRole,
    dto: CreateDebtTransferDto,
  ) {
    if (
      executorRole !== SafariRole.GENERAL_MANAGER &&
      executorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException(
        'Only GENERAL_MANAGER or ACCOUNTANT may initiate a debt transfer.',
      );
    }
    if (dto.sourceDriverId === dto.targetDriverId) {
      throw new BadRequestException(
        'Source and target drivers must be different.',
      );
    }
    if (!dto.orderIds || dto.orderIds.length === 0) {
      throw new BadRequestException(
        'At least one order must be included in the transfer.',
      );
    }

    const [source, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.sourceDriverId } }),
      this.prisma.user.findUnique({ where: { id: dto.targetDriverId } }),
    ]);
    if (!source) throw new NotFoundException('Source driver not found.');
    if (!target) throw new NotFoundException('Target driver not found.');
    if (source.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException('Source must be a DRIVER.');
    }
    if (target.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException('Target must be a DRIVER.');
    }
    if (target.isActive === false) {
      throw new BadRequestException('Target driver is deactivated.');
    }

    const orderIds = Array.from(new Set(dto.orderIds));
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        driverId: true,
        status: true,
        cashStatus: true,
        totalPrice: true,
      },
    });
    if (orders.length !== orderIds.length) {
      throw new BadRequestException('One or more orders not found.');
    }
    const invalid = orders.filter(
      (o) =>
        o.driverId !== dto.sourceDriverId ||
        o.status !== OrderStatus.COMPLETED ||
        o.cashStatus !== CashStatus.PAID_TO_DRIVER,
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Orders must belong to source driver and be COMPLETED + PAID_TO_DRIVER. Invalid count: ${invalid.length}`,
      );
    }

    // Reject orders already locked inside another ACTIVE (non-cancelled) transfer.
    const alreadyLocked = await this.prisma.debtTransferOrder.findMany({
      where: {
        orderId: { in: orderIds },
        debtTransfer: {
          status: {
            in: [
              DebtTransferStatus.DRAFT,
              DebtTransferStatus.AWAITING_SIGNATURES,
              DebtTransferStatus.COMPLETED,
            ],
          },
        },
      },
      select: { orderId: true, debtTransferId: true },
    });
    if (alreadyLocked.length > 0) {
      throw new BadRequestException(
        `Orders already attached to another transfer: ${alreadyLocked
          .map((l) => l.orderId)
          .join(', ')}`,
      );
    }

    const totalAmount = orders.reduce(
      (acc, o) => acc.plus(o.totalPrice),
      new Prisma.Decimal(0),
    );

    const created = await this.prisma.debtTransfer.create({
      data: {
        sourceDriverId: dto.sourceDriverId,
        targetDriverId: dto.targetDriverId,
        totalAmount,
        orderCount: orders.length,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        status: DebtTransferStatus.AWAITING_SIGNATURES,
        executedById: executorId,
        executedByRole: executorRole,
        orders: {
          create: orders.map((o) => ({
            orderId: o.id,
            amountSnapshot: o.totalPrice,
          })),
        },
      },
      include: DEBT_TRANSFER_INCLUDE,
    });

    return this.serialize(created);
  }

  /* ── Signatures ────────────────────────────────────────────────────── */

  async signAsSource(transferId: string, signerId: string) {
    const transfer = await this.prisma.debtTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) throw new NotFoundException('Debt transfer not found.');
    if (transfer.status !== DebtTransferStatus.AWAITING_SIGNATURES) {
      throw new BadRequestException(
        `Transfer is not awaiting signatures (current: ${transfer.status}).`,
      );
    }
    if (transfer.sourceDriverId !== signerId) {
      throw new ForbiddenException(
        'Only the source driver may sign as source.',
      );
    }
    if (transfer.sourceSignedAt) {
      throw new BadRequestException('Source has already signed.');
    }
    const updated = await this.prisma.debtTransfer.update({
      where: { id: transferId },
      data: { sourceSignedAt: new Date() },
      include: DEBT_TRANSFER_INCLUDE,
    });
    return this.serialize(updated);
  }

  async signAsTarget(transferId: string, signerId: string) {
    const transfer = await this.prisma.debtTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) throw new NotFoundException('Debt transfer not found.');
    if (transfer.status !== DebtTransferStatus.AWAITING_SIGNATURES) {
      throw new BadRequestException(
        `Transfer is not awaiting signatures (current: ${transfer.status}).`,
      );
    }
    if (transfer.targetDriverId !== signerId) {
      throw new ForbiddenException(
        'Only the target driver may sign as target.',
      );
    }
    if (transfer.targetSignedAt) {
      throw new BadRequestException('Target has already signed.');
    }
    const updated = await this.prisma.debtTransfer.update({
      where: { id: transferId },
      data: { targetSignedAt: new Date() },
      include: DEBT_TRANSFER_INCLUDE,
    });
    return this.serialize(updated);
  }

  /* ── Finalise (apply the reassignment + GL entries) ────────────────── */

  async finalize(
    transferId: string,
    executorId: string,
    executorRole: SafariRole,
  ) {
    if (
      executorRole !== SafariRole.GENERAL_MANAGER &&
      executorRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException(
        'Only GENERAL_MANAGER or ACCOUNTANT may finalize a debt transfer.',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.debtTransfer.findUnique({
        where: { id: transferId },
        include: { orders: true },
      });
      if (!transfer) throw new NotFoundException('Debt transfer not found.');
      if (transfer.status !== DebtTransferStatus.AWAITING_SIGNATURES) {
        throw new BadRequestException(
          `Transfer is not awaiting signatures (current: ${transfer.status}).`,
        );
      }
      if (!transfer.sourceSignedAt || !transfer.targetSignedAt) {
        throw new BadRequestException(
          'Both source and target drivers must sign before finalization.',
        );
      }

      const orderIds = transfer.orders.map((o) => o.orderId);

      // Re-validate orders are still in PAID_TO_DRIVER on the source driver.
      const currentOrders = await tx.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          driverId: true,
          cashStatus: true,
          status: true,
          transferredFromDriverId: true,
        },
      });
      if (currentOrders.length !== orderIds.length) {
        throw new BadRequestException(
          'One or more orders no longer exist for finalization.',
        );
      }
      const stale = currentOrders.filter(
        (o) =>
          o.driverId !== transfer.sourceDriverId ||
          o.status !== OrderStatus.COMPLETED ||
          o.cashStatus !== CashStatus.PAID_TO_DRIVER,
      );
      if (stale.length > 0) {
        throw new BadRequestException(
          `Some orders have shifted state since signing (count: ${stale.length}). Cancel and recreate the transfer.`,
        );
      }

      // Reassign each order's driverId, stamping transferredFromDriverId
      // only if not previously set (first transfer wins for audit history).
      for (const o of currentOrders) {
        await tx.order.update({
          where: { id: o.id },
          data: {
            driverId: transfer.targetDriverId,
            transferredFromDriverId:
              o.transferredFromDriverId ?? transfer.sourceDriverId,
          },
        });
      }

      // Balancing GL pair.
      const metaBase = {
        kind: 'DEBT_TRANSFER',
        transferId: transfer.id,
        sourceDriverId: transfer.sourceDriverId,
        targetDriverId: transfer.targetDriverId,
        orderCount: transfer.orderCount,
      };
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: transfer.totalAmount.negated(),
        memo: `Debt transfer out (driver leaving) — ${transfer.id}`,
        metadata: { ...metaBase, direction: 'OUT' },
        actorUserId: transfer.sourceDriverId,
      });
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: transfer.totalAmount,
        memo: `Debt transfer in (driver accepting) — ${transfer.id}`,
        metadata: { ...metaBase, direction: 'IN' },
        actorUserId: transfer.targetDriverId,
      });

      const systemSignature = randomBytes(16).toString('hex');

      return tx.debtTransfer.update({
        where: { id: transferId },
        data: {
          status: DebtTransferStatus.COMPLETED,
          finalizedAt: new Date(),
          systemSignature,
        },
        include: DEBT_TRANSFER_INCLUDE,
      });
    });
    return this.serialize(result);
  }

  /* ── Cancel ────────────────────────────────────────────────────────── */

  async cancel(
    transferId: string,
    cancellerId: string,
    cancellerRole: SafariRole,
    reason: string | null,
  ) {
    if (
      cancellerRole !== SafariRole.GENERAL_MANAGER &&
      cancellerRole !== SafariRole.ACCOUNTANT
    ) {
      throw new ForbiddenException(
        'Only GENERAL_MANAGER or ACCOUNTANT may cancel a debt transfer.',
      );
    }
    const transfer = await this.prisma.debtTransfer.findUnique({
      where: { id: transferId },
    });
    if (!transfer) throw new NotFoundException('Debt transfer not found.');
    if (
      transfer.status !== DebtTransferStatus.DRAFT &&
      transfer.status !== DebtTransferStatus.AWAITING_SIGNATURES
    ) {
      throw new BadRequestException(
        'Only DRAFT or AWAITING_SIGNATURES transfers can be cancelled.',
      );
    }
    const updated = await this.prisma.debtTransfer.update({
      where: { id: transferId },
      data: {
        status: DebtTransferStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: cancellerId,
        cancelledReason: reason ?? null,
      },
      include: DEBT_TRANSFER_INCLUDE,
    });
    return this.serialize(updated);
  }

  /* ── Queries (list / findOne) ──────────────────────────────────────── */

  async listMine(userId: string) {
    const rows = await this.prisma.debtTransfer.findMany({
      where: {
        OR: [{ sourceDriverId: userId }, { targetDriverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: DEBT_TRANSFER_INCLUDE,
    });
    return { rows: rows.map((r) => this.serialize(r)) };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.debtTransfer.findUnique({
      where: { id },
      include: DEBT_TRANSFER_INCLUDE,
    });
    if (!transfer) throw new NotFoundException('Debt transfer not found.');
    return this.serialize(transfer);
  }

  async list(filters: ListDebtTransfersDto) {
    const where: Prisma.DebtTransferWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.sourceDriverId) where.sourceDriverId = filters.sourceDriverId;
    if (filters.targetDriverId) where.targetDriverId = filters.targetDriverId;
    if (filters.executedById) where.executedById = filters.executedById;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const take = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const skip = Math.max(filters.offset ?? 0, 0);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.debtTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: DEBT_TRANSFER_INCLUDE,
      }),
      this.prisma.debtTransfer.count({ where }),
    ]);

    return {
      total,
      limit: take,
      offset: skip,
      rows: rows.map((r) => this.serialize(r)),
    };
  }

  /* ── Serializer ─────────────────────────────────────────────────────── */

  private serialize(t: DebtTransferRow) {
    return {
      id: t.id,
      status: t.status,
      totalAmount: t.totalAmount.toFixed(3),
      orderCount: t.orderCount,
      reason: t.reason,
      notes: t.notes,
      sourceDriver: t.sourceDriver,
      targetDriver: t.targetDriver,
      executedBy: t.executedBy,
      executedByRole: t.executedByRole,
      sourceSignedAt: t.sourceSignedAt,
      targetSignedAt: t.targetSignedAt,
      finalizedAt: t.finalizedAt,
      cancelledAt: t.cancelledAt,
      cancelledReason: t.cancelledReason,
      cancelledBy: t.cancelledBy,
      systemSignature: t.systemSignature,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      orders: t.orders.map((line) => ({
        id: line.id,
        amountSnapshot: line.amountSnapshot.toFixed(3),
        order: {
          ...line.order,
          totalPrice: line.order.totalPrice.toFixed(3),
        },
      })),
    };
  }
}
