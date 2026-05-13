import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * فترة لوحة معلومات المحاسب — اليوم أو الأسبوع أو الشهر
 * Accountant dashboard time period selector.
 */
export enum AccountantDashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * معايير استعلام لوحة معلومات المحاسب — الفترة والفرع
 * Accountant dashboard query DTO with period and optional branch scope.
 */
export class AccountantDashboardQueryDto {
  @ApiProperty({ enum: AccountantDashboardPeriod, default: AccountantDashboardPeriod.TODAY })
  @IsEnum(AccountantDashboardPeriod)
  period: AccountantDashboardPeriod = AccountantDashboardPeriod.TODAY;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
