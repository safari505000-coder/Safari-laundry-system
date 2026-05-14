import { CommissionPayoutStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * استعلام قائمة مدفوعات العمولات — نطاق زمني مع فلاتر اختيارية للموظف والحالة.
 * Query DTO for listing commission payouts — date range with optional earner and status filters.
 */
export class ListCommissionPayoutsDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  earnerUserId?: string;

  @IsOptional()
  @IsEnum(CommissionPayoutStatus)
  status?: CommissionPayoutStatus;
}
