import { ApiProperty } from '@nestjs/swagger';

/**
 * Dastur §5 — Call Center island ops summary.
 *
 * The three KPI cards on the CRM dashboard:
 *   - RED    "إجمالي الديون السوقية"  (total accumulated customer wallet debt)
 *   - GREEN  "المحصَّل اليوم"          (debt settled via call-center-driven payments today)
 *   - YELLOW "روابط دفع معلّقة"        (unpaid ONLINE orders with a hosted payment URL)
 *
 * No net-profit / executive data here — this is an operational CRM surface.
 */
export class CallCenterOperationsSummaryDto {
  @ApiProperty({
    description:
      'Sum of CustomerWallet.debt across all customers (KWD, 4 decimals).',
    example: '1234.5600',
  })
  totalMarketDebtKd!: string;

  @ApiProperty({
    description:
      'Sum of debtSettled metadata across ORDER_WALLET_SETTLEMENT + SUBSCRIPTION_ACTIVATION transactions created today (UTC day).',
    example: '80.0000',
  })
  debtCollectedTodayKd!: string;

  @ApiProperty({
    description:
      'Count of open (non-canceled, UNPAID) orders that have a stored hosted payment URL waiting for customer action.',
    example: 12,
  })
  pendingLinksCount!: number;

  @ApiProperty({
    description: 'Reference day (UTC ISO date, YYYY-MM-DD).',
    example: '2026-04-18',
  })
  dayIso!: string;
}
