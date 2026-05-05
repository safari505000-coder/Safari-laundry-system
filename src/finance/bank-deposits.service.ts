import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BankDepositStatus,
  BankDepositType,
  GeneralLedgerEntryType,
  ManagerCashCustodyStatus,
  Prisma,
} from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';

@Injectable()
export class BankDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(q: BankDepositsListQueryDto) {
    const take = q.take ?? 100;
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ?
      new Date(q.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const rows = await this.prisma.bankDepositLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, fullName: true, username: true },
        },
        verifiedByAccountant: {
          select: { id: true, fullName: true, username: true },
        },
      },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      entries: rows.map((r) => ({
        id: r.id,
        depositType: r.depositType,
        status: r.status,
        amountKd: r.amountKd.toString(),
        receiptImageUrl: r.receiptImageUrl,
        shiftId: r.shiftId,
        createdAt: r.createdAt.toISOString(),
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        uploadedBy: r.uploadedBy,
        verifiedByAccountant: r.verifiedByAccountant,
      })),
    };
  }

  async createFromUpload(
    managerId: string,
    fileUrl: string,
    depositType: BankDepositType,
    amountKd: number,
    shiftId?: string | null,
    /**
     * Actor role from JWT. Optional for backwards compatibility with
     * any internal caller that does not yet plumb the role through;
     * when omitted the audit log records `null` and the SSoT cron
     * will surface the missing role on its next sweep.
     */
    actorRole?: string | null,
  ) {
    if (!Number.isFinite(amountKd) || amountKd < 0) {
      throw new BadRequestException('Invalid amount');
    }
    if (shiftId) {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found');
      }
    }

    // Coverage check — does this manager actually hold enough custody to
    // back a deposit slip of `amountKd`? Computed from the canonical
    // ledger source (ManagerCashCustody.PENDING_DEPOSIT|AWAITING_VERIFICATION),
    // not from any stored balance. This is a SOFT check: the row is still
    // created (legacy non-CASH deposit types like KNET_RETURN never have a
    // matching custody bag, and the slip-first flow can register the slip
    // before the formal handover bag exists), but uncovered amounts emit a
    // CASH_DEPOSIT_UNCOVERED audit row with `suspicious=true` so the
    // accountant timeline surfaces them on the next sweep.
    let coverage = {
      heldKd: '0.0000',
      heldBagCount: 0,
      gapKd: '0.0000',
      flagged: false,
    };
    if (
      depositType === BankDepositType.CASH_DEPOSIT_SLIP &&
      amountKd > 0
    ) {
      const heldAgg = await this.prisma.managerCashCustody.aggregate({
        where: {
          managerId,
          status: {
            in: [
              ManagerCashCustodyStatus.PENDING_DEPOSIT,
              ManagerCashCustodyStatus.AWAITING_VERIFICATION,
            ],
          },
        },
        _sum: { amountKd: true },
        _count: { _all: true },
      });
      const heldDec = heldAgg._sum.amountKd
        ? new Prisma.Decimal(heldAgg._sum.amountKd.toString())
        : new Prisma.Decimal(0);
      const amountDec = new Prisma.Decimal(amountKd.toFixed(4));
      const gapDec = amountDec.minus(heldDec);
      coverage = {
        heldKd: heldDec.toFixed(4),
        heldBagCount: heldAgg._count._all,
        gapKd: gapDec.gt(0) ? gapDec.toFixed(4) : '0.0000',
        flagged: gapDec.gt(0),
      };
    }

    const row = await this.prisma.bankDepositLog.create({
      data: {
        depositType,
        amountKd: new Prisma.Decimal(amountKd.toFixed(4)),
        receiptImageUrl: fileUrl,
        shiftId: shiftId ?? null,
        uploadedById: managerId,
      },
      include: {
        uploadedBy: {
          select: { id: true, fullName: true, username: true },
        },
        verifiedByAccountant: {
          select: { id: true, fullName: true, username: true },
        },
      },
    });
    this.auditLogs.logFinancialEvent({
      action: 'CASH_DEPOSIT_REGISTERED',
      customerId: null,
      amount: amountKd.toFixed(4),
      source: 'BANK_DEPOSIT_UPLOAD',
      userId: managerId,
      role: actorRole ?? null,
      changes: {
        bankDepositLogId: row.id,
        depositType,
        shiftId: shiftId ?? null,
        receiptImageUrl: fileUrl,
        coverage,
      },
    });
    if (coverage.flagged) {
      this.auditLogs.log({
        userId: managerId,
        role: actorRole ?? null,
        action: 'CASH_DEPOSIT_UNCOVERED',
        resource: 'bank_deposit_log',
        amount: amountKd.toFixed(4),
        source: 'BANK_DEPOSIT_UPLOAD',
        status: 'SUCCESS',
        suspicious: true,
        changes: {
          bankDepositLogId: row.id,
          depositType,
          shiftId: shiftId ?? null,
          managerId,
          declaredAmountKd: amountKd.toFixed(4),
          heldCustodyKd: coverage.heldKd,
          heldCustodyBagCount: coverage.heldBagCount,
          shortfallKd: coverage.gapKd,
        },
      });
    }
    return this.mapOne(row);
  }

  async verify(accountantId: string, id: string) {
    const row = await this.prisma.bankDepositLog.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Deposit log entry not found');
    }
    if (row.verifiedByAccountantId) {
      throw new BadRequestException('Already verified by accountant');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.bankDepositLog.update({
        where: { id },
        data: {
          verifiedByAccountantId: accountantId,
          verifiedAt: new Date(),
          status: BankDepositStatus.VERIFIED,
        },
        include: {
          uploadedBy: {
            select: { id: true, fullName: true, username: true },
          },
          verifiedByAccountant: {
            select: { id: true, fullName: true, username: true },
          },
        },
      });

      // A3.D2 — Every accountant-verified deposit (whether through the
      // ManagerCashCustody bag workflow or this legacy receipt-only log)
      // must leave an audit trail on the GL so the Unified Ledger shows
      // a complete picture of money hitting the bank. The amount is
      // intentionally posted as zero: the real cash settlement row is
      // booked by ManagerCashCustody.verifyCustody for the normal flow,
      // and for orphan receipts (no custody bag) the metadata still
      // preserves the full amount for manual reconciliation. This
      // prevents double-counting in SUM(WALLET_SETTLEMENT) while keeping
      // the row visible.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.WALLET_SETTLEMENT,
        amount: 0,
        memo: `bank-deposit:${next.depositType.toLowerCase()}:verified`,
        actorUserId: accountantId,
        metadata: {
          source: 'BANK_DEPOSIT_LOG',
          bankDepositLogId: next.id,
          depositType: next.depositType,
          amountKd: next.amountKd.toString(),
          receiptImageUrl: next.receiptImageUrl,
          shiftId: next.shiftId,
          uploadedById: next.uploadedById,
        },
      });

      return next;
    });
    return this.mapOne(updated);
  }

  private mapOne(
    row: Prisma.BankDepositLogGetPayload<{
      include: {
        uploadedBy: { select: { id: true; fullName: true; username: true } };
        verifiedByAccountant: {
          select: { id: true; fullName: true; username: true };
        };
      };
    }>,
  ) {
    return {
      id: row.id,
      depositType: row.depositType,
      status: row.status,
      amountKd: row.amountKd.toString(),
      receiptImageUrl: row.receiptImageUrl,
      shiftId: row.shiftId,
      createdAt: row.createdAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      uploadedBy: row.uploadedBy,
      verifiedByAccountant: row.verifiedByAccountant,
    };
  }
}
