import { FixedExpenseCategory } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateFixedExpenseDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsEnum(FixedExpenseCategory)
  category!: FixedExpenseCategory;

  @IsNumber()
  @Min(0)
  monthlyAmount!: number;

  @IsOptional()
  effectiveFrom?: string;

  @IsOptional()
  effectiveTo?: string | null;
}
