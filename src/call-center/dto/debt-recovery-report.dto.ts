import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DebtRecoveryQueryDto {
  @ApiProperty({ required: false, example: '2026-04-01' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, example: '2026-04-18' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class DebtRecoveryDayRowDto {
  @ApiProperty({ example: '2026-04-18' })
  dayIso!: string;

  @ApiProperty({ example: '120.5000' })
  recoveredKd!: string;

  @ApiProperty({
    example: '70.0000',
    description:
      'V19.11.3 — Portion recovered as CASH (driver-collected). Bucketed via TransactionHistory.metadata.posPaymentMethod.',
  })
  recoveredCashKd!: string;

  @ApiProperty({
    example: '40.5000',
    description:
      'V19.11.3 — Portion recovered electronically (KNET + PAYMENT_LINK + ONLINE). Money never touched a driver.',
  })
  recoveredElectronicKd!: string;

  @ApiProperty({
    example: '10.0000',
    description:
      'V19.11.3 — Portion covered from customer wallet / subscription balance — a book entry, not cash.',
  })
  recoveredWalletKd!: string;

  @ApiProperty({ example: 4 })
  settlementCount!: number;

  @ApiProperty({ example: 2 })
  subscriptionCount!: number;

  @ApiProperty({
    example: 50,
    description:
      'Readonly chart ratio 0..100 computed by the canonical projection layer.',
  })
  trendRatio!: number;
}

export class DebtRecoveryReportDto {
  @ApiProperty({ example: '2026-04-01' })
  from!: string;

  @ApiProperty({ example: '2026-04-18' })
  to!: string;

  @ApiProperty({ example: '2350.7500' })
  totalRecoveredKd!: string;

  @ApiProperty({ example: '1200.0000' })
  totalRecoveredCashKd!: string;

  @ApiProperty({ example: '900.7500' })
  totalRecoveredElectronicKd!: string;

  @ApiProperty({ example: '250.0000' })
  totalRecoveredWalletKd!: string;

  @ApiProperty({ example: 12 })
  totalSettlements!: number;

  @ApiProperty({ example: 3 })
  totalSubscriptions!: number;

  @ApiProperty({ example: '120.5000' })
  maxRecoveredKd!: string;

  @ApiProperty({ type: [DebtRecoveryDayRowDto] })
  days!: DebtRecoveryDayRowDto[];
}
