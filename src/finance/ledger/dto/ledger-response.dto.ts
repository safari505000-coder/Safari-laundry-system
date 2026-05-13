import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO قيد دفتر الأستاذ المُسقَط — زوج مدين/دائن من الإسقاط الحتمي
 * Projected ledger entry DTO representing one side of a balanced DR/CR pair.
 */
export class LedgerEntryDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  txId!: string;
  @ApiProperty()
  accountId!: string;
  @ApiProperty({ description: 'KD, 4 decimal places. Either debit or credit is non-zero, never both.' })
  debit!: string;
  @ApiProperty({ description: 'KD, 4 decimal places.' })
  credit!: string;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  meta!: Record<string, unknown>;
}

/**
 * DTO رصيد حساب دفتر الأستاذ — مجموع المدين والدائن والرصيد الصافي
 * Ledger account balance DTO with total debit, credit, and net balance.
 */
export class LedgerAccountBalanceDto {
  @ApiProperty()
  accountId!: string;
  @ApiProperty()
  totalDebit!: string;
  @ApiProperty()
  totalCredit!: string;
  @ApiProperty({ description: 'SUM(debit) - SUM(credit). Sign-significant.' })
  balance!: string;
  @ApiProperty()
  entryCount!: number;
}

/**
 * DTO ملخص دفتر الأستاذ — إجماليات عالمية وأرصدة الحسابات
 * Ledger summary response DTO with global totals and per-account balance breakdown.
 */
export class LedgerSummaryResponseDto {
  @ApiProperty()
  source!: 'api/finance/ledger/summary';
  @ApiProperty()
  fromIso!: string;
  @ApiProperty()
  toIso!: string;
  @ApiProperty()
  totalEntries!: number;
  @ApiProperty()
  totalTransactions!: number;
  @ApiProperty()
  globalDebit!: string;
  @ApiProperty()
  globalCredit!: string;
  @ApiProperty({ type: [LedgerAccountBalanceDto] })
  accounts!: LedgerAccountBalanceDto[];
  @ApiProperty()
  generatedAt!: string;
}

/**
 * DTO استجابة حساب دفتر الأستاذ — رصيد وقيود حساب واحد
 * Ledger account response DTO with balance and entry list for a single account.
 */
export class LedgerAccountResponseDto {
  @ApiProperty()
  source!: 'api/finance/ledger/account';
  @ApiProperty()
  accountId!: string;
  @ApiProperty()
  fromIso!: string;
  @ApiProperty()
  toIso!: string;
  @ApiProperty({ type: LedgerAccountBalanceDto })
  balance!: LedgerAccountBalanceDto;
  @ApiProperty({ type: [LedgerEntryDto] })
  entries!: LedgerEntryDto[];
  @ApiProperty()
  generatedAt!: string;
}

/**
 * DTO استجابة معاملات دفتر الأستاذ — تدفق القيود مُصفّى ومُرقَّم
 * Ledger transactions response DTO with paginated entry stream.
 */
export class LedgerTransactionsResponseDto {
  @ApiProperty()
  source!: 'api/finance/ledger/transactions';
  @ApiProperty()
  fromIso!: string;
  @ApiProperty()
  toIso!: string;
  @ApiProperty()
  totalEntries!: number;
  @ApiProperty({ type: [LedgerEntryDto] })
  entries!: LedgerEntryDto[];
  @ApiProperty()
  generatedAt!: string;
}

/**
 * DTO معاملة دفتر الأستاذ غير المتوازنة
 * Unbalanced ledger transaction DTO from the reconciliation check.
 */
export class LedgerReconciliationUnbalancedDto {
  @ApiProperty()
  txId!: string;
  @ApiProperty()
  debit!: string;
  @ApiProperty()
  credit!: string;
  @ApiProperty()
  delta!: string;
}

/**
 * DTO استجابة تسوية دفتر الأستاذ — اختبار Σ مدين = Σ دائن
 * Ledger reconciliation response DTO verifying Σdebit == Σcredit invariant.
 */
export class LedgerReconciliationResponseDto {
  @ApiProperty()
  source!: 'api/finance/ledger/reconciliation';
  @ApiProperty({ enum: ['PASS', 'FAIL'] })
  status!: 'PASS' | 'FAIL';
  @ApiProperty()
  fromIso!: string;
  @ApiProperty()
  toIso!: string;
  @ApiProperty()
  totalEntries!: number;
  @ApiProperty()
  totalTransactions!: number;
  @ApiProperty()
  globalDebit!: string;
  @ApiProperty()
  globalCredit!: string;
  @ApiProperty({ type: [LedgerReconciliationUnbalancedDto] })
  unbalancedTransactions!: LedgerReconciliationUnbalancedDto[];
  @ApiProperty()
  unattributedEntries!: number;
  @ApiProperty()
  generatedAt!: string;
}
