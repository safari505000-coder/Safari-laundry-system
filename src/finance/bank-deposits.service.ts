import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BankDepositType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BankDepositsListQueryDto } from './dto/bank-deposits-list-query.dto';

@Injectable()
export class BankDepositsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const updated = await this.prisma.bankDepositLog.update({
      where: { id },
      data: {
        verifiedByAccountantId: accountantId,
        verifiedAt: new Date(),
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
