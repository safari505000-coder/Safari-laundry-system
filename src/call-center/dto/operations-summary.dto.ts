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
      'V1.6.5 / V20.x — Sum of `order.totalPrice` for `cashStatus=UNPAID` and not canceled, same `branchId` OR as the collections list (not full DebtLedger: excludes subscription overuse, etc.). Matches Σ table rows when the search box is empty.',
    example: '1234.560',
  })
  totalMarketDebtKd!: string;

  @ApiProperty({
    description:
      'V20.x — NET open INVOICE_SHORTFALL after customer-level PAYMENT waterfall (same formula as monthly P&L `outstandingInvoiceDebtKd`). Not the same as red-card UNPAID order total.',
    example: '45.000',
  })
  outstandingInvoiceDebtKd!: string;

  @ApiProperty({
    description:
      'V20.x — NET open SUBSCRIPTION_OVERUSE (subscription wallet exceeded) after waterfall. Shown next to market debt for full receivables picture.',
    example: '12.500',
  })
  outstandingSubscriptionDebtKd!: string;

  @ApiProperty({
    description:
      'V1.6.5 — Sum of `metadata.debtSettled` across ORDER_WALLET_SETTLEMENT rows tagged `debtSettlementViaLink: true`, created strictly between Kuwait-local 00:00 today and now. Resets at 00:00 Kuwait time. Scoped by `branchId` when provided. Serialized in KWD 3-decimal precision.',
    example: '80.000',
  })
  debtCollectedTodayKd!: string;

  @ApiProperty({
    description:
      'A3.D10 — Broad "debt recovered today" metric matching the Owner Debt Recovery Report formula: sum of `metadata.debtSettled` across both ORDER_WALLET_SETTLEMENT (via link + manual call-center + driver checkout shortfall) and SUBSCRIPTION_ACTIVATION rows, today (Kuwait local). This is the value the Owner report sums per day; exposed here so both surfaces can display identical numbers for the same window.',
    example: '95.000',
  })
  debtRecoveredTodayKd!: string;

  @ApiProperty({
    description:
      'Count of open (non-canceled, UNPAID) orders that have a stored hosted payment URL waiting for customer action. Scoped by `branchId` when provided.',
    example: 12,
  })
  pendingLinksCount!: number;

  @ApiProperty({
    description:
      'Reference day in Asia/Kuwait (UTC+3) local timezone, ISO YYYY-MM-DD.',
    example: '2026-04-18',
  })
  dayIso!: string;

  @ApiProperty({
    description:
      'V1.6.1 — echoed branch filter (`null` means "All Branches"). Clients use this to confirm the selection the aggregate was computed for.',
    example: null,
    required: false,
    nullable: true,
    type: String,
  })
  branchId!: string | null;
}
