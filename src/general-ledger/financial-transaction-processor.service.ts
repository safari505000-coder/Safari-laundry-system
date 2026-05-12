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

  /**
   * V25 Deposit-then-Settle — double-entry journal entry for funding a
   * customer wallet from an external payment + optional company subsidy.
   *
   * The double-entry produced for a 20 KWD payment + 5 KWD subsidy is:
   *   DR CASH / BANK              20.0000   (payment received)
   *   DR PROMOTIONAL_EXPENSE      5.0000    (marketing support)
   *   CR WALLET_LIABILITY (2100)  25.0000   (total deposited to wallet)
   *
   * This mirrors the semantics of the plan subscription flow:
   * `plan.salePrice` = customer payment, `plan.actualBalance` = total credit.
   * The credit leg targets WALLET_LIABILITY (2100) rather than
   * ACCOUNTS_RECEIVABLE (1300) because we are creating a liability to
   * the customer (prepaid wallet balance), not reducing a receivable.
   */
  async processWalletFundingTransaction(
    db: Db,
    input: {
      actorUserId: string;
      customerId: string;
      subscriptionId: string;
      /** Payment received from customer (goes to CASH / BANK / ONLINE). */
      paymentAmountKd: Prisma.Decimal;
      /** Payment channel — maps to the asset account debited. */
      paymentMethod: StrictFinancialPaymentMethod;
      /**
       * Company marketing-support / subsidy amount debited to
       * PROMOTIONAL_EXPENSE. Pass `Decimal(0)` when there is no subsidy.
       */
      supportAmountKd: Prisma.Decimal;
      /** Total wallet credit = paymentAmountKd + supportAmountKd. */
      totalFundingKd: Prisma.Decimal;
      memo: string;
      branchId?: string | null;
    },
  ): Promise<ProcessTransactionResult> {
    const { paymentAmountKd, supportAmountKd, totalFundingKd } = input;
    const tol = new Prisma.Decimal('0.001');
    const computedTotal = paymentAmountKd.add(supportAmountKd);
    if (totalFundingKd.sub(computedTotal).abs().gt(tol)) {
      throw new Error(
        `WALLET_FUNDING_UNBALANCED: payment(${paymentAmountKd}) + support(${supportAmountKd}) ` +
          `= ${computedTotal} ≠ totalFunding(${totalFundingKd})`,
      );
    }
    if (totalFundingKd.lte(0)) {
      throw new Error('WALLET_FUNDING_AMOUNT_MUST_BE_POSITIVE');
    }

    const lines: JournalLine[] = [];

    // DEBIT: Cash / Bank (payment received from customer)
    if (paymentAmountKd.gt(0)) {
      lines.push({
        accountCode: this.paymentAccount(input.paymentMethod),
        debit: paymentAmountKd,
        meta: {
          transaction_type: 'PAYMENT',
          reference_type: 'SUBSCRIPTION',
          reference_id: input.subscriptionId,
          customer_id: input.customerId,
          payment_method: input.paymentMethod,
        },
      });
    }

    // DEBIT: Promotional Expense (company subsidy / marketing support)
    if (supportAmountKd.gt(0)) {
      lines.push({
        accountCode: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE,
        debit: supportAmountKd,
        meta: {
          transaction_type: 'SUBSIDY',
          reference_type: 'SUBSCRIPTION',
          reference_id: input.subscriptionId,
          customer_id: input.customerId,
          is_refundable: false,
          fraud_control: 'SUBSIDY_NO_CASH_OUT',
        },
      });
    }

    // CREDIT: Wallet Liability (we now owe this balance to the customer)
    lines.push({
      accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
      credit: totalFundingKd,
      meta: {
        transaction_type: 'RENEWAL',
        reference_type: 'SUBSCRIPTION',
        reference_id: input.subscriptionId,
        customer_id: input.customerId,
        total_funding: totalFundingKd.toFixed(4),
      },
    });

    this.assertZeroSum(lines);

    const sourceRef = `WALLET_FUNDING:SUBSCRIPTION:${input.subscriptionId}`;
    const entry = await this.journal.appendBalanced(db, {
      source: 'PROCESS_TRANSACTION',
      sourceRef,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: null,
      branchId: input.branchId ?? null,
      effectiveAt: null,
      allowReversal: false,
      lines,
    });

    const totals = this.lineTotals(lines);
    return {
      journalEntryId: entry.id,
      totalDebitKd: totals.debit.toFixed(4),
      totalCreditKd: totals.credit.toFixed(4),
    };
  }

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
