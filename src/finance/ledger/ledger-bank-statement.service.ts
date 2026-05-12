import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeLegacyJournalSourceRef } from '../../general-ledger/double-entry-journal.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Shown journal lines are restricted to this account so running balance is meaningful. */
const AR_ACCOUNT_CODE = '1300';

/**
 * Maps journal `source` / `sourceRef` to Arabic bank-statement description (V25 read-only UI).
 */
export function bankStatementDescriptionFromJournalSource(
  source: string,
  sourceRef: string,
): string {
  const ref = normalizeLegacyJournalSourceRef(sourceRef ?? '');
  const src = (source ?? '').trim();

  if (src === 'POS_SALE_COMPLETED') {
    return 'فاتورة مبيعات';
  }
  if (src === 'SUBSCRIPTION_ACTIVATION') {
    return 'تفعيل اشتراك';
  }
  if (src === 'WALLET_FUNDING') {
    return 'إيداع مالي';
  }
  if (
    src === 'PROCESS_TRANSACTION' &&
    /^WALLET_FUNDING:/i.test(ref)
  ) {
    return 'إيداع مالي';
  }
  if (src === 'WALLET_SETTLEMENT' || src === 'WALLET_ABSORPTION') {
    return 'تسوية من المحفظة';
  }
  if (src === 'INVOICE_ISSUED' || src === 'ORDER_INVOICE') {
    return 'فاتورة مبيعات';
  }
  if (src === 'PAYMENT' && /SUBSCRIPTION_ACTIVATION/i.test(ref)) {
    return 'تفعيل اشتراك';
  }
  return 'عملية مالية';
}

export type LedgerBankStatementRow = {
  lineId: string;
  entryId: string;
  dateIso: string;
  description: string;
  movementKd: string;
  runningBalanceKd: string;
};

@Injectable()
export class LedgerBankStatementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * V25 — Safe read-only bank-style view: AR (1300) lines for one customer,
   * chronological, with running balance = previous + debit − credit.
   */
  async getBankStatement(entityId: string): Promise<{
    entityId: string;
    closingBalanceKd: string;
    rows: LedgerBankStatementRow[];
  }> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId: entityId },
        account: { code: AR_ACCOUNT_CODE },
      },
      orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        debit: true,
        credit: true,
        entry: {
          select: {
            id: true,
            source: true,
            sourceRef: true,
            createdAt: true,
          },
        },
      },
    });

    let running = new Prisma.Decimal(0);
    const rows: LedgerBankStatementRow[] = lines.map((line) => {
      const debit = line.debit;
      const credit = line.credit;
      const movement = debit.sub(credit);
      running = running.add(debit).sub(credit);

      return {
        lineId: line.id,
        entryId: line.entry.id,
        dateIso: line.entry.createdAt.toISOString(),
        description: bankStatementDescriptionFromJournalSource(
          line.entry.source,
          line.entry.sourceRef,
        ),
        movementKd: movement.toFixed(4),
        runningBalanceKd: running.toFixed(4),
      };
    });

    return {
      entityId,
      closingBalanceKd: running.toFixed(4),
      rows,
    };
  }
}
