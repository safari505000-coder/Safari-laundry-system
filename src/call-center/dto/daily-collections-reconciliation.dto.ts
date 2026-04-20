import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * V19.5 — CC reconciliation guard.
 *
 * The Daily Collector KPIs (green / amber / blue tiles) sum
 * `metadata.debtSettled` + `metadata.debtDiscount` off `TransactionHistory`
 * rows of type `ORDER_WALLET_SETTLEMENT`. Every one of those rows is
 * mirrored into `GeneralLedgerEntry` inside the same Prisma transaction
 * (see `CustomerLedgerService.recordPartialDebtPayment` and the payments
 * service's gateway / call-center manual flows), so at steady state the
 * two sources MUST agree for a given Kuwait-local day.
 *
 * This endpoint is a read-time validator: it re-aggregates both sides
 * and reports the delta. It is the last line of defence if a future
 * code path accidentally writes to one ledger but not the other — the
 * daily cron will raise a warning and the UI will show a drift badge
 * on the Collector Panel.
 */
export class DailyCollectionsReconciliationQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-19',
    description:
      'Kuwait-local day (YYYY-MM-DD). Omit for today. Window is always [00:00, 24:00) Kuwait.',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export type ReconciliationStatus = 'MATCH' | 'DRIFT';

export class ReconciliationCheckDto {
  @ApiProperty({
    description:
      'Machine-friendly identifier for this check (e.g. partialDebtCollected).',
  })
  id!: string;

  @ApiProperty({ enum: ['MATCH', 'DRIFT'] })
  status!: ReconciliationStatus;

  @ApiProperty({
    description:
      'Kuwait-day sum aggregated off TransactionHistory (4dp KWD string).',
    example: '0.0000',
  })
  transactionHistoryKd!: string;

  @ApiProperty({
    description:
      'Kuwait-day sum aggregated off GeneralLedgerEntry (4dp KWD string).',
    example: '0.0000',
  })
  generalLedgerKd!: string;

  @ApiProperty({
    description: 'generalLedgerKd − transactionHistoryKd (signed, 4dp).',
    example: '0.0000',
  })
  deltaKd!: string;

  @ApiProperty({
    description:
      'Short human-readable note for humans and Sentry breadcrumbs.',
  })
  note!: string;
}

export class DailyCollectionsReconciliationResponseDto {
  @ApiProperty({ example: '2026-04-19' }) dayIsoLocal!: string;
  @ApiProperty() dayStartIso!: string;
  @ApiProperty() dayEndIso!: string;

  @ApiProperty({ enum: ['MATCH', 'DRIFT'] })
  overallStatus!: ReconciliationStatus;

  @ApiProperty({
    description:
      'List of reconciliation checks; `overallStatus` is DRIFT when any one of them is DRIFT.',
    type: [ReconciliationCheckDto],
  })
  checks!: ReconciliationCheckDto[];

  @ApiProperty({
    description:
      'Summary of what the UI tile should show: total collected + total discount per source.',
  })
  totals!: {
    transactionHistory: { collectedKd: string; discountKd: string };
    generalLedger: { collectedKd: string; discountKd: string };
  };

  @ApiProperty() generatedAtIso!: string;
}
