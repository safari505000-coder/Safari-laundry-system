import { ExpenseCategory, ExpenseMethod } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsOptional()
  @IsEnum(ExpenseMethod)
  expenseMethod?: ExpenseMethod;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Optional data URL or short text reference (keep under ~400kb). */
  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  receiptUrl?: string;
}
