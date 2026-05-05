import { ApiProperty } from '@nestjs/swagger';

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
