import { ExpenseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateExpenseStatusDto {
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;
}
