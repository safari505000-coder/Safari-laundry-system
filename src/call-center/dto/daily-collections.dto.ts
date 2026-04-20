import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { PosPaymentMethod, SafariRole } from '@prisma/client';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * V19.4 — CC pack #4. Filters for the daily collector feed.
 * `date` defaults to "today" in Asia/Kuwait.
 * `agentId` narrows to a single performer (supervisor view).
 */
export class DailyCollectionsQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-19',
    description:
      'Kuwait-local day (YYYY-MM-DD). Omit for today. Window is always [00:00, 24:00) Kuwait.',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: 'Filter to a single CC agent / collector.' })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class DailyCollectionEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() atIso!: string;

  @ApiProperty() customerId!: string;
  @ApiProperty({ nullable: true }) customerName!: string | null;
  @ApiProperty({ nullable: true }) customerPhone!: string | null;

  @ApiProperty({ nullable: true }) orderId!: string | null;
  @ApiProperty({ nullable: true }) orderSerial!: string | null;

  @ApiProperty({ example: '1.5000' }) amountCollectedKd!: string;
  @ApiProperty({ example: '0.0000' }) discountAppliedKd!: string;

  @ApiProperty({ enum: PosPaymentMethod, nullable: true })
  paymentMethod!: PosPaymentMethod | null;

  @ApiProperty({
    enum: ['PARTIAL_DEBT_PAYMENT', 'FULL_ORDER_SETTLEMENT'],
    description:
      'PARTIAL_DEBT_PAYMENT = customer-level debt reduction with optional discount (CC #1). FULL_ORDER_SETTLEMENT = an unpaid order was marked paid and the cash was collected in a single shot.',
  })
  kind!: 'PARTIAL_DEBT_PAYMENT' | 'FULL_ORDER_SETTLEMENT';

  @ApiProperty({ nullable: true }) performedByUserId!: string | null;
  @ApiProperty({ nullable: true }) performedByName!: string | null;
  @ApiProperty({ nullable: true, enum: SafariRole })
  performedByRole!: SafariRole | null;

  @ApiProperty({ nullable: true }) branchName!: string | null;
  @ApiProperty({ nullable: true }) driverName!: string | null;

  @ApiProperty({ nullable: true }) note!: string | null;

  @ApiProperty({ example: '2.5000' }) customerDebtAfterKd!: string;
}

export class DailyCollectionsAgentTotalsDto {
  @ApiProperty({ nullable: true }) agentId!: string | null;
  @ApiProperty({ nullable: true }) agentName!: string | null;
  @ApiProperty({ nullable: true, enum: SafariRole })
  agentRole!: SafariRole | null;
  @ApiProperty() eventCount!: number;
  @ApiProperty() uniqueCustomers!: number;
  @ApiProperty() collectedKd!: string;
  @ApiProperty() discountKd!: string;
}

export class DailyCollectionsResponseDto {
  @ApiProperty({ example: '2026-04-19' }) dayIsoLocal!: string;
  @ApiProperty() dayStartIso!: string;
  @ApiProperty() dayEndIso!: string;

  @ApiProperty({
    description:
      'Aggregate totals across all collectors for the selected day.',
  })
  totals!: {
    eventCount: number;
    uniqueCustomers: number;
    collectedKd: string;
    discountKd: string;
  };

  @ApiProperty({ type: [DailyCollectionsAgentTotalsDto] })
  byAgent!: DailyCollectionsAgentTotalsDto[];

  @ApiProperty({ type: [DailyCollectionEventDto] })
  events!: DailyCollectionEventDto[];
}
