import { DebtHoldStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListDebtHoldsDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsUUID()
  employeeUserId?: string;

  @IsOptional()
  @IsEnum(DebtHoldStatus)
  status?: DebtHoldStatus;
}
