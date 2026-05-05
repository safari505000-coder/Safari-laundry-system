import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DepositStatus,
  DepositType,
  GeneralLedgerEntryType,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertInstitutionalMutationAllowed } from '../auth/institutional-mutation.util';
import { DepositsListQueryDto } from './dto/deposits-list-query.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { DebtService } from './services/debt.service';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtService: DebtService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  async listForUser(
    userId: string,
    role: string,
    query: DepositsListQueryDto,
  ) {
    const nameQ = query.driverName?.trim();
    const where: Prisma.DepositWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(nameQ ?
        {
          driver: {
            fullName: { contains: nameQ, mode: 'insensitive' },
          },
        }
      : {}),
    };
    if (role === SafariRole.DRIVER) {
      where.driverId = userId;
      // Drivers always see only their own rows; ignore name/ID filters from query string.
      delete where.driver;
    }
    const rows = await this.prisma.deposit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        driver: {
          select: {
            id: true,
            fullName: true,
            username: true,
            branchId: true,
          },
        },
        auditedBy: {
          select: { id: true, fullName: true, username: true },
        },
      },
    });
    return {
      rows: rows.map((r) => ({
        id: r.id,
        driverId: r.driverId,
        driverName: r.driver.fullName,
        amount: r.amount.toString(),
        type: r.type,
        receiptImage: r.receiptImage,
        status: r.status,
        auditComment: r.auditComment,
        auditedBy: r.auditedBy ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async createByDriver(
    driverId: string,
    amount: number,
    type: DepositType,
    receiptImageUrl: string,
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be positive');
    }
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, safariRole: true },
    });
    if (!driver || driver.safariRole !== SafariRole.DRIVER) {
      throw new BadRequestException('Only DRIVER can create deposit request');
    }
    const row = await this.prisma.deposit.create({
      data: {
        driverId,
        amount: new Prisma.Decimal(amount.toFixed(4)),
        type,
        receiptImage: receiptImageUrl,
        status: DepositStatus.PENDING,
      },
      include: {
        driver: {
          select: {
            id: true,
            fullName: true,
            username: true,
            branchId: true,
          },
        },
      },
    });
    return {
      id: row.id,
      driverId: row.driverId,
      driverName: row.driver.fullName,
      amount: row.amount.toString(),
      type: row.type,
      receiptImage: row.receiptImage,
      status: row.status,
      auditComment: row.auditComment,
      auditedBy: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateStatus(
    auditorId: string,
    auditorRole: SafariRole,
    id: string,
    dto: UpdateDepositStatusDto,
  ) {
    assertInstitutionalMutationAllowed(auditorRole);
    const row = await this.prisma.deposit.findUnique({
      where: { id },
      include: {
        driver: {
          select: { id: true, safariRole: true, branchId: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Deposit not found');
    if (row.status !== DepositStatus.PENDING) {
      throw new BadRequestException('Only pending deposits can be updated');
    }
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status: dto.status,
          auditComment: dto.auditComment?.trim() || null,
          auditedById: auditorId,
        },
      });
      if (dto.status === DepositStatus.APPROVED) {
        const amountNum = Number.parseFloat(updated.amount.toString());
        // Integration rule: approved deposit must reduce driver liability.
        await this.debtService.applyDriverDepositSettlement(row.driverId, amountNum);
        // Integration rule: approved deposit increases cash/bank custody balance.
        const branchId = row.driver.branchId;
        if (branchId) {
          const existing = await tx.wallet.findFirst({
            where: { branchId, currency: 'KWD' },
            select: { id: true, balance: true },
          });
          if (existing) {
            await tx.wallet.update({
              where: { id: existing.id },
              data: {
                balance: existing.balance.add(new Prisma.Decimal(amountNum.toFixed(4))),
              },
            });
          } else {
            await tx.wallet.create({
              data: {
                branchId,
                currency: 'KWD',
                balance: new Prisma.Decimal(amountNum.toFixed(4)),
              },
            });
          }
        }

        // A3.D3 — Approved driver deposits move real cash into the branch
        // wallet and settle CASH order liabilities. The corresponding
        // order-level settlement is already captured via
        // applyDriverDepositSettlement (which flips cashStatus), but the
        // event itself had no GL footprint. We now emit a zero-amount
        // WALLET_SETTLEMENT audit row so the Unified Ledger stream
        // surfaces the deposit without double-counting the underlying
        // order totals already logged as POS_SALE_COMPLETED.
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.WALLET_SETTLEMENT,
          amount: 0,
          memo: `driver-deposit:${updated.type.toLowerCase()}:approved`,
          actorUserId: auditorId,
          metadata: {
            source: 'DRIVER_DEPOSIT',
            depositId: updated.id,
            driverId: row.driverId,
            branchId,
            depositType: updated.type,
            amountKd: updated.amount.toString(),
            receiptImageUrl: updated.receiptImage,
          },
        });
      }
      return updated;
    });
    return {
      id: next.id,
      status: next.status,
      auditComment: next.auditComment,
      updatedAt: next.updatedAt.toISOString(),
    };
  }
}

