import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Mirrors `OrdersService.getOperationalDebtKdBreakdown` diagnostics. */
export class DebtKdBreakdownTraceDto {
  @ApiProperty({ example: '12.7000' }) ledgerNetKd!: string;
  @ApiProperty({ example: '34.4500' }) walletSnapshotKd!: string;
  @ApiProperty({ example: '34.4500' }) orderMarketScopeKd!: string;
  /** Operational debt basis. This is NOT the canonical Customer 360 financial number. */
  @ApiProperty({ example: '34.4500' }) operationalDebtKd!: string;
  @ApiProperty({
    example: ['walletSnapshot', 'orderMarket'],
    description:
      'Which baseline(s) matched effective (ties possible). Values: ledger | walletSnapshot | orderMarket.',
    type: [String],
  })
  winningSources!: Array<'ledger' | 'walletSnapshot' | 'orderMarket'>;
}

/**
 * V19.4 — CC pack #9. Per-plan preview of what a subscription
 * activation would do to a customer's debt + wallet, without actually
 * persisting anything. Mirrors the arithmetic inside
 * `CustomerLedgerService.activateSubscriptionPlan` so the Call Center
 * UI can answer "which plan clears this debt?" before committing.
 *
 * Precision is 4dp (internal KWD precision) — the UI can round to 3dp
 * at render time if it prefers fils display.
 */
export class DebtConversionPlanOptionDto {
  @ApiProperty() planId!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() planValidityDays!: number;

  /** Cash the customer pays when activating (= plan.salePrice). */
  @ApiProperty({ example: '5.0000' })
  cashRequiredKd!: string;

  /** Service balance the customer receives (= plan.actualBalance). */
  @ApiProperty({ example: '6.0000' })
  planActualBalanceKd!: string;

  /** How much of the existing customer debt this activation will clear. */
  @ApiProperty({ example: '3.0000' })
  debtToSettleKd!: string;

  /** Debt that will still be owed after activation. */
  @ApiProperty({ example: '0.0000' })
  remainingDebtKd!: string;

  /**
   * Net prepaid credit that will be added to wallet.balance after the
   * activation is booked (= max(0, planActualBalance − debtToSettle)).
   */
  @ApiProperty({ example: '3.0000' })
  creditedToBalanceKd!: string;

  /** The customer's wallet balance AFTER activation. */
  @ApiProperty({ example: '3.0000' })
  projectedWalletBalanceKd!: string;

  /** The customer's wallet debt AFTER activation. */
  @ApiProperty({ example: '0.0000' })
  projectedWalletDebtKd!: string;

  /**
   * The goodwill subsidy (plan.actualBalance − plan.salePrice) booked
   * against the customer's origin branch. Pure advertising math — the
   * UI surfaces it for transparency.
   */
  @ApiProperty({ example: '1.0000' })
  subsidyKd!: string;

  /** True when `debtToSettleKd > 0`. */
  @ApiProperty() convertsDebt!: boolean;

  /** True when this activation will zero the customer debt. */
  @ApiProperty() clearsAllDebt!: boolean;

  /**
   * True when the plan's actual balance is at least as big as the
   * customer's current debt — the Call Center agent can recommend this
   * plan as a "debt killer" option.
   */
  @ApiProperty() recommended!: boolean;
}

export class DebtConversionOptionsResponseDto {
  @ApiProperty() customerId!: string;
  @ApiProperty({ example: '3.0000' }) currentDebtKd!: string;
  @ApiProperty({ example: '0.0000' }) currentBalanceKd!: string;
  @ApiProperty({
    description:
      'Convenience flag so the UI can hide the "Convert debt" CTA when the customer has no outstanding debt to convert.',
  })
  hasDebt!: boolean;
  @ApiPropertyOptional({
    type: DebtKdBreakdownTraceDto,
    description:
      'Included when server env EXPOSE_DEBT_BREAKDOWN=1 — three candidate totals + winners.',
  })
  debtKdBreakdownTrace?: DebtKdBreakdownTraceDto;
  @ApiProperty({ type: [DebtConversionPlanOptionDto] })
  options!: DebtConversionPlanOptionDto[];
}
