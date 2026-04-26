import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePayrollAdhocLineDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(7)
  periodYm!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  beneficiaryName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(42)
  bankIban?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowances?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lineSort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
