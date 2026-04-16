import { ExpenseStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ExpensesQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;
}
