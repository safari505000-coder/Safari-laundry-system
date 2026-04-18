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

  @ApiProperty({ example: 4 })
  settlementCount!: number;

  @ApiProperty({ example: 2 })
  subscriptionCount!: number;
}

export class DebtRecoveryReportDto {
  @ApiProperty({ example: '2026-04-01' })
  from!: string;

  @ApiProperty({ example: '2026-04-18' })
  to!: string;

  @ApiProperty({ example: '2350.7500' })
  totalRecoveredKd!: string;

  @ApiProperty({ type: [DebtRecoveryDayRowDto] })
  days!: DebtRecoveryDayRowDto[];
}
