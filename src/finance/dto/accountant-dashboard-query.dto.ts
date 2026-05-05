import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum AccountantDashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
}

export class AccountantDashboardQueryDto {
  @ApiProperty({ enum: AccountantDashboardPeriod, default: AccountantDashboardPeriod.TODAY })
  @IsEnum(AccountantDashboardPeriod)
  period: AccountantDashboardPeriod = AccountantDashboardPeriod.TODAY;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
