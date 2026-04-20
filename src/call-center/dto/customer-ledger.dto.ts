import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CashStatus,
  CustomerSubscriptionStatus,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  SafariRole,
} from '@prisma/client';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * V19.4 — CC pack #8 + #10 + #11. Query params for the unified customer
 * ledger. `from`/`to` are INCLUSIVE Kuwait-local dates; when omitted the
 * endpoint returns the whole customer history (capped by `limit`).
 */
export class CustomerLedgerQueryDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-18' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ default: 200, minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  offset?: number;
}

/* ── Response shape ──────────────────────────────────────────────────── */

export class CustomerLedgerHeaderDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) displayName!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) phone2!: string | null;
  @ApiProperty({ nullable: true }) originBranchId!: string | null;
  @ApiProperty({ nullable: true }) originBranchName!: string | null;
  @ApiProperty({ example: '0.0000' }) walletBalanceKd!: string;
  @ApiProperty({ example: '0.0000' }) walletDebtKd!: string;
}

export class CustomerLedgerSubscriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CustomerSubscriptionStatus })
  status!: CustomerSubscriptionStatus;
  @ApiProperty() planNameSnapshot!: string;
  @ApiProperty() planSalePriceKd!: string;
  @ApiProperty() planActualBalanceKd!: string;
  @ApiProperty() planValidityDays!: number;
  @ApiProperty() carriedBalanceKd!: string;
  @ApiProperty({ nullable: true }) parentSubscriptionId!: string | null;
  @ApiProperty() activatedAtIso!: string;
  @ApiProperty() expiresAtIso!: string;
  @ApiProperty({ nullable: true }) closedAtIso!: string | null;
  @ApiProperty({ nullable: true }) closedReason!: string | null;
}

/**
 * Semantic type of a ledger event, narrower than the raw
 * `LedgerTransactionType` enum so UI doesn't have to re-derive meaning
 * from metadata flags on every render.
 */
export type CustomerLedgerEventKind =
  | 'SUBSCRIPTION_ACTIVATION'
  | 'SUBSCRIPTION_ROLLOVER_CARRY'
  | 'ORDER_SETTLEMENT'
  | 'PARTIAL_DEBT_PAYMENT';

export class CustomerLedgerEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() atIso!: string;
  @ApiProperty({ enum: LedgerTransactionType })
  rawType!: LedgerTransactionType;
  @ApiProperty({
    enum: [
      'SUBSCRIPTION_ACTIVATION',
      'SUBSCRIPTION_ROLLOVER_CARRY',
      'ORDER_SETTLEMENT',
      'PARTIAL_DEBT_PAYMENT',
    ],
  })
  kind!: CustomerLedgerEventKind;

  @ApiProperty({ example: '1.5000' }) amountKd!: string;
  @ApiProperty({ example: '0.0000' }) balanceBeforeKd!: string;
  @ApiProperty({ example: '1.5000' }) balanceAfterKd!: string;
  @ApiProperty({ example: '0.0000' }) debtBeforeKd!: string;
  @ApiProperty({ example: '0.0000' }) debtAfterKd!: string;

  @ApiProperty({ example: '0.0000' }) debtSettledKd!: string;
  @ApiProperty({ example: '0.0000' }) debtDiscountKd!: string;

  @ApiProperty({ nullable: true, enum: PosPaymentMethod })
  paymentMethod!: PosPaymentMethod | null;

  @ApiProperty({ nullable: true }) orderId!: string | null;
  @ApiProperty({ nullable: true }) orderSerial!: string | null;
  @ApiProperty({ nullable: true }) subscriptionId!: string | null;
  @ApiProperty({ nullable: true }) subscriptionLabel!: string | null;

  @ApiProperty({ nullable: true }) performedByUserId!: string | null;
  @ApiProperty({ nullable: true }) performedByName!: string | null;
  @ApiProperty({ nullable: true, enum: SafariRole })
  performedByRole!: SafariRole | null;

  @ApiProperty({ nullable: true }) note!: string | null;
}

export class CustomerLedgerInvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) serial!: string | null;
  @ApiProperty() createdAtIso!: string;
  @ApiProperty({ nullable: true }) completedAtIso!: string | null;
  @ApiProperty() totalKd!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty({ enum: CashStatus }) cashStatus!: CashStatus;
  @ApiProperty({ nullable: true, enum: PosPaymentMethod })
  paymentMethod!: PosPaymentMethod | null;
  @ApiProperty({ nullable: true }) driverName!: string | null;
  @ApiProperty({ nullable: true }) branchName!: string | null;
  @ApiProperty({ nullable: true }) subscriptionId!: string | null;
  @ApiProperty({ nullable: true, enum: CustomerSubscriptionStatus })
  subscriptionStatus!: CustomerSubscriptionStatus | null;
  @ApiProperty({ nullable: true }) subscriptionLabel!: string | null;
  @ApiProperty({
    description:
      'True if this invoice was issued while the customer was cut-off, based on the subscription snapshot associated with the invoice. Purely informational — the UI surfaces a "قطع" chip so agents can spot these fast.',
  })
  issuedWhileCutOff!: boolean;
  @ApiProperty({
    description:
      'True if the invoice still has money owed (UNPAID / PENDING-ish cash status and not CANCELED).',
  })
  openDebt!: boolean;
}

export class CustomerLedgerResponseDto {
  @ApiProperty({ type: CustomerLedgerHeaderDto })
  customer!: CustomerLedgerHeaderDto;

  @ApiProperty({ type: CustomerLedgerSubscriptionDto, nullable: true })
  activeSubscription!: CustomerLedgerSubscriptionDto | null;

  @ApiProperty({
    description:
      'True when the most recent subscription for this customer is in CUT_OFF state. Drives the red banner on the customer 360 page.',
  })
  isCutOff!: boolean;

  @ApiProperty({ nullable: true }) fromIso!: string | null;
  @ApiProperty({ nullable: true }) toIso!: string | null;

  @ApiProperty({ type: [CustomerLedgerEventDto] })
  events!: CustomerLedgerEventDto[];

  @ApiProperty({ type: [CustomerLedgerInvoiceDto] })
  invoices!: CustomerLedgerInvoiceDto[];

  @ApiProperty({
    description:
      'Aggregate debt-settled / discount totals over the returned event window.',
  })
  totals!: {
    eventCount: number;
    invoiceCount: number;
    openInvoiceCount: number;
    totalCollectedKd: string;
    totalDiscountedKd: string;
  };
}
