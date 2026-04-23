import { CommissionPayoutStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

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
