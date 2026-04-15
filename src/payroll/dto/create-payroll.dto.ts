import { IsISO8601, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreatePayrollDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  branchId!: string;

  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  allowances?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsISO8601()
  paymentDate!: string;
}
