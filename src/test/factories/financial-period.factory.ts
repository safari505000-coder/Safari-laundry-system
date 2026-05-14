import { randomUUID } from 'node:crypto';
import {
  FinancialPeriod,
  FinancialPeriodStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

async function createPeriod(
  prisma: Db,
  year: number,
  month: number,
  status: FinancialPeriodStatus,
): Promise<FinancialPeriod> {
  return prisma.financialPeriod.upsert({
    where: { year_month: { year, month } },
    update: {
      status,
      lockedAt: status === FinancialPeriodStatus.CLOSED ? new Date() : null,
      lockNotes:
        status === FinancialPeriodStatus.CLOSED
          ? 'Closed by integration test factory'
          : null,
      reopenedAt: null,
      reopenedById: null,
      reopenReason: null,
    },
    create: {
      id: randomUUID(),
      year,
      month,
      status,
      lockedAt: status === FinancialPeriodStatus.CLOSED ? new Date() : null,
      lockNotes:
        status === FinancialPeriodStatus.CLOSED
          ? 'Closed by integration test factory'
          : null,
    },
  });
}

export async function createOpenPeriod(
  prisma: Db,
  year: number,
  month: number,
): Promise<FinancialPeriod> {
  return createPeriod(prisma, year, month, FinancialPeriodStatus.OPEN);
}

export async function createClosedPeriod(
  prisma: Db,
  year: number,
  month: number,
): Promise<FinancialPeriod> {
  return createPeriod(prisma, year, month, FinancialPeriodStatus.CLOSED);
}
