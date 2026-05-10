import { Injectable } from '@nestjs/common';
import { PosPaymentMethod, Prisma } from '@prisma/client';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from './double-entry-journal.service';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export type FinancialTransactionType =
  | 'PAYMENT'
  | 'SUBSIDY'
  | 'DISCOUNT'
  | 'RENEWAL'
  | 'REFUND';

export type FinancialReferenceType = 'INVOICE' | 'SUBSCRIPTION' | 'CUSTOMER';

export type StrictFinancialPaymentMethod = 'CASH' | 'KNET' | 'ONLINE' | 'DEBT';

export type FundingSource =
  | {
      kind: 'PAYMENT';
      paymentMethod: StrictFinancialPaymentMethod;
      amountKd: Prisma.Decimal | string | number;
      metadata?: Prisma.InputJsonObject;
    }
  | {
      kind: 'SUBSIDY';
      amountKd: Prisma.Decimal | string | number;
      metadata?: Prisma.InputJsonObject;
    }
  | {
      kind: 'DISCOUNT';
      amountKd: Prisma.Decimal | string | number;
      metadata?: Prisma.InputJsonObject;
    };

export type ProcessTransactionInput = {
  transactionType: FinancialTransactionType;
  referenceType: FinancialReferenceType;
  referenceId: string;
  actorUserId: string;
  customerId?: string | null;
  orderId?: string | null;
  branchId?: string | null;
  sourceRef?: string;
  effectiveAt?: Date | null;
  allowReversal?: boolean;
  /**
   * Customer ledger movement. Positive credits CustomerLedger/AR
   * (payment, subsidy, discount reducing what customer owes). Negative
   * debits CustomerLedger/AR (refund or renewal receivable creation).
   */
  customerLedgerCreditKd: Prisma.Decimal | string | number;
  fundingSources: FundingSource[];
  metadata?: Prisma.InputJsonObject;
};

export type ProcessTransactionResult = {
  journalEntryId: string;
  totalDebitKd: string;
  totalCreditKd: string;
};

type JournalLine = {
  accountCode: string;
  debit?: Prisma.Decimal;
  credit?: Prisma.Decimal;
  meta: Prisma.InputJsonObject;
};

@Injectable()
export class FinancialTransactionProcessorService {
  constructor(private readonly journal: DoubleEntryJournalService) {}

  async processTransaction(
    db: Db,
    input: ProcessTransactionInput,
  ): Promise<ProcessTransactionResult> {
    if (!input.actorUserId) throw new Error('PROCESS_TRANSACTION_ACTOR_REQUIRED');
    if (!input.referenceId?.trim()) {
      throw new Error('PROCESS_TRANSACTION_REFERENCE_REQUIRED');
    }
    if (input.fundingSources.length === 0) {
      throw new Error('PROCESS_TRANSACTION_FUNDING_REQUIRED');
    }

    const ledgerAmount = this.decimal(input.customerLedgerCreditKd);
    if (ledgerAmount.equals(0)) {
      throw new Error('PROCESS_TRANSACTION_LEDGER_AMOUNT_REQUIRED');
    }

    const lines: JournalLine[] = input.fundingSources.flatMap((source) =>
      this.fundingSourceToLines(input, source),
    );
    lines.push(this.customerLedgerLine(input, ledgerAmount));
    this.assertZeroSum(lines);

    const sourceRef =
      input.sourceRef ??
      `PROCESS_TRANSACTION:${input.transactionType}:${input.referenceType}:${input.referenceId}`;

    const entry = await this.journal.appendBalanced(db, {
      source: 'PROCESS_TRANSACTION',
      sourceRef,
      actorUserId: input.actorUserId,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      branchId: input.branchId ?? null,
      effectiveAt: input.effectiveAt ?? null,
      allowReversal: input.allowReversal ?? input.transactionType === 'REFUND',
      lines,
    });

    const totals = this.lineTotals(lines);
    return {
      journalEntryId: entry.id,
      totalDebitKd: totals.debit.toFixed(4),
      totalCreditKd: totals.credit.toFixed(4),
    };
  }

  private fundingSourceToLines(
    input: ProcessTransactionInput,
    source: FundingSource,
  ): JournalLine[] {
    const amount = this.positiveAmount(source.amountKd);
    const baseMeta = this.baseMeta(input, source.kind, source.metadata);

    if (source.kind === 'PAYMENT') {
      return [
        {
          accountCode: this.paymentAccount(source.paymentMethod),
          debit: amount,
          meta: {
            ...baseMeta,
            payment_method: source.paymentMethod,
          },
        },
      ];
    }

    if (source.kind === 'SUBSIDY') {
      return [
        {
          accountCode: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE,
          debit: amount,
          meta: {
            ...baseMeta,
            is_refundable: false,
            fraud_control: 'SUBSIDY_NO_CASH_OUT',
          },
        },
      ];
    }

    return [
      {
        accountCode: JOURNAL_ACCOUNTS.DEBT_DISCOUNTS,
        debit: amount,
        meta: {
          ...baseMeta,
          is_refundable: false,
          fraud_control: 'DISCOUNT_NO_CASH_OUT',
        },
      },
    ];
  }

  private customerLedgerLine(
    input: ProcessTransactionInput,
    amount: Prisma.Decimal,
  ): JournalLine {
    const meta = this.baseMeta(input, input.transactionType, input.metadata);
    if (amount.gt(0)) {
      return {
        accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        credit: amount,
        meta,
      };
    }
    return {
      accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: amount.abs(),
      meta,
    };
  }

  private paymentAccount(method: StrictFinancialPaymentMethod): string {
    if (method === 'CASH') return JOURNAL_ACCOUNTS.CASH;
    if (method === 'KNET') return JOURNAL_ACCOUNTS.BANK_KNET;
    if (method === 'ONLINE') return JOURNAL_ACCOUNTS.BANK_ONLINE;
    if (method === 'DEBT') return JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE;
    throw new Error(`UNSUPPORTED_PAYMENT_METHOD:${method satisfies never}`);
  }

  private baseMeta(
    input: ProcessTransactionInput,
    transactionType: FinancialTransactionType | FundingSource['kind'],
    metadata?: Prisma.InputJsonObject,
  ): Prisma.InputJsonObject {
    return {
      ...(metadata ?? {}),
      transaction_type: transactionType,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      customer_id: input.customerId ?? null,
      order_id: input.orderId ?? null,
    };
  }

  private assertZeroSum(lines: JournalLine[]): void {
    const totals = this.lineTotals(lines);
    if (totals.debit.sub(totals.credit).abs().gt(new Prisma.Decimal('0.001'))) {
      throw new Error('PROCESS_TRANSACTION_UNBALANCED');
    }
  }

  private lineTotals(lines: JournalLine[]): {
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
  } {
    return lines.reduce(
      (acc, line) => ({
        debit: acc.debit.add(line.debit ?? 0),
        credit: acc.credit.add(line.credit ?? 0),
      }),
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
  }

  private positiveAmount(value: Prisma.Decimal | string | number): Prisma.Decimal {
    const amount = this.decimal(value);
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('PROCESS_TRANSACTION_AMOUNT_MUST_BE_POSITIVE');
    }
    return amount;
  }

  private decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
  }
}
