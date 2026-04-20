import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * V19.4 — CC pack #11/#12. A single invoice bound to a subscription
 * window, returned as part of `CustomerSubscriptionRowDto.invoices[]`.
 * Minimal projection — only the fields the CC agent needs to triage;
 * full detail lives on the orders endpoint.
 */
export class SubscriptionInvoiceRowDto {
  @ApiProperty({ description: 'Order UUID (primary key of `Order`).' })
  orderId!: string;

  @ApiPropertyOptional({
    description: 'Paper invoice reference or serial, when present.',
  })
  invoiceNumber?: string;

  @ApiProperty({ description: 'Total price (4-decimal KWD).', example: '2.5000' })
  totalPriceKd!: string;

  @ApiProperty({
    description: 'Current order status (PENDING…COMPLETED, CANCELED).',
  })
  status!: string;

  @ApiProperty({
    description: 'Cash-custody status (UNPAID, PAID_TO_DRIVER, HANDED_OVER_TO_OFFICE).',
  })
  cashStatus!: string;

  @ApiProperty({ description: 'When the order was created (ISO).' })
  createdAtIso!: string;

  @ApiPropertyOptional({ description: 'When the order was completed (ISO).' })
  completedAtIso?: string;
}

/**
 * V19.4 — CC pack #12. One row in the customer's subscription chain.
 */
export class CustomerSubscriptionRowDto {
  @ApiProperty({ description: 'CustomerSubscription UUID.' })
  id!: string;

  @ApiProperty({
    description:
      'Lifecycle state: ACTIVE, EXPIRED, ROLLED_OVER, CUT_OFF, CANCELLED.',
  })
  status!: string;

  @ApiProperty({ description: 'Snapshot of the plan display name at activation.' })
  planNameSnapshot!: string;

  @ApiProperty({ description: 'Snapshot of sale price (customer paid).' })
  planSalePriceSnapshot!: string;

  @ApiProperty({ description: 'Snapshot of credit granted.' })
  planActualBalanceSnapshot!: string;

  @ApiProperty({ description: 'Days valid at activation.' })
  planValidityDaysSnapshot!: number;

  @ApiProperty({
    description:
      'Signed carry-forward from the predecessor. +credit / -debt / 0 none.',
  })
  carriedBalanceKd!: string;

  @ApiPropertyOptional({
    description: 'Predecessor in the rollover chain (null on first activation).',
  })
  parentSubscriptionId?: string;

  @ApiProperty({ description: 'Activation timestamp (ISO).' })
  activatedAtIso!: string;

  @ApiProperty({ description: 'Expiry timestamp (ISO).' })
  expiresAtIso!: string;

  @ApiPropertyOptional({
    description: 'When the row was closed (ROLLED_OVER / CUT_OFF / CANCELLED).',
  })
  closedAtIso?: string;

  @ApiPropertyOptional({ description: 'Reason code for closure (free text).' })
  closedReason?: string;

  @ApiProperty({
    description:
      'Invoices that were created while this subscription was ACTIVE. Order-by createdAt DESC.',
    type: [SubscriptionInvoiceRowDto],
  })
  invoices!: SubscriptionInvoiceRowDto[];
}
