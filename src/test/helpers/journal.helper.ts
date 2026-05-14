import { JournalEntry, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

function asDecimal(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return value ?? new Prisma.Decimal('0.0000');
}

export async function assertJournalBalanced(
  prisma: Db,
  entryId: string,
): Promise<void> {
  const totals = await prisma.journalLine.aggregate({
    where: { entryId },
    _sum: {
      debit: true,
      credit: true,
    },
  });

  const debit = asDecimal(totals._sum.debit);
  const credit = asDecimal(totals._sum.credit);

  if (!debit.equals(credit)) {
    throw new Error(
      `Journal entry ${entryId} is not balanced: debit=${debit.toFixed(4)} credit=${credit.toFixed(4)}`,
    );
  }
}

export async function assertJournalEntryExists(
  prisma: Db,
  sourceRef: string,
): Promise<JournalEntry> {
  const entry = await prisma.journalEntry.findUnique({
    where: { sourceRef },
  });

  if (!entry) {
    throw new Error(`Expected journal entry with sourceRef=${sourceRef} to exist`);
  }

  return entry;
}

export async function getArBalance(
  prisma: Db,
  customerId: string,
): Promise<Prisma.Decimal> {
  const arAccount = await prisma.account.findUnique({
    where: { code: '1300' },
    select: { id: true },
  });

  if (!arAccount) {
    throw new Error('AR account 1300 is not seeded');
  }

  const totals = await prisma.journalLine.aggregate({
    where: {
      accountId: arAccount.id,
      entry: { customerId },
    },
    _sum: {
      debit: true,
      credit: true,
    },
  });

  const debit = asDecimal(totals._sum.debit);
  const credit = asDecimal(totals._sum.credit);
  return credit.minus(debit);
}

export async function assertJournalEntryCount(
  prisma: Db,
  sourceRef: string,
  expected: number,
): Promise<void> {
  const count = await prisma.journalEntry.count({
    where: { sourceRef },
  });

  if (count !== expected) {
    throw new Error(
      `Expected ${expected} journal entries for sourceRef=${sourceRef}, found ${count}`,
    );
  }
}
